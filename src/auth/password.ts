/**
 * Password hashing. Bun ships argon2id (its default) in `Bun.password` — no
 * external dependency. The hash string is self-describing (algorithm + params
 * are encoded in it), so `verify` needs only the stored hash.
 */
export function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return Bun.password.verify(plain, hash);
}
