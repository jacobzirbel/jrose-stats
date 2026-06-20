/**
 * The role ladder. Trust is monotonic: every tier inherits the powers below it,
 * so a single rank comparison answers "may this user do X" — no orthogonal flags.
 *
 *   member  — signed-in viewer; may contest/propose on a live run.
 *   trusted — + claim a video slot and log (the trust gate; invite-granted later).
 *   admin   — everything: certify/overturn, accept proposals, manage users.
 *
 * `editor` (the old, unused middle value) was renamed to `trusted`.
 */
import type { AuthUser } from "./session";

export const ROLE_RANK = { member: 0, trusted: 1, admin: 2 } as const;

export type Role = keyof typeof ROLE_RANK;

export const ROLES = Object.keys(ROLE_RANK) as Role[];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && value in ROLE_RANK;
}

/** True if the user's role is at least `min` on the ladder. Unknown roles fail closed. */
export function isAtLeast(user: Pick<AuthUser, "role"> | null, min: Role): boolean {
  if (!user || !isRole(user.role)) return false;
  return ROLE_RANK[user.role] >= ROLE_RANK[min];
}
