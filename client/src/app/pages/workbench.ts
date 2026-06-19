import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { YouTubePlayer } from '@angular/youtube-player';

import { TimelineBar } from '../components/timeline-bar';
import { CanonicalService, type CanonicalRun, type FieldValue } from '../canonical.service';
import { SettingsService } from '../settings.service';
import { WorkbenchService } from '../workbench.service';
import {
  clock,
  parseClock,
  titleCase,
  type Category,
  type CategoryField,
  type Claim,
  type ClaimFieldValue,
  type Violation,
  type WorkbenchData,
} from '../models';

const SCRUB_SEC = 5;
const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** A claim's metadata fields, walked one at a time as a keyboard-first queue. */
type FieldFlow = { claim: Claim; fields: CategoryField[]; index: number };

/** One plain-language difference between my log and the other logger's. */
interface DiffLine {
  text: string;
  seekSec: number;
}

/** The other logger's claim, projected from the canonical view for comparison. */
interface OtherClaim {
  catalogItemId: number;
  label: string;
  categorySlug: string;
  timestampSec: number;
  position?: number;
  fields: FieldValue[];
}

/**
 * The workbench (Phase 1E). Keyboard-first logging: a category keybind drops a
 * claim at the playhead via a search picker; transport keys (space / arrows /
 * speed) drive playback; a catalog sidebar reminds you what's still unlogged.
 *
 * Items with metadata fields (mimic → which move; Brock → in-game time) chain
 * straight into the same picker after the claim drops — one auto-focused field
 * at a time, Enter to commit, Esc to bail. A catalog_ref field searches its
 * ref-category (all moves) — CORE only, no Pokémon knowledge in this component.
 *
 * Transport/tag keys only fire while the PAGE holds focus — the banner shows
 * when focus is in the YouTube iframe instead (full focus-capture is a TODO).
 */
