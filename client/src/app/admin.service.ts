import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import type { Role } from './models';

/** Shapes from the admin API (server/src/db/queries/admin.ts). */
export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: Role;
  points: number;
  createdAt: string;
}

export interface EscalatedRun {
  runId: number;
  pokemonDex: number;
  pokemonName: string;
}

export interface ContestedFact {
  runId: number;
  pokemonName: string;
  label: string;
  category: string;
  timestampSec: number;
}

export interface PendingProposal {
  id: number;
  runId: number;
  pokemonName: string;
  label: string;
  proposedBy: string;
  note: string | null;
  timestampSec: number;
  createdAt: string;
}

export interface AdminQueue {
  escalatedRuns: EscalatedRun[];
  contestedFacts: ContestedFact[];
  pendingProposals: PendingProposal[];
}

/** Admin-only endpoints: user management + the task queue. All gated server-side. */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  getUsers() {
    return this.http.get<{ users: AdminUser[] }>('/api/admin/users');
  }

  setRole(id: number, role: Role) {
    return this.http.patch<{ ok: boolean; id: number; role: Role }>(`/api/admin/users/${id}/role`, { role });
  }

  getQueue() {
    return this.http.get<AdminQueue>('/api/admin/queue');
  }
}
