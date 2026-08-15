/**
 * Associated (generalised) Laguerre polynomials L^alpha_k(x).
 *
 * These are the radial part of the hydrogenic solution. They are what produce
 * the radial NODES: L^(2l+1)_(n-l-1) has exactly n-l-1 real positive roots, and
 * each root is a spherical shell where the electron density is exactly zero.
 *
 * Evaluated by upward recurrence rather than the explicit sum formula. The
 * explicit sum alternates in sign and suffers catastrophic cancellation; the
 * recurrence is stable and, for the small degrees we need (k = n-l-1 <= 6),
 * exact to machine precision.
 *
 *   L^a_0(x) = 1
 *   L^a_1(x) = 1 + a - x
 *   (k+1) L^a_(k+1)(x) = (2k + 1 + a - x) L^a_k(x) - (k + a) L^a_(k-1)(x)
 */
export function associatedLaguerre(k: number, alpha: number, x: number): number {
  if (k < 0) return 0;
  if (k === 0) return 1;

  let lPrev = 1; // L^a_0
  let lCurr = 1 + alpha - x; // L^a_1

  for (let i = 1; i < k; i++) {
    const lNext = ((2 * i + 1 + alpha - x) * lCurr - (i + alpha) * lPrev) / (i + 1);
    lPrev = lCurr;
    lCurr = lNext;
  }

  return lCurr;
}

/**
 * Factorial for small non-negative integers, memoised.
 * Only ever called with arguments up to (n + l) <= ~13 in the normalisation
 * constants, so exact integer arithmetic in a double is guaranteed.
 */
const FACTORIAL_CACHE: number[] = [1];
export function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) {
    throw new Error(`factorial expects a non-negative integer, got ${n}`);
  }
  for (let i = FACTORIAL_CACHE.length; i <= n; i++) {
    FACTORIAL_CACHE[i] = FACTORIAL_CACHE[i - 1] * i;
  }
  return FACTORIAL_CACHE[n];
}
