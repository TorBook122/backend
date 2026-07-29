import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string comparison for secrets (internal service keys, API tokens, etc.).
 * Prevents timing side-channel attacks that a plain `===` comparison is vulnerable to.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    // Still perform a comparison of equal length so this branch takes comparable time
    // to the equal-length case, rather than short-circuiting immediately.
    timingSafeEqual(bufA, bufA);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}
