import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Log in</h1>
    @if (error()) {
      <p class="error">{{ error() }}</p>
    }
    <form (ngSubmit)="submit()">
      <p>
        <label>Username<br /><input name="username" [(ngModel)]="username" required /></label>
      </p>
      <p>
        <label>Password<br /><input name="password" type="password" [(ngModel)]="password" required /></label>
      </p>
      <p><button type="submit" [disabled]="pending()">Log in</button></p>
    </form>
    <p>New here? <a routerLink="/signup">Sign up</a></p>
  `,
  styles: `.error { color: crimson; }`,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected username = '';
  protected password = '';
  protected readonly error = signal('');
  protected readonly pending = signal(false);

  submit(): void {
    this.pending.set(true);
    this.error.set('');
    this.auth.login(this.username, this.password).subscribe({
      next: () => this.router.navigateByUrl('/'),
      error: (e) => {
        this.error.set(e.error?.error ?? 'Login failed.');
        this.pending.set(false);
      },
    });
  }
}
