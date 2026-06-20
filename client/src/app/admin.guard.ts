import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Admins only. Waits for the initial /me check so it doesn't race app boot, then
 * allows admins through and redirects everyone else home. (The API gates the data
 * too — this just keeps non-admins off the page.)
 */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureLoaded();
  return auth.user()?.role === 'admin' ? true : router.createUrlTree(['/']);
};