@Component({
  selector: 'app-workbench',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, YouTubePlayer, TimelineBar],
  host: {
    '(document:keydown)': 'onKey($event)',
    '(document:focusin)': 'syncFocus()',
  },
  templateUrl: './workbench.html',
  styleUrl: './workbench.css',
})
export class Workbench {
  private readonly api = inject(WorkbenchService);
  private readonly canon = inject(CanonicalService);
  private readonly settings = inject(SettingsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly player = viewChild(YouTubePlayer);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly flowInput = viewChild<ElementRef<HTMLInputElement>>('flowInput');

  protected readonly scrubSec = SCRUB_SEC;

  readonly data = signal<WorkbenchData | null>(null);
  readonly notFound = signal(false);
  readonly categories = signal<Category[]>([]);
  readonly fields = signal<CategoryField[]>([]);
  readonly claims = signal<Claim[]>([]);
  readonly selectedRunId = signal<number | null>(null);
  readonly picker = signal<{ category: Category; timestampSec: number } | null>(null);
  readonly search = signal('');
  readonly activeIndex = signal(0);
  readonly violations = signal<Violation[]>([]);
  readonly submitted = signal(false);
  readonly submitting = signal(false);

  // --- reconciliation: the other logger's view, for the diff panel -----------
  readonly canonical = signal<CanonicalRun | null>(null);
  /** True once I've reopened my submitted log to edit it for reconciliation. */
  readonly editing = signal(false);
  /** Editing is allowed on a draft log: either first-time logging, or a reopened one. */
  readonly editable = computed(() => !this.submitted());
  readonly playbackRate = signal(1);
  /** Category ids whose sidebar section is collapsed (Moves starts collapsed). */
  readonly collapsed = signal<ReadonlySet<number>>(new Set());
  /** True when the YouTube iframe holds keyboard focus (keys go to it, not us). */
  readonly youtubeFocused = signal(false);

  // --- metadata field flow (keyboard-first; one field at a time) -------------
  readonly fieldFlow = signal<FieldFlow | null>(null);
  /** Values collected across the flow's fields; PUT as a batch when it ends. */
  readonly fieldDraft = signal<ReadonlyMap<number, ClaimFieldValue>>(new Map());
  readonly flowSearch = signal('');
  readonly flowActiveIndex = signal(0);
  readonly flowError = signal<string | null>(null);
  protected flowText = '';

  protected searchText = '';

  private readonly itemIndex = computed(() => {
    const map = new Map<number, string>();
    for (const c of this.categories()) for (const it of c.items) map.set(it.id, it.label);
    return map;
  });

  /** catalog item id -> its category id (for resolving a claim's applicable fields). */
  private readonly itemCategory = computed(() => {
    const map = new Map<number, number>();
    for (const c of this.categories()) for (const it of c.items) map.set(it.id, c.id);
    return map;
  });

  /** catalog item id -> its category slug (to tell gyms from events in the diff). */
  private readonly itemCatSlug = computed(() => {
    const map = new Map<number, string>();
    for (const c of this.categories()) for (const it of c.items) map.set(it.id, c.slug);
    return map;
  });

  private readonly fieldBySlug = computed(() => new Map(this.fields().map((f) => [f.slug, f])));
  private readonly fieldById = computed(() => new Map(this.fields().map((f) => [f.id, f])));

  /** The OTHER logger's claims, projected from the canonical view. */
  private readonly otherClaims = computed<OtherClaim[]>(() => {
    const cv = this.canonical();
    const myLog = this.data()?.log.id;
    if (!cv || myLog == null) return [];
    const out: OtherClaim[] = [];
    for (const f of cv.membership) {
      const sup = f.supporters.find((s) => s.logId !== myLog);
      if (sup) {
        out.push({
          catalogItemId: f.catalogItemId,
          label: f.label,
          categorySlug: f.categorySlug,
          timestampSec: sup.timestampSec,
          fields: f.fields.filter((fv) => fv.logIds.includes(sup.logId)),
        });
      }
    }
    for (const o of cv.order) {
      const sup = o.supporters.find((s) => s.logId !== myLog);
      const cand = o.candidates.find((c) => sup && c.logIds.includes(sup.logId));
      if (sup && cand) {
        out.push({
          catalogItemId: cand.catalogItemId,
          label: cand.label,
          categorySlug: o.categorySlug,
          timestampSec: sup.timestampSec,
          position: o.position,
          fields: o.fields.filter((fv) => fv.logIds.includes(sup.logId)),
        });
      }
    }
    return out;
  });

  /** Both logs have been submitted and the run is being reconciled. */
  private readonly reconciling = computed(() => {
    const s = this.canonical()?.recordState;
    return s === 'reconciling' || s === 'escalated';
  });

  /**
   * Show the reconcile panel only AFTER both blind logs are in (reconciling) or
   * once I've reopened mine to edit — never while a second logger is still
   * drafting their first pass, so blind logging stays blind.
   */
  readonly showReconcile = computed(
    () =>
      this.canonical()?.recordState !== 'live' &&
      this.otherClaims().length > 0 &&
      (this.reconciling() || this.editing()),
  );

  /** Plain-language differences between my live log and the other logger's. */
  readonly diffLines = computed<DiffLine[]>(() => {
    if (!this.showReconcile()) return [];
    const mine = this.claims();
    const other = this.otherClaims();
    const myItems = new Set(mine.map((c) => c.catalogItemId));
    const otherItems = new Set(other.map((o) => o.catalogItemId));
    const lines: DiffLine[] = [];

    // presence: who has an item the other doesn't
    for (const o of other) {
      if (!myItems.has(o.catalogItemId)) {
        lines.push({ text: `The other logger has “${this.name(o.label)}” — you don’t.`, seekSec: o.timestampSec });
      }
    }
    for (const c of mine) {
      if (!otherItems.has(c.catalogItemId)) {
        lines.push({ text: `You logged “${this.itemLabel(c.catalogItemId)}” — the other didn’t.`, seekSec: c.timestampSec });
      }
    }

    // gym order: compare the two sequences position by position
    const myGyms = mine
      .filter((c) => this.itemCatSlug().get(c.catalogItemId) === 'gyms')
      .sort((a, b) => a.timestampSec - b.timestampSec);
    const otherGyms = other.filter((o) => o.categorySlug === 'gyms').sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    for (let k = 0; k < Math.min(myGyms.length, otherGyms.length); k++) {
      if (myGyms[k]!.catalogItemId !== otherGyms[k]!.catalogItemId) {
        lines.push({
          text: `Gym #${k + 1}: you have ${this.itemLabel(myGyms[k]!.catalogItemId)}, the other has ${this.name(otherGyms[k]!.label)}.`,
          seekSec: myGyms[k]!.timestampSec,
        });
      }
    }

    // field values (mimicked move, Brock's time) on items both logged
    for (const o of other) {
      const myClaim = mine.find((c) => c.catalogItemId === o.catalogItemId);
      if (!myClaim) continue;
      const mineFv = this.myFieldView(myClaim);
      const otherFv = this.otherFieldView(o.fields);
      for (const [slug, ov] of otherFv) {
        const mv = mineFv.get(slug);
        if (mv && mv.ident !== ov.ident) {
          lines.push({
            text: `“${this.name(o.label)}” ${ov.label} differs — you: ${mv.display}, other: ${ov.display}.`,
            seekSec: myClaim.timestampSec,
          });
        }
      }
    }
    return lines;
  });

  /** Catalog items that already have a claim on this log (for "already logged" hints). */
  readonly claimedIds = computed(() => new Set(this.claims().map((c) => c.catalogItemId)));

  readonly sortedClaims = computed(() =>
    [...this.claims()].sort((a, b) => a.timestampSec - b.timestampSec),
  );

  readonly currentSec = signal(0);

  readonly timelineItems = computed(() =>
    this.sortedClaims().map((c) => ({
      id: c.id,
      timestampSec: c.timestampSec,
      label: this.itemLabel(c.catalogItemId),
    })),
  );

  readonly filteredItems = computed(() => {
    const p = this.picker();
    if (!p) return [];
    const q = this.search().trim().toLowerCase();
    const items = p.category.items;
    return q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
  });

  /** Candidates for the current flow field (catalog_ref items / enum options). */
  readonly flowItems = computed<{ key: number | string; label: string }[]>(() => {
    const f = this.flowField();
    if (!f) return [];
    const q = this.flowSearch().trim().toLowerCase();
    if (f.type === 'catalog_ref') {
      const items = this.categories().find((c) => c.slug === f.refCategorySlug)?.items ?? [];
      const hits = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
      return hits.map((i) => ({ key: i.id, label: i.label }));
    }
    if (f.type === 'enum') {
      const opts = f.options ?? [];
      const hits = q ? opts.filter((o) => o.label.toLowerCase().includes(q)) : opts;
      return hits.map((o) => ({ key: o.value, label: o.label }));
    }
    return [];
  });

  constructor() {
    const videoId = Number(this.route.snapshot.paramMap.get('videoId'));
    this.api.open(videoId).subscribe({
      next: (d) => {
        this.data.set(d);
        this.claims.set(d.claims);
        this.submitted.set(d.log.status === 'submitted');
        if (d.runs.length === 1) this.selectedRunId.set(d.runs[0]!.id);
        this.loadCanonical();
      },
      error: (e) => {
        if (e.status === 401) this.router.navigateByUrl('/login');
        else this.notFound.set(true);
      },
    });
    this.api.catalog().subscribe((r) => {
      this.categories.set(r.categories);
      this.fields.set(r.fields);
      // Moves is huge (164) and rarely useful as a reminder — start it collapsed.
      const moves = r.categories.find((c) => c.slug === 'moves');
      if (moves) this.collapsed.set(new Set([moves.id]));
    });

    // Poll the playhead (timeline marker) + refresh the keyboard-focus indicator.
    const tick = setInterval(() => {
      const t = this.player()?.getCurrentTime();
      if (typeof t === 'number') this.currentSec.set(t);
      this.syncFocus();
    }, 500);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
  }

  onKey(e: KeyboardEvent): void {
    // A modal owns the keyboard while open; its input handles typing/arrows/
    // enter via template bindings. We only intercept Escape to back out.
    if (this.picker()) {
      if (e.key === 'Escape') this.closePicker();
      return;
    }
    if (this.fieldFlow()) {
      if (e.key === 'Escape') this.closeFieldFlow();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    // Transport keys (work whenever the page holds focus).
    switch (e.key) {
      case ' ':
        e.preventDefault();
        return this.togglePlay();
      case 'ArrowLeft':
        e.preventDefault();
        return this.scrub(-SCRUB_SEC);
      case 'ArrowRight':
        e.preventDefault();
        return this.scrub(SCRUB_SEC);
      case ',':
        e.preventDefault();
        return this.cycleRate(-1);
      case '.':
        e.preventDefault();
        return this.cycleRate(1);
    }

    const category = this.categories().find((c) => c.keybind === e.key);
    if (!category) return;
    e.preventDefault();
    this.openPicker(category);
  }

  syncFocus(): void {
    this.youtubeFocused.set(document.activeElement?.tagName === 'IFRAME');
  }

  // --- playback transport -----------------------------------------------------
  private togglePlay(): void {
    const p = this.player();
    if (!p) return;
    if (p.getPlayerState() === 1) p.pauseVideo();
    else p.playVideo(); // YT.PlayerState.PLAYING === 1
  }

  private scrub(deltaSec: number): void {
    const p = this.player();
    if (!p) return;
    p.seekTo(Math.max(0, (p.getCurrentTime() ?? 0) + deltaSec), true);
  }

  private cycleRate(dir: number): void {
    const p = this.player();
    if (!p) return;
    let i = RATES.indexOf(p.getPlaybackRate?.() ?? this.playbackRate());
    if (i < 0) i = RATES.indexOf(1);
    i = Math.min(RATES.length - 1, Math.max(0, i + dir));
    p.setPlaybackRate(RATES[i]!);
    this.playbackRate.set(RATES[i]!);
  }

  // --- claim picker -----------------------------------------------------------
  private openPicker(category: Category): void {
    if (!this.editable()) return;
    const timestampSec = this.player()?.getCurrentTime() ?? 0;
    if (this.settings.pauseOnPick()) this.player()?.pauseVideo();
    this.searchText = '';
    this.search.set('');
    this.activeIndex.set(0);
    this.picker.set({ category, timestampSec });
    setTimeout(() => this.searchInput()?.nativeElement.focus());
  }

  closePicker(): void {
    this.picker.set(null);
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.activeIndex.set(0);
  }

  onArrow(delta: number, e: Event): void {
    e.preventDefault();
    const n = this.filteredItems().length;
    if (n) this.activeIndex.set(Math.min(n - 1, Math.max(0, this.activeIndex() + delta)));
  }

  chooseActive(): void {
    const item = this.filteredItems()[this.activeIndex()];
    if (item) this.choose(item.id);
  }

  choose(catalogItemId: number): void {
    const p = this.picker();
    if (!p) return;
    this.closePicker();
    this.addClaim(catalogItemId, p.timestampSec);
  }

  /** Tag a catalog item from the sidebar at the current playhead. */
  tagItem(catalogItemId: number): void {
    if (!this.editable()) return;
    this.addClaim(catalogItemId, this.player()?.getCurrentTime() ?? 0);
  }

  private addClaim(catalogItemId: number, timestampSec: number): void {
    const log = this.data()?.log;
    if (!log) return;
    this.api
      .addClaim(log.id, { catalogItemId, timestampSec, runId: this.selectedRunId() })
      .subscribe((claim) => {
        this.claims.update((cs) => [...cs, claim]);
        // Items with metadata fields chain straight into the field flow.
        if (this.fieldsForItem(catalogItemId).length) this.openFieldFlow(claim);
      });
  }

  remove(claim: Claim): void {
    if (!this.editable()) return;
    this.api.deleteClaim(claim.id).subscribe(() => {
      this.claims.update((cs) => cs.filter((c) => c.id !== claim.id));
    });
  }

  seek(claim: Claim): void {
    this.seekTo(claim.timestampSec);
  }

  seekTo(sec: number): void {
    this.player()?.seekTo(sec, true);
  }

  // --- claim metadata fields --------------------------------------------------
  /** Fields configured for a catalog item: category-wide plus item-scoped. */
  protected fieldsForItem(catalogItemId: number): CategoryField[] {
    const catId = this.itemCategory().get(catalogItemId);
    if (catId == null) return [];
    return this.fields()
      .filter((f) => f.categoryId === catId && (f.catalogItemId == null || f.catalogItemId === catalogItemId))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  protected hasFields(claim: Claim): boolean {
    return this.fieldsForItem(claim.catalogItemId).length > 0;
  }

  /** Display strings for a claim's saved field values (waypoint chips). */
  protected claimFieldSummaries(claim: Claim): string[] {
    const byId = new Map(this.fieldsForItem(claim.catalogItemId).map((f) => [f.id, f]));
    const out: string[] = [];
    for (const fv of claim.fields ?? []) {
      const f = byId.get(fv.fieldId);
      if (!f) continue;
      if (f.type === 'catalog_ref' && fv.valueCatalogItemId != null) {
        out.push(`→ ${this.itemLabel(fv.valueCatalogItemId)}`);
      } else if (fv.value != null && fv.value !== '') {
        out.push(`${f.label}: ${f.type === 'duration' ? clock(Number(fv.value)) : fv.value}`);
      }
    }
    return out;
  }

  /** The field the flow is currently prompting for. */
  protected flowField(): CategoryField | null {
    const fl = this.fieldFlow();
    return fl ? (fl.fields[fl.index] ?? null) : null;
  }

  protected flowHasList(): boolean {
    const f = this.flowField();
    return !!f && (f.type === 'catalog_ref' || f.type === 'enum');
  }

  protected flowPlaceholder(f: CategoryField): string {
    if (f.type === 'duration') return 'M:SS';
    if (f.type === 'number') return 'number';
    if (f.type === 'catalog_ref' || f.type === 'enum') return 'search…';
    return 'value…';
  }

  /** Existing value for the current field (shown as a "current:" hint on edit). */
  protected flowDraftHint(f: CategoryField): string | null {
    const d = this.fieldDraft().get(f.id);
    if (!d) return null;
    if (f.type === 'catalog_ref') {
      return d.valueCatalogItemId != null ? this.itemLabel(d.valueCatalogItemId) : null;
    }
    if (d.value == null || d.value === '') return null;
    if (f.type === 'duration') return clock(Number(d.value));
    if (f.type === 'enum') return f.options?.find((o) => o.value === d.value)?.label ?? d.value;
    return d.value;
  }

  /** Open the keyboard field flow for a claim, seeded with any saved values. */
  openFieldFlow(claim: Claim): void {
    if (this.submitted()) return;
    const fields = this.fieldsForItem(claim.catalogItemId);
    if (!fields.length) return;
    const draft = new Map<number, ClaimFieldValue>();
    for (const fv of claim.fields ?? []) draft.set(fv.fieldId, { ...fv });
    this.fieldDraft.set(draft);
    this.fieldFlow.set({ claim, fields, index: 0 });
    this.enterFlowStep(0);
  }

  closeFieldFlow(): void {
    this.fieldFlow.set(null);
  }

  private enterFlowStep(i: number): void {
    const f = this.fieldFlow()?.fields[i];
    if (!f) return;
    this.flowError.set(null);
    this.flowActiveIndex.set(0);
    // Scalar fields prefill the input with the current value (duration as M:SS);
    // list fields start with an empty search and show the current value as a hint.
    if (f.type === 'catalog_ref' || f.type === 'enum') {
      this.flowText = '';
    } else {
      const v = this.fieldDraft().get(f.id)?.value ?? null;
      this.flowText = v != null && f.type === 'duration' ? clock(Number(v)) : (v ?? '');
    }
    this.flowSearch.set(this.flowText);
    setTimeout(() => this.flowInput()?.nativeElement.focus());
  }

  onFlowInput(value: string): void {
    this.flowText = value;
    this.flowSearch.set(value);
    this.flowActiveIndex.set(0);
  }

  onFlowArrow(delta: number, e: Event): void {
    e.preventDefault();
    const n = this.flowItems().length;
    if (n) this.flowActiveIndex.set(Math.min(n - 1, Math.max(0, this.flowActiveIndex() + delta)));
  }

  /** Enter on the current field: commit (empty = skip), then advance. */
  onFlowEnter(): void {
    const f = this.flowField();
    if (!f) return;
    if (f.type === 'catalog_ref' || f.type === 'enum') {
      const item = this.flowItems()[this.flowActiveIndex()];
      if (!item) {
        if (!this.flowSearch().trim()) return this.flowNext(); // empty search = skip
        return; // typed something with no match: stay put
      }
      this.commitFlow(f, item.key);
    } else {
      const text = this.flowText.trim();
      if (!text) return this.flowNext(); // empty scalar = skip (optional)
      if (f.type === 'duration') {
        const sec = parseClock(text);
        if (sec == null) return this.flowError.set('Use M:SS (e.g. 3:42).');
        this.setDraft(f.id, { fieldId: f.id, value: String(sec), valueCatalogItemId: null });
      } else if (f.type === 'number' && !Number.isFinite(Number(text))) {
        return this.flowError.set('Enter a number.');
      } else {
        this.setDraft(f.id, { fieldId: f.id, value: text, valueCatalogItemId: null });
      }
      this.flowNext();
    }
  }

  /** Mouse click on a list candidate (keyboard is the primary path). */
  onFlowPick(key: number | string): void {
    const f = this.flowField();
    if (f) this.commitFlow(f, key);
  }

  private commitFlow(f: CategoryField, key: number | string): void {
    if (f.type === 'catalog_ref') {
      this.setDraft(f.id, { fieldId: f.id, value: null, valueCatalogItemId: Number(key) });
    } else {
      this.setDraft(f.id, { fieldId: f.id, value: String(key), valueCatalogItemId: null });
    }
    this.flowNext();
  }

  private setDraft(fieldId: number, v: ClaimFieldValue): void {
    this.fieldDraft.update((m) => new Map(m).set(fieldId, v));
  }

  private flowNext(): void {
    const fl = this.fieldFlow();
    if (!fl) return;
    const next = fl.index + 1;
    if (next >= fl.fields.length) return this.flowFinish();
    this.fieldFlow.set({ ...fl, index: next });
    this.enterFlowStep(next);
  }

  /** Past the last field: PUT the collected values, then close (stay open on error). */
  private flowFinish(): void {
    const fl = this.fieldFlow();
    if (!fl) return;
    const values: ClaimFieldValue[] = [];
    for (const f of fl.fields) {
      const d = this.fieldDraft().get(f.id);
      if (!d) continue;
      if (f.type === 'catalog_ref') {
        if (d.valueCatalogItemId != null) values.push(d);
      } else if (d.value != null && d.value !== '') {
        values.push(d);
      }
    }
    const claimId = fl.claim.id;
    this.api.saveClaimFields(claimId, values).subscribe({
      next: (res) => {
        this.claims.update((cs) => cs.map((c) => (c.id === claimId ? { ...c, fields: res.fields } : c)));
        this.closeFieldFlow();
      },
      error: () => this.flowError.set('Save failed — Enter to retry.'),
    });
  }

  // --- sidebar ----------------------------------------------------------------
  toggleCollapse(catId: number): void {
    this.collapsed.update((s) => {
      const next = new Set(s);
      next.has(catId) ? next.delete(catId) : next.add(catId);
      return next;
    });
  }
  protected isCollapsed(catId: number): boolean {
    return this.collapsed().has(catId);
  }
  protected loggedCount(c: Category): number {
    const claimed = this.claimedIds();
    return c.items.filter((it) => claimed.has(it.id)).length;
  }

  // --- submit -----------------------------------------------------------------
  submit(): void {
    const log = this.data()?.log;
    if (!log) return;
    this.submitting.set(true);
    this.violations.set([]);
    this.api.submit(log.id).subscribe({
      next: () => {
        this.submitted.set(true);
        this.submitting.set(false);
        this.editing.set(false);
        this.loadCanonical();
      },
      error: (e) => {
        this.violations.set(
          e.status === 422 && e.error?.violations?.length
            ? e.error.violations
            : [{ code: 'error', message: 'Submit failed.' }],
        );
        this.submitting.set(false);
      },
    });
  }

  // --- reconciliation ---------------------------------------------------------
  private loadCanonical(): void {
    const runId = this.selectedRunId();
    if (runId == null) return;
    this.canon.getRun(runId).subscribe({
      next: (cv) => this.canonical.set(cv),
      error: () => this.canonical.set(null),
    });
  }

  /** Pick which run we're tagging / diffing against (multi-run videos). */
  setRun(runId: number): void {
    this.selectedRunId.set(runId);
    this.loadCanonical();
  }

  /** Reopen my submitted log so I can edit it to reconcile. */
  reopen(): void {
    const log = this.data()?.log;
    if (!log) return;
    this.api.reopen(log.id).subscribe(() => {
      this.submitted.set(false);
      this.editing.set(true);
      this.loadCanonical();
    });
  }

  /** Re-timestamp a claim to the current playhead — fixes gym order during reconcile. */
  retimeToPlayhead(claim: Claim): void {
    if (!this.editable()) return;
    const t = Math.floor(this.player()?.getCurrentTime() ?? 0);
    this.api.setTimestamp(claim.id, t).subscribe(() => {
      this.claims.update((cs) => cs.map((c) => (c.id === claim.id ? { ...c, timestampSec: t } : c)));
    });
  }

  /** Fallback: hand the run to an admin when the loggers can't converge. */
  protected escalate(): void {
    const runId = this.selectedRunId();
    if (runId == null) return;
    this.canon.escalate(runId).subscribe(() => this.loadCanonical());
  }

  private myFieldView(claim: Claim): Map<string, { ident: string; display: string; label: string }> {
    const out = new Map<string, { ident: string; display: string; label: string }>();
    for (const fv of claim.fields ?? []) {
      const f = this.fieldById().get(fv.fieldId);
      if (!f) continue;
      const ident = fv.valueCatalogItemId != null ? `c${fv.valueCatalogItemId}` : `v${fv.value ?? ''}`;
      const display =
        fv.valueCatalogItemId != null
          ? this.itemLabel(fv.valueCatalogItemId)
          : f.type === 'duration' && fv.value != null
            ? clock(Number(fv.value))
            : (fv.value ?? '');
      out.set(f.slug, { ident, display, label: f.label });
    }
    return out;
  }

  private otherFieldView(fields: FieldValue[]): Map<string, { ident: string; display: string; label: string }> {
    const out = new Map<string, { ident: string; display: string; label: string }>();
    for (const fv of fields) {
      // The slug isn't unique across item-scoped fields (mimic / mirror-move /
      // metronome all use `copied-move`), so trust the field's OWN label that
      // the canonical view already resolved — don't re-look it up by slug.
      const f = this.fieldBySlug().get(fv.slug);
      const ident = fv.valueCatalogItemId != null ? `c${fv.valueCatalogItemId}` : `v${fv.value ?? ''}`;
      const display =
        fv.valueLabel ?? (f?.type === 'duration' && fv.value != null ? clock(Number(fv.value)) : (fv.value ?? ''));
      out.set(fv.slug, { ident, display, label: fv.label });
    }
    return out;
  }

  protected time = clock;
  protected name = titleCase;
  protected itemLabel(id: number): string {
    return this.itemIndex().get(id) ?? `#${id}`;
  }
  protected runName(d: WorkbenchData, runId: number): string {
    const r = d.runs.find((x) => x.id === runId);
    return r ? titleCase(r.name) : '';
  }
  protected backLink(): string {
    const dex = this.data()?.runs[0]?.pokemonDex;
    return dex ? `/pokemon/${dex}` : '/';
  }
}
