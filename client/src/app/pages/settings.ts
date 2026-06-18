import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SettingsService } from '../settings.service';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <p><a routerLink="/">← The 151</a></p>
    <h1>Settings</h1>
    <ul class="settings">
      <li>
        <label>
          <input
            type="checkbox"
            [checked]="settings.pauseOnPick()"
            (change)="toggle('pauseOnPick', $event)"
          />
          Pause the video when I open a category picker
        </label>
      </li>
    </ul>
  `,
  styles: `
    .settings { list-style: none; padding: 0; }
    .settings li { margin: 0.4rem 0; }
  `,
})
export class SettingsPage {
  protected readonly settings = inject(SettingsService);

  toggle(key: 'pauseOnPick', e: Event): void {
    this.settings.set(key, (e.target as HTMLInputElement).checked);
  }
}
