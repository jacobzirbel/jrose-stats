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

/** Picker over a category's items: drop a claim, or fill a claim's catalog_ref field. */
type PickerState =
  | { mode: 'claim'; category: Category; timestampSec: number }
  | { mode: 'field'; category: Category; field: CategoryField };

/**
 * The workbench (Phase 1E). Keyboard-first logging: a category keybind drops a
 * claim at the playhead via a search picker; transport keys (space / arrows /
 * speed) drive playback; a catalog sidebar reminds you what's still unlogged.
 *
 * Some catalog items carry extra metadata fields (e.g. tagging "mimic" then
 * asks which move it produced; the Brock gym asks the in-game time). Dropping
 * such a claim opens the field editor; a catalog_ref field reuses this same
 * picker over the field's ref-category — all CORE, no Pokémon knowledge here.
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
  private readonly settings = inject(SettingsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly player = viewChild(YouTubePlayer);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly scrubSec = SCRUB_SEC;

  readonly data = signal<WorkbenchData | null>(null);
  readonly notFound = signal(false);
  readonly categories = signal<Category[]>([]);
  readonly fields = signal<CategoryField[]>([]);
  readonly claims = signal<Claim[]>([]);
  readonly selectedRunId = signal<number | null>(null);
  readonly picker = signal<PickerState | null>(null);
  readonly search = signal('');
  readonly activeIndex = signal(0);
  readonly violations = signal<Violation[]>([]);
  readonly submitted = signal(false);
  readonly submitting = signal(false);
  readonly playbackRate = signal(1);
  /** Category ids whose sidebar section is collapsed (Moves starts collapsed). */
  readonly collapsed = signal<ReadonlySet<number>>(new Set());
  /** True when the YouTube iframe holds keyboard focus (keys go to it, not us). */
  readonly youtubeFocused = signal(false);

  /** Open metadata-field editor for a claim; draft holds edits until Save. */
  readonly fieldEditor = signal<{ claim: Claim } | null>(null);
  readonly fieldDraft = signal<ReadonlyMap<number, ClaimFieldValue>>(new Map());
  readonly fieldError = signal<string | null>(null);

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

  constructor() {
    const videoId = Number(this.route.snapshot.paramMap.get('videoId'));
    this.api.open(videoId).subscribe({
      next: (d) => {
        this.data.set(d);
        this.claims.set(d.claims);
        this.submitted.set(d.log.status === 'submitted');
        if (d.runs.length === 1) this.selectedRunId.set(d.runs[0]!.id);
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
    // A modal owns the keyboard while open; Escape backs out (picker first).
    if (this.picker() || this.fieldEditor()) {
      if (e.key === 'Escape') {
        if (this.picker()) this.closePicker();
        else this.closeFieldEditor();
      }
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

  // --- picker -----------------------------------------------------------------
  private openPicker(category: Category): void {
    const timestampSec = this.player()?.getCurrentTime() ?? 0;
    if (this.settings.pauseOnPick()) this.player()?.pauseVideo();
    this.resetPickerInput();
    this.picker.set({ mode: 'claim', category, timestampSec });
    setTimeout(() => this.searchInput()?.nativeElement.focus());
  }

  /** Open the picker over a catalog_ref field's ref-category (e.g. all moves). */
  openFieldPicker(field: CategoryField): void {
    const category = this.categories().find((c) => c.slug === field.refCategorySlug);
    if (!category) return;
    this.resetPickerInput();
    this.picker.set({ mode: 'field', category, field });
    setTimeout(() => this.searchInput()?.nativeElement.focus());
  }

  private resetPickerInput(): void {
    this.searchText = '';
    this.search.set('');
    this.activeIndex.set(0);
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
    if (p.mode === 'claim') {
      this.closePicker();
      this.addClaim(catalogItemId, p.timestampSec);
    } else {
      // field mode: stash the reference in the editor draft, return to the editor.
      this.setDraftRef(p.field.id, catalogItemId);
      this.closePicker();
    }
  }

  /** Tag a catalog item from the sidebar at the current playhead. */
  tagItem(catalogItemId: number): void {
    this.addClaim(catalogItemId, this.player()?.getCurrentTime() ?? 0);
  }

  private addClaim(catalogItemId: number, timestampSec: number): void {
    const log = this.data()?.log;
    if (!log) return;
    this.api
      .addClaim(log.id, { catalogItemId, timestampSec, runId: this.selectedRunId() })
      .subscribe((claim) => {
        this.claims.update((cs) => [...cs, claim]);
        // Items with metadata fields prompt immediately (mimic -> which move, etc.).
        if (this.fieldsForItem(catalogItemId).length) this.openFieldEditor(claim);
      });
  }

  remove(claim: Claim): void {
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

  openFieldEditor(claim: Claim): void {
    if (this.submitted()) return;
    const byId = new Map(this.fieldsForItem(claim.catalogItemId).map((f) => [f.id, f]));
    const draft = new Map<number, ClaimFieldValue>();
    for (const fv of claim.fields ?? []) {
      const f = byId.get(fv.fieldId);
      // Show duration as M:SS in the input; everything else round-trips as text.
      const value =
        f?.type === 'duration' && fv.value != null ? clock(Number(fv.value)) : fv.value;
      draft.set(fv.fieldId, { fieldId: fv.fieldId, value, valueCatalogItemId: fv.valueCatalogItemId });
    }
    this.fieldDraft.set(draft);
    this.fieldError.set(null);
    this.fieldEditor.set({ claim });
  }

  closeFieldEditor(): void {
    this.fieldEditor.set(null);
  }

  protected draftText(field: CategoryField): string {
    return this.fieldDraft().get(field.id)?.value ?? '';
  }

  protected draftRefLabel(field: CategoryField): string | null {
    const id = this.fieldDraft().get(field.id)?.valueCatalogItemId;
    return id != null ? this.itemLabel(id) : null;
  }

  setDraftValue(fieldId: number, value: string): void {
    this.fieldDraft.update((m) => new Map(m).set(fieldId, { fieldId, value, valueCatalogItemId: null }));
  }

  private setDraftRef(fieldId: number, valueCatalogItemId: number): void {
    this.fieldDraft.update((m) =>
      new Map(m).set(fieldId, { fieldId, value: null, valueCatalogItemId }),
    );
  }

  saveFields(): void {
    const ed = this.fieldEditor();
    if (!ed) return;
    const draft = this.fieldDraft();
    const values: ClaimFieldValue[] = [];
    for (const f of this.fieldsForItem(ed.claim.catalogItemId)) {
      const d = draft.get(f.id);
      if (!d) continue;
      if (f.type === 'catalog_ref') {
        if (d.valueCatalogItemId != null) {
          values.push({ fieldId: f.id, value: null, valueCatalogItemId: d.valueCatalogItemId });
        }
        continue;
      }
      const text = (d.value ?? '').trim();
      if (!text) continue; // empty scalar = leave unset
      if (f.type === 'duration') {
        const sec = parseClock(text);
        if (sec == null) {
          this.fieldError.set(`"${f.label}" — use M:SS (e.g. 3:42).`);
          return;
        }
        values.push({ fieldId: f.id, value: String(sec), valueCatalogItemId: null });
      } else {
        values.push({ fieldId: f.id, value: text, valueCatalogItemId: null });
      }
    }
    this.api.saveClaimFields(ed.claim.id, values).subscribe({
      next: (res) => {
        this.claims.update((cs) =>
          cs.map((c) => (c.id === ed.claim.id ? { ...c, fields: res.fields } : c)),
        );
        this.closeFieldEditor();
      },
      error: () => this.fieldError.set('Save failed.'),
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
