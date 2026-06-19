import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { YouTubePlayer } from '@angular/youtube-player';

import { AuthService } from '../auth.service';
import {
  CanonicalService,
  type CanonicalRun,
  type MembershipFact,
  type OrderFact,
  type RecordState,
  type ReviewAction,
  type Supporter,
} from '../canonical.service';
import { clock, titleCase } from '../models';

/**
 * The canonical record for a run — the read-side VIEW over claims plus the
 * review controls. Facts show their standing (canonical / pending / contested /
 * overturned), how many independent logs back them, and the supporting claims.
 * Any signed-in user can Contest / Certify / Overturn a fact (Phase-2 review,
 * role-gating deferred); the action re-derives the view.
 */
@Component({
  selector: 'app-run-record',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, YouTubePlayer],
  templateUrl: './run-record.html',
  styleUrl: './run-record.css',
})
export class RunRecord {
  private readonly api = inject(CanonicalService);
  private readonly route = inject(ActivatedRoute);
  protected readonly auth = inject(AuthService);

  private readonly player = viewChild(YouTubePlayer);
  private pendingSeek: number | null = null;

  readonly run = signal<CanonicalRun | null>(null);
  readonly notFound = signal(false);
  /** Set when the run exists but isn't live yet and we're not one of its loggers. */
  readonly gatedState = signal<RecordState | null>(null);
  readonly activeVideoId = signal<string>('');
  protected readonly runId = Number(this.route.snapshot.paramMap.get('runId'));

  constructor() {
    this.load();
  }

  protected load(): void {
    this.api.getRun(this.runId).subscribe({
      next: (r) => {
        this.run.set(r);
        if (!this.activeVideoId() && r.videos[0]?.youtubeId) this.activeVideoId.set(r.videos[0].youtubeId);
      },
      error: (e: HttpErrorResponse) => {
        if (e.status === 403) this.gatedState.set(e.error?.recordState ?? 'logging');
        else this.notFound.set(true);
      },
    });
  }

  /** Jump the embed to a claim's moment, switching videos first if needed. */
  protected jump(s: Supporter): void {
    const yt = this.run()?.videos.find((v) => v.id === s.videoId)?.youtubeId;
    if (yt && yt !== this.activeVideoId()) {
      this.pendingSeek = s.timestampSec;
      this.activeVideoId.set(yt);
    } else {
      this.player()?.seekTo(s.timestampSec, true);
      this.player()?.playVideo();
    }
  }

  protected onPlayerReady(): void {
    if (this.pendingSeek != null) {
      this.player()?.seekTo(this.pendingSeek, true);
      this.player()?.playVideo();
      this.pendingSeek = null;
    }
  }

  protected review(fact: MembershipFact | OrderFact, action: ReviewAction): void {
    const claimId = fact.supporters[0]?.claimId;
    if (claimId == null) return;
    this.api.review(claimId, action).subscribe({ next: () => this.load() });
  }

  protected name = titleCase;
  protected clock = clock;
}
