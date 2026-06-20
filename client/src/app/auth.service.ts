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

  /** The in-flight /me request, so concurrent callers (boot + a route guard) share one. */
  private mePromise: Promise<AuthUser | null> | null = null;

  /** Resolve the session cookie to a user on app boot. */
  loadMe(): void {
    void this.ensureLoaded();
  }

  /** Await the initial /me check; resolves to the current user (or null). Guards use this. */
  ensureLoaded(): Promise<AuthUser | null> {
    if (this.loaded()) return Promise.resolve(this.user());
    if (!this.mePromise) {
      this.mePromise = new Promise((resolve) => {
        this.http.get<{ user: AuthUser | null }>('/api/me').subscribe({
          next: (r) => {
            this.user.set(r.user);
            this.loaded.set(true);
            resolve(r.user);
          },
          error: () => {
            this.user.set(null);
            this.loaded.set(true);
            resolve(null);
          },
        });
      });
    }
    return this.mePromise;
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
