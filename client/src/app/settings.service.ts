import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { AuthService } from './auth.service';

/** App-wide user preferences. Add new keys here with a default. */
export interface AppSettings {
  /** Pause the video when the category picker opens (workbench). */
  pauseOnPick: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  pauseOnPick: true,
};

/**
 * Signal-backed settings, persisted per-user on the API (`/api/settings`). Loads
 * whenever a user is present (and re-loads on login); falls back to defaults for
 * anonymous visitors. Components read the signals; `set()` is optimistic.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly state = signal<AppSettings>(DEFAULT_SETTINGS);

  readonly pauseOnPick = computed(() => this.state().pauseOnPick);

  constructor() {
    // Load once a user is known; the async write avoids writing a signal
    // synchronously inside the effect.
    effect(() => {
      if (this.auth.user()) this.load();
    });
  }

  private load(): void {
    this.http.get<Partial<AppSettings>>('/api/settings').subscribe({
      next: (s) => this.state.set({ ...DEFAULT_SETTINGS, ...s }),
      error: () => {
        /* keep defaults */
      },
    });
  }

  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.state.update((s) => ({ ...s, [key]: value }));
    this.http.put('/api/settings', { [key]: value }).subscribe();
  }
}
