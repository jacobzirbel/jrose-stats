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
  titleCase,
  type Category,
  type Claim,
  type Violation,
  type WorkbenchData,
} from '../models';

const SCRUB_SEC = 5;
const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/**
 * The workbench (Phase 1E). Keyboard-first logging: a category keybind drops a
 * claim at the playhead via a search picker; transport keys (space / arrows /
 * speed) drive playback; a catalog sidebar reminds you what's still unlogged.
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
  template: `
    @if (data(); as d) {
      <p><a [routerLink]="backLink()">← back</a></p>
      <h1>Logging: {{ d.video.title ?? 'Video ' + d.video.id }}</h1>

      <div class="wb">
        <div class="wb-main">
          <div class="player" [class.youtube-focus]="youtubeFocused()">
            <youtube-player [videoId]="d.video.youtubeId ?? ''" />
          </div>
          <div class="kbd-status" [class.to-youtube]="youtubeFocused()">
            @if (youtubeFocused()) {
              ▶ Keyboard is going to YouTube — click the page to use shortcuts
            } @else {
              ⌨ Shortcuts active · space play/pause · ←/→ scrub {{ scrubSec }}s · ,/. speed
              ({{ playbackRate() }}×)
            }
          </div>

          @if (d.runs.length > 1) {
            <div class="runbar">
              Tagging run:
              @for (r of d.runs; track r.id) {
                <button
                  type="button"
                  [class.active]="selectedRunId() === r.id"
                  (click)="selectedRunId.set(r.id)"
                >
                  {{ name(r.name) }}
                </button>
              }
            </div>
          }

          <p class="hint">
            Tag at playhead:
            @for (c of categories(); track c.id) {
              @if (c.keybind) {
                <kbd>{{ c.keybind }}</kbd><span>{{ c.label }}</span>
              }
            }
          </p>

          <app-timeline-bar
            [items]="timelineItems()"
            [durationSec]="d.video.durationSec"
            [currentSec]="currentSec()"
            (seek)="seekTo($event)"
          />

          <h2>Waypoints ({{ sortedClaims().length }})</h2>
          @if (sortedClaims().length === 0) {
            <p class="muted">No tags yet.</p>
          } @else {
            <ul class="waypoints">
              @for (claim of sortedClaims(); track claim.id) {
                <li>
                  <button type="button" class="ts" (click)="seek(claim)">{{ time(claim.timestampSec) }}</button>
                  <span>{{ itemLabel(claim.catalogItemId) }}</span>
                  @if (claim.runId && runName(d, claim.runId); as rn) {
                    <span class="muted">· {{ rn }}</span>
                  }
                  <button type="button" class="del" (click)="remove(claim)">✕</button>
                </li>
              }
            </ul>
          }

          <div class="submit">
            @if (submitted()) {
              <p class="ok">✓ Submitted.</p>
            } @else {
              @if (violations().length) {
                <ul class="violations">
                  @for (v of violations(); track $index) {
                    <li>{{ v.message }}</li>
                  }
                </ul>
              }
              <button type="button" (click)="submit()" [disabled]="submitting()">Submit log</button>
            }
          </div>
        </div>

        <aside class="wb-side">
          <h3>Catalog</h3>
          @for (c of categories(); track c.id) {
            <div class="cat">
              <button type="button" class="cat-head" (click)="toggleCollapse(c.id)">
                <span>{{ isCollapsed(c.id) ? '▸' : '▾' }} {{ c.label }}</span>
                <span class="muted">{{ loggedCount(c) }}/{{ c.items.length }}</span>
              </button>
              @if (!isCollapsed(c.id)) {
                <ul class="cat-items">
                  @for (it of c.items; track it.id) {
                    <li>
                      <button
                        type="button"
                        class="cat-item"
                        [class.logged]="claimedIds().has(it.id)"
                        [title]="'Tag at ' + time(currentSec())"
                        (click)="tagItem(it.id)"
                      >
                        {{ claimedIds().has(it.id) ? '✓ ' : '' }}{{ it.label }}
                      </button>
                    </li>
                  } @empty {
                    <li class="muted">none</li>
                  }
                </ul>
              }
            </div>
          }
        </aside>
      </div>

      @if (picker(); as p) {
        <div class="picker-backdrop" (click)="closePicker()"></div>
        <div class="picker">
          <div class="picker-head">{{ p.category.label }} @ {{ time(p.timestampSec) }}</div>
          <input
            #searchInput
            type="text"
            [(ngModel)]="searchText"
            (ngModelChange)="onSearch($event)"
            (keydown.arrowdown)="onArrow(1, $event)"
            (keydown.arrowup)="onArrow(-1, $event)"
            (keydown.enter)="chooseActive()"
            placeholder="search…"
          />
          <ul class="picker-list">
            @for (item of filteredItems(); track item.id; let i = $index) {
              <li>
                <button type="button" [class.active]="i === activeIndex()" (click)="choose(item.id)">
                  {{ item.label }}
                  @if (claimedIds().has(item.id)) {
                    <span class="logged">✓ logged</span>
                  }
                </button>
              </li>
            } @empty {
              <li class="muted">no match</li>
            }
          </ul>
        </div>
      }
    } @else if (notFound()) {
      <p>Couldn't open this video for logging.</p>
    }
  `,
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
  readonly claims = signal<Claim[]>([]);
  readonly selectedRunId = signal<number | null>(null);
  readonly picker = signal<{ category: Category; timestampSec: number } | null>(null);
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

  protected searchText = '';

  private readonly itemIndex = computed(() => {
    const map = new Map<number, string>();
    for (const c of this.categories()) for (const it of c.items) map.set(it.id, it.label);
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
    if (this.picker()) {
      if (e.key === 'Escape') this.closePicker();
      return; // the picker input owns keys while open
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
    this.addClaim(catalogItemId, this.player()?.getCurrentTime() ?? 0);
  }

  private addClaim(catalogItemId: number, timestampSec: number): void {
    const log = this.data()?.log;
    if (!log) return;
    this.api
      .addClaim(log.id, { catalogItemId, timestampSec, runId: this.selectedRunId() })
      .subscribe((claim) => this.claims.update((cs) => [...cs, claim]));
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
