import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';

import { AdminService, type AdminQueue, type AdminUser } from '../../admin.service';
import { clock, titleCase, type Role } from '../../models';

/**
 * Admin dashboard: the human-resolution task queue + user management. The queue
 * only SURFACES work (escalated runs, contested facts, pending proposals) and
 * deep-links to /run/:runId, where the existing controls resolve each item. Role
 * changes happen here; the server blocks demoting the last admin.
 */
@Component({
  selector: 'app-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class AdminPage {
  private readonly api = inject(AdminService);

  readonly queue = signal<AdminQueue | null>(null);
  readonly users = signal<AdminUser[]>([]);
  readonly error = signal<string | null>(null);

  protected readonly roles: Role[] = ['member', 'trusted', 'admin'];
  protected readonly clock = clock;
  protected readonly titleCase = titleCase;

  /** Total open queue items, for the section heading. */
  protected readonly queueCount = computed(() => {
    const q = this.queue();
    return q ? q.escalatedRuns.length + q.contestedFacts.length + q.pendingProposals.length : 0;
  });

  constructor() {
    this.loadQueue();
    this.loadUsers();
  }

  private loadQueue(): void {
    this.api.getQueue().subscribe((q) => this.queue.set(q));
  }

  private loadUsers(): void {
    this.api.getUsers().subscribe((r) => this.users.set(r.users));
  }

  protected onRoleChange(u: AdminUser, event: Event): void {
    const role = (event.target as HTMLSelectElement).value as Role;
    if (role === u.role) return;
    this.error.set(null);
    this.api.setRole(u.id, role).subscribe({
      next: () => this.loadUsers(),
      error: (e: HttpErrorResponse) => {
        this.error.set(e.error?.error ?? 'Could not change role.');
        this.loadUsers(); // snap the select back to the server's truth
      },
    });
  }
}
