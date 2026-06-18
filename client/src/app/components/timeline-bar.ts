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
const BASE = 14; // px from the bar up to the lane-0 label
const LABEL_H = 18; // px for the top label row

/**
 * Dumb timeline renderer (Phase 1E). Positions a marker per item by timestamp,
 * draws a leader line up to its label, and STACKS labels into lanes when they'd
 * collide — earliest in the low lane, so the most-recent in a cluster sits on
 * top. Stateless: emits `seek(sec)` on marker/label click. The same component
 * will later render public consensus (Phase 5).
 */
@Component({
  selector: 'app-timeline-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="timeline" [style.height.px]="heightPx()">
      @for (it of placed(); track it.id) {
        <div class="leader" [style.left.%]="it.xPct" [style.height.px]="labelBottom(it) - 4"></div>
        <button
          class="label"
          type="button"
          [style.left.%]="it.xPct"
          [style.bottom.px]="labelBottom(it)"
          [title]="it.label"
          (click)="seek.emit(it.timestampSec)"
        >
          {{ it.label }}
        </button>
        <button
          class="marker"
          type="button"
          [style.left.%]="it.xPct"
          (click)="seek.emit(it.timestampSec)"
        ></button>
      }
      <div class="bar"></div>
      @if (durationSec()) {
        <div class="playhead" [style.left.%]="playheadPct()"></div>
      }
    </div>
  `,
  styles: `
    .timeline { position: relative; width: 100%; margin: 0.75rem 0; }
    .bar { position: absolute; left: 0; right: 0; bottom: 4px; height: 2px; background: #ccc; }
    .marker {
      position: absolute; bottom: 1px; width: 8px; height: 8px; padding: 0;
      border: none; border-radius: 50%; background: #2563eb;
      transform: translateX(-50%); cursor: pointer;
    }
    .leader {
      position: absolute; bottom: 4px; width: 1px; background: #c4c4c4;
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

  /** Timeline length: video duration, else the latest tag (so it still renders). */
  private readonly scale = computed(() => {
    const d = this.durationSec();
    if (d && d > 0) return d;
    const max = Math.max(0, ...this.items().map((i) => i.timestampSec));
    return max > 0 ? max * 1.05 : 1;
  });

  /** Assign lanes: earliest claims take low lanes; collisions bump later ones up. */
  readonly placed = computed<PlacedItem[]>(() => {
    const scale = this.scale();
    const sorted = [...this.items()].sort((a, b) => a.timestampSec - b.timestampSec);
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
  readonly heightPx = computed(() => BASE + (this.laneCount() - 1) * LANE_H + LABEL_H);

  protected labelBottom(it: PlacedItem): number {
    return BASE + it.lane * LANE_H;
  }

  protected playheadPct(): number {
    return Math.min(100, Math.max(0, (this.currentSec() / this.scale()) * 100));
  }
}
