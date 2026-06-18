import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../auth.service';

@Component({
  selector: 'app-signup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Create an account</h1>
    @if (error()) {
      <p class="error">{{ error() }}</p>
    }
    <form (ngSubmit)="submit()">
      <p>
        <label>Username<br /><input name="username" [(ngModel)]="username" required /></label>
      </p>
      <p>
        <label>Email<br /><input name="email" type="email" [(ngModel)]="email" required /></label>
      </p>
      <p>
        <label>Password<br /><input name="password" type="password" [(ngModel)]="password" required /></label>
      </p>
      <p><button type="submit" [disabled]="pending()">Sign up</button></p>
    </form>
    <p>Have an account? <a routerLink="/login">Log in</a></p>
  `,
  styles: `.error { color: crimson; }`,
})
export class Signup {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected username = '';
  protected email = '';
  protected password = '';
  protected readonly error = signal('');
  protected readonly pending = signal(false);

  submit(): void {
    this.pending.set(true);
    this.error.set('');
    this.auth.signup(this.username, this.email, this.password).subscribe({
      next: () => this.router.navigateByUrl('/'),
      error: (e) => {
        this.error.set(e.error?.error ?? 'Sign up failed.');
        this.pending.set(false);
      },
    });
  }
}
