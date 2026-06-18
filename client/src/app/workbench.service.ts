import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import type { Category, Claim, Violation, WorkbenchData } from './models';

/** Logging surface: catalog reads + draft/claim writes (all behind auth on the API). */
@Injectable({ providedIn: 'root' })
export class WorkbenchService {
  private readonly http = inject(HttpClient);

  /** Ensure the caller's draft for a video and return the full bootstrap. */
  open(videoId: number) {
    return this.http.post<WorkbenchData>(`/api/logs/${videoId}/open`, {});
  }

  catalog() {
    return this.http.get<{ categories: Category[] }>('/api/catalog');
  }

  addClaim(logId: number, body: { catalogItemId: number; timestampSec: number; runId?: number | null }) {
    return this.http.post<Claim>(`/api/logs/${logId}/claims`, body);
  }

  deleteClaim(claimId: number) {
    return this.http.delete(`/api/claims/${claimId}`);
  }

  /** Submit a draft through the validator gate. 422 body carries `violations`. */
  submit(logId: number) {
    return this.http.post<{ ok: boolean; status?: string; violations?: Violation[] }>(
      `/api/logs/${logId}/submit`,
      {},
    );
  }
}
