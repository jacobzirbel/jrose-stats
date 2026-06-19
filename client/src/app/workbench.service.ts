import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import type {
  Category,
  CategoryField,
  Claim,
  ClaimFieldValue,
  Violation,
  WorkbenchData,
} from './models';

/** Logging surface: catalog reads + draft/claim writes (all behind auth on the API). */
@Injectable({ providedIn: 'root' })
export class WorkbenchService {
  private readonly http = inject(HttpClient);

  /** Ensure the caller's draft for a video and return the full bootstrap. */
  open(videoId: number) {
    return this.http.post<WorkbenchData>(`/api/logs/${videoId}/open`, {});
  }

  catalog() {
    return this.http.get<{ categories: Category[]; fields: CategoryField[] }>('/api/catalog');
  }

  /** Replace a claim's metadata field values. Returns the persisted set. */
  saveClaimFields(claimId: number, values: ClaimFieldValue[]) {
    return this.http.put<{ claimId: number; fields: ClaimFieldValue[] }>(
      `/api/claims/${claimId}/fields`,
      { values },
    );
  }

  addClaim(logId: number, body: { catalogItemId: number; timestampSec: number; runId?: number | null }) {
    return this.http.post<Claim>(`/api/logs/${logId}/claims`, body);
  }

  deleteClaim(claimId: number) {
    return this.http.delete(`/api/claims/${claimId}`);
  }

  /** Reopen a submitted log for reconciliation edits (submitted -> draft). */
  reopen(logId: number) {
    return this.http.post<{ ok: boolean; status: string }>(`/api/logs/${logId}/reopen`, {});
  }

  /** Re-timestamp an existing claim (fixes order during reconciliation). */
  setTimestamp(claimId: number, timestampSec: number) {
    return this.http.put<{ id: number; timestampSec: number }>(
      `/api/claims/${claimId}/timestamp`,
      { timestampSec },
    );
  }

  /** Submit a draft through the validator gate. 422 body carries `violations`. */
  submit(logId: number) {
    return this.http.post<{ ok: boolean; status?: string; violations?: Violation[] }>(
      `/api/logs/${logId}/submit`,
      {},
    );
  }
}
