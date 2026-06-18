import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, tap } from 'rxjs';

import type { AuthUser } from './models';

/**
 * Current-user state. The session token lives in an httpOnly cookie (set by the
 * API), so this only tracks the user object. `user()` is a signal the shell and
 * guards read; `loaded()` flips once the initial /me check resolves.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly user = signal<AuthUser | null>(null);
  readonly loaded = signal(false);

  /** Resolve the session cookie to a user on app boot. */
  loadMe(): void {
    this.http.get<{ user: AuthUser | null }>('/api/me').subscribe({
      next: (r) => {
        this.user.set(r.user);
        this.loaded.set(true);
      },
      error: () => {
        this.user.set(null);
        this.loaded.set(true);
      },
    });
  }

  login(username: string, password: string) {
    return this.http
      .post<{ user: AuthUser }>('/api/login', { username, password })
      .pipe(map((r) => r.user), tap((u) => this.user.set(u)));
  }

  signup(username: string, email: string, password: string) {
    return this.http
      .post<{ user: AuthUser }>('/api/signup', { username, email, password })
      .pipe(map((r) => r.user), tap((u) => this.user.set(u)));
  }

  logout() {
    return this.http.post('/api/logout', {}).pipe(tap(() => this.user.set(null)));
  }
}
