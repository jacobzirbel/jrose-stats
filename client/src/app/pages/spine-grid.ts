import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SpineService } from '../spine.service';
import { spriteUrl, titleCase, type RunStatus, type SpineCell } from '../models';

/** The public 151-grid. Status color comes from `runs.status`; blue dot = has video. */
@Component({
  selector: 'app-spine-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './spine-grid.html',
  styleUrl: './spine-grid.css',
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
