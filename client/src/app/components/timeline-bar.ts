import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export interface TimelineItem {
  id: number;
  timestampSec: number;
  label: string;
}

interface PlacedItem extends TimelineItem {
  xPct: number;
  lane: number;
}

/** Label footprint as a % of width — the horizontal collision threshold. */
const LABEL_PCT = 14;
const LANE_H = 20; // px between stacked label rows
const LABEL_BASE = 14; // px from the top down to the lane-0 label
const LABEL_H = 18; // px for the bottom label row

/**
 * Dumb timeline renderer (Phase 1E). The bar sits on top with a marker per item;
 * labels hang BELOW it, stacked into lanes when they'd collide — most-recent
 * nearest the bar (lane 0), older pushed down. Stateless: emits `seek(sec)` on
 * marker/label click. The same component later renders public consensus (Phase 5).
 */
@Component({
  selector: 'app-timeline-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="timeline" [style.height.px]="heightPx()">
      <div class="bar"></div>
      @if (durationSec()) {
        <div class="playhead" [style.left.%]="playheadPct()"></div>
      }
      @for (it of placed(); track it.id) {
        <div class="leader" [style.left.%]="it.xPct" [style.height.px]="labelTop(it) - 6"></div>
        <button
          class="marker"
          type="button"
          [style.left.%]="it.xPct"
          (click)="seek.emit(it.timestampSec)"
        ></button>
        <button
          class="label"
          type="button"
          [style.left.%]="it.xPct"
          [style.top.px]="labelTop(it)"
          [title]="it.label"
          (click)="seek.emit(it.timestampSec)"
        >
          {{ it.label }}
        </button>
      }
    </div>
  `,
  styles: `
    .timeline { position: relative; width: 100%; margin: 0.75rem 0; }
    .bar { position: absolute; top: 5px; left: 0; right: 0; height: 2px; background: #ccc; }
    .marker {
      position: absolute; top: 2px; width: 8px; height: 8px; padding: 0;
      border: none; border-radius: 50%; background: #2563eb;
      transform: translateX(-50%); cursor: pointer;
    }
    .leader {
      position: absolute; top: 6px; width: 1px; background: #c4c4c4;
      transform: translateX(-50%);
    }
    .label {
      position: absolute; transform: translateX(-50%);
      max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      font-size: 0.7rem; line-height: 1.4;
      background: #fff; border: 1px solid #ddd; border-radius: 3px; padding: 0 3px;
      cursor: pointer;
    }
    .playhead {
      position: absolute; top: 0; bottom: 0; width: 2px; background: #e0a200;
      transform: translateX(-50%);
    }
  `,
})
export class TimelineBar {
  readonly items = input.required<TimelineItem[]>();
  readonly durationSec = input<number | null>(null);
  readonly currentSec = input(0);
  readonly seek = output<number>();

  private readonly scale = computed(() => {
    const d = this.durationSec();
    if (d && d > 0) return d;
    const max = Math.max(0, ...this.items().map((i) => i.timestampSec));
    return max > 0 ? max * 1.05 : 1;
  });

  /** Lanes below the bar: most-recent first claims lane 0 (nearest the bar). */
  readonly placed = computed<PlacedItem[]>(() => {
    const scale = this.scale();
    const sorted = [...this.items()].sort((a, b) => b.timestampSec - a.timestampSec);
    const lanes: number[][] = [];
    return sorted.map((it) => {
      const xPct = Math.min(100, Math.max(0, (it.timestampSec / scale) * 100));
      let lane = 0;
      for (;;) {
        const row = lanes[lane] ?? (lanes[lane] = []);
        if (row.every((x) => Math.abs(x - xPct) >= LABEL_PCT)) {
          row.push(xPct);
          break;
        }
        lane++;
      }
      return { ...it, xPct, lane };
    });
  });

  private readonly laneCount = computed(() => Math.max(1, ...this.placed().map((p) => p.lane + 1)));
  readonly heightPx = computed(() => LABEL_BASE + (this.laneCount() - 1) * LANE_H + LABEL_H);

  protected labelTop(it: PlacedItem): number {
    return LABEL_BASE + it.lane * LANE_H;
  }

  protected playheadPct(): number {
    return Math.min(100, Math.max(0, (this.currentSec() / this.scale()) * 100));
  }
}
