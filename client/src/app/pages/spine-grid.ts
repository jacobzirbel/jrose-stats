import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SpineService } from '../spine.service';
import { spriteUrl, titleCase, type RunStatus, type SpineCell } from '../models';

/** The public 151-grid. Status color comes from `runs.status`; blue dot = has video. */
@Component({
  selector: 'app-spine-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <h1>The 151</h1>
    <div class="toolbar">
      Sort:
      <button type="button" [class.active]="sort() === 'playlist'" (click)="setSort('playlist')">
        Playlist
      </button>
      <button type="button" [class.active]="sort() === 'dex'" (click)="setSort('dex')">Dex</button>
      <span class="hint">blue dot = has video</span>
    </div>

    <ul class="grid">
      @for (cell of cells(); track cell.dex) {
        <li>
          <a
            class="cell"
            [attr.data-status]="cell.status"
            [routerLink]="['/pokemon', cell.dex]"
            [title]="label(cell)"
          >
            @if (cell.videoCount > 0) {
              <span class="dot"></span>
            }
            <span class="dex">#{{ cell.dex }}</span>
            <img [src]="sprite(cell.dex)" alt="" loading="lazy" />
            <span class="name">{{ name(cell.name) }}</span>
          </a>
        </li>
      }
    </ul>
  `,
  styles: `
    .toolbar { margin: 0.5rem 0; font-size: 0.85rem; color: #666; }
    .toolbar button { margin-right: 0.25rem; background: none; border: 1px solid #ccc; padding: 1px 6px; }
    .toolbar button.active { font-weight: 700; border-color: #888; }
    .toolbar .hint { margin-left: 0.5rem; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .cell {
      position: relative;
      display: block;
      padding: 2px;
      border: 1px solid var(--c, #ccc);
      color: inherit;
      text-align: center;
      text-decoration: none;
    }
    .cell:hover { background: #f2f2f2; }
    .cell img { display: block; margin: 0 auto; width: 48px; height: 48px; image-rendering: pixelated; }
    .cell .dex { display: block; font-size: 0.6rem; color: #999; }
    .cell .name { display: block; font-size: 0.65rem; }
    .cell[data-status='in_progress'] { --c: #e0a200; }
    .cell[data-status='done'] { --c: #2e9e2e; }
    .cell[data-status='impossible_abandoned'] { --c: #cc3333; }
    .dot {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #2563eb;
    }
  `,
})
export class SpineGrid {
  private readonly api = inject(SpineService);

  readonly sort = signal<'dex' | 'playlist'>('playlist');
  readonly cells = signal<SpineCell[]>([]);

  constructor() {
    this.load();
  }

  setSort(sort: 'dex' | 'playlist'): void {
    if (sort === this.sort()) return;
    this.sort.set(sort);
    this.load();
  }

  private load(): void {
    this.api.getSpine(this.sort()).subscribe((r) => this.cells.set(r.cells));
  }

  protected sprite = spriteUrl;
  protected name = titleCase;
  protected label(cell: SpineCell): string {
    return `${titleCase(cell.name)} — ${this.statusLabel[cell.status]}`;
  }

  private readonly statusLabel: Record<RunStatus, string> = {
    untouched: 'Untouched',
    in_progress: 'In progress',
    done: 'Done',
    impossible_abandoned: 'Abandoned',
  };
}
