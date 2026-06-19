import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

/** The claim lifecycle status (mirrors the server enum). */
export type ClaimStatus = 'proposed' | 'agreed' | 'contested' | 'overturned' | 'certified';
export type Standing = 'canonical' | 'pending' | 'contested' | 'overturned';
export type ReviewAction = 'contest' | 'certify' | 'overturn';

export interface Supporter {
  claimId: number;
  logId: number;
  videoId: number;
  userId: number;
  status: ClaimStatus;
  timestampSec: number;
}

export interface FieldValue {
  slug: string;
  label: string;
  value: string | null;
  valueCatalogItemId: number | null;
  valueLabel: string | null;
  logIds: number[];
}

export interface MembershipFact {
  catalogItemId: number;
  categorySlug: string;
  label: string;
  status: ClaimStatus;
  divergent: boolean;
  standing: Standing;
  support: number;
  supporters: Supporter[];
  fields: FieldValue[];
}

export interface OrderFact {
  categorySlug: string;
  position: number;
  status: ClaimStatus;
  divergent: boolean;
  standing: Standing;
  support: number;
  candidates: { catalogItemId: number; label: string; logIds: number[] }[];
  fields: FieldValue[];
  supporters: Supporter[];
}

export type RecordState = 'logging' | 'reconciling' | 'escalated' | 'live';

export interface CanonicalVideo {
  id: number;
  youtubeId: string | null;
  title: string | null;
  durationSec: number | null;
}

export interface ProposalView {
  id: number;
  catalogItemId: number;
  categorySlug: string;
  label: string;
  timestampSec: number;
  videoId: number;
  proposedBy: string;
  note: string | null;
}

export interface CanonicalRun {
  runId: number;
  recordState: RecordState;
  videos: CanonicalVideo[];
  membership: MembershipFact[];
  order: OrderFact[];
  proposals: ProposalView[];
  summary: { canonical: number; pending: number; contested: number; overturned: number; divergent: number };
}

/** The canonical record for a run + the review/reconciliation actions. */
@Injectable({ providedIn: 'root' })
export class CanonicalService {
  private readonly http = inject(HttpClient);

  getRun(runId: number) {
    return this.http.get<CanonicalRun>(`/api/runs/${runId}/canonical`);
  }

  /** Apply a review verdict to a fact (acts on all the fact's sibling claims). */
  review(claimId: number, action: ReviewAction) {
    return this.http.post<{ ok: boolean; status: string }>(`/api/claims/${claimId}/review`, { action });
  }

  /** Optional fallback: loggers can't converge, hand the diff to an admin. */
  escalate(runId: number) {
    return this.http.post<{ ok: boolean; recordState: RecordState }>(
      `/api/runs/${runId}/reconcile/escalate`,
      {},
    );
  }

  /** Propose a fact the loggers missed (enters as a pending proposal). */
  propose(runId: number, body: { catalogItemId: number; videoId: number; timestampSec: number; note?: string }) {
    return this.http.post<{ id: number; status: string }>(`/api/runs/${runId}/proposals`, body);
  }
  /** Admin: fold a proposal into the record / discard it. */
  acceptProposal(id: number) {
    return this.http.post<{ ok: boolean; status: string }>(`/api/proposals/${id}/accept`, {});
  }
  rejectProposal(id: number) {
    return this.http.post<{ ok: boolean; status: string }>(`/api/proposals/${id}/reject`, {});
  }
}
