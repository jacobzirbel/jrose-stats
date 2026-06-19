import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { YouTubePlayer } from '@angular/youtube-player';

import { AuthService } from '../auth.service';
import {
  CanonicalService,
  type CanonicalRun,
  type MembershipFact,
  type OrderFact,
  type ProposalView,
  type RecordState,
  type ReviewAction,
  type Supporter,
} from '../canonical.service';
import { WorkbenchService } from '../workbench.service';
import { clock, titleCase, type Category } from '../models';

/**
 * The canonical record for a run — the read-side VIEW over claims plus review.
 * Facts show their standing (canonical / pending / contested / overturned), how
 * many independent logs back them, and the supporting claims. On a live run any
 * signed-in user may Contest a fact or Propose a missing one; Certify / Overturn
 * and accepting proposals are admin-only resolutions. Each action re-derives.
 */
@Component({
  selector: 'app-run-record',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, YouTubePlayer, FormsModule],
  templateUrl: './run-record.html',
  styleUrl: './run-record.css',
})
export class RunRecord {
  private readonly api = inject(CanonicalService);
  private readonly wb = inject(WorkbenchService);
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

  /** Certify / overturn are admin resolutions; anyone signed in may contest. */
  protected readonly isAdmin = computed(() => this.auth.user()?.role === 'admin');

  // --- propose a missing fact ------------------------------------------------
  private readonly catalog = signal<Category[]>([]);
  readonly proposeOpen = signal(false);
  proposeSearch = '';
  private readonly proposeQuery = signal('');
  /** Flat, searchable catalog for the propose picker (capped for the list). */
  readonly proposeItems = computed(() => {
    const q = this.proposeQuery().trim().toLowerCase();
    const out: { id: number; label: string; cat: string }[] = [];
    for (const c of this.catalog()) for (const it of c.items) out.push({ id: it.id, label: it.label, cat: c.label });
    return (q ? out.filter((o) => o.label.toLowerCase().includes(q)) : out).slice(0, 60);
  });

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

  // --- propose a missing fact ------------------------------------------------
  protected openPropose(): void {
    this.proposeSearch = '';
    this.proposeQuery.set('');
    this.proposeOpen.set(true);
    if (this.catalog().length === 0) this.wb.catalog().subscribe((r) => this.catalog.set(r.categories));
  }
  protected closePropose(): void {
    this.proposeOpen.set(false);
  }
  protected onProposeSearch(v: string): void {
    this.proposeQuery.set(v);
  }

  /** Propose the picked item at the current playhead on the active video. */
  protected propose(item: { id: number }): void {
    const r = this.run();
    if (!r) return;
    const videoId = r.videos.find((v) => v.youtubeId === this.activeVideoId())?.id ?? r.videos[0]?.id;
    if (videoId == null) return;
    const timestampSec = Math.floor(this.player()?.getCurrentTime() ?? 0);
    this.api.propose(this.runId, { catalogItemId: item.id, videoId, timestampSec }).subscribe({
      next: () => {
        this.closePropose();
        this.load();
      },
    });
  }

  protected acceptProposal(p: ProposalView): void {
    this.api.acceptProposal(p.id).subscribe({ next: () => this.load() });
  }
  protected rejectProposal(p: ProposalView): void {
    this.api.rejectProposal(p.id).subscribe({ next: () => this.load() });
  }
  /** Seek the embed to a proposal's moment. */
  protected jumpProposal(p: ProposalView): void {
    this.jump({ videoId: p.videoId, timestampSec: p.timestampSec } as Supporter);
  }

  protected name = titleCase;
  protected clock = clock;
}
