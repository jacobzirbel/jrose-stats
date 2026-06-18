import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { YouTubePlayer } from '@angular/youtube-player';

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

/**
 * The workbench (Phase 1E). Keyboard-first logging: a category keybind drops a
 * claim at the current playhead, then a search-as-you-type picker chooses the
 * catalog item. Waypoints (my claims) list below; click a time to seek.
 *
 * NOTE: while the YouTube iframe itself has focus, keydown goes to it, not us —
 * click anywhere on the page (outside the player) to give keybinds focus.
 */
@Component({
  selector: 'app-workbench',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, YouTubePlayer],
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    @if (data(); as d) {
      <p><a [routerLink]="backLink()">← back</a></p>
      <h1>Logging: {{ d.video.title ?? 'Video ' + d.video.id }}</h1>

      <youtube-player [videoId]="d.video.youtubeId ?? ''" />

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
        Press a key at the playhead to tag:
        @for (c of categories(); track c.id) {
          @if (c.keybind) {
            <kbd>{{ c.keybind }}</kbd>
            <span>{{ c.label }}</span>
          }
        }
      </p>

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

      @if (picker(); as p) {
        <div class="picker-backdrop" (click)="closePicker()"></div>
        <div class="picker">
          <div class="picker-head">
            {{ p.category.label }} @ {{ time(p.timestampSec) }}
          </div>
          <input
            #searchInput
            type="text"
            [(ngModel)]="searchText"
            (ngModelChange)="search.set($event)"
            (keydown.enter)="chooseFirst()"
            placeholder="search…"
          />
          <ul class="picker-list">
            @for (item of filteredItems(); track item.id) {
              <li><button type="button" (click)="choose(item.id)">{{ item.label }}</button></li>
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

  readonly data = signal<WorkbenchData | null>(null);
  readonly notFound = signal(false);
  readonly categories = signal<Category[]>([]);
  readonly claims = signal<Claim[]>([]);
  readonly selectedRunId = signal<number | null>(null);
  readonly picker = signal<{ category: Category; timestampSec: number } | null>(null);
  readonly search = signal('');
  readonly violations = signal<Violation[]>([]);
  readonly submitted = signal(false);
  readonly submitting = signal(false);

  protected searchText = '';

  /** itemId -> display label, built once per catalog load. */
  private readonly itemIndex = computed(() => {
    const map = new Map<number, string>();
    for (const c of this.categories()) {
      for (const it of c.items) map.set(it.id, it.label);
    }
    return map;
  });

  readonly sortedClaims = computed(() =>
    [...this.claims()].sort((a, b) => a.timestampSec - b.timestampSec),
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
        // Single-run video: attribute claims to that run automatically.
        if (d.runs.length === 1) this.selectedRunId.set(d.runs[0]!.id);
      },
      error: (e) => {
        if (e.status === 401) this.router.navigateByUrl('/login');
        else this.notFound.set(true);
      },
    });
    this.api.catalog().subscribe((r) => this.categories.set(r.categories));
  }

  onKey(e: KeyboardEvent): void {
    if (this.picker()) {
      if (e.key === 'Escape') this.closePicker();
      return; // typing into the search box otherwise
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    const category = this.categories().find((c) => c.keybind === e.key);
    if (!category) return;
    e.preventDefault();
    this.openPicker(category);
  }

  private openPicker(category: Category): void {
    const timestampSec = this.player()?.getCurrentTime() ?? 0;
    if (this.settings.pauseOnPick()) this.player()?.pauseVideo();
    this.searchText = '';
    this.search.set('');
    this.picker.set({ category, timestampSec });
    setTimeout(() => this.searchInput()?.nativeElement.focus());
  }

  closePicker(): void {
    this.picker.set(null);
  }

  chooseFirst(): void {
    const first = this.filteredItems()[0];
    if (first) this.choose(first.id);
  }

  choose(catalogItemId: number): void {
    const p = this.picker();
    const log = this.data()?.log;
    if (!p || !log) return;
    this.closePicker();
    this.api
      .addClaim(log.id, {
        catalogItemId,
        timestampSec: p.timestampSec,
        runId: this.selectedRunId(),
      })
      .subscribe((claim) => this.claims.update((cs) => [...cs, claim]));
  }

  remove(claim: Claim): void {
    this.api.deleteClaim(claim.id).subscribe(() => {
      this.claims.update((cs) => cs.filter((c) => c.id !== claim.id));
    });
  }

  seek(claim: Claim): void {
    this.player()?.seekTo(claim.timestampSec, true);
  }

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
