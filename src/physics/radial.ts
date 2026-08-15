/**
 * Radial wavefunctions R_nl(r).
 *
 * Everything is in ATOMIC UNITS: r is in Bohr radii, so a0 = 1.
 *
 *   rho      = 2 * Z_eff * r / n
 *   R_nl(r)  = N * exp(-rho/2) * rho^l * L^(2l+1)_(n-l-1)(rho)
 *   N        = sqrt( (2 Z_eff / n)^3 * (n-l-1)! / (2n (n+l)!) )
 *
 * normalised so that the integral of R^2 r^2 dr from 0 to infinity is 1.
 *
 * ON ACCURACY, stated plainly: this is the exact analytic solution only for a
 * ONE-electron atom. For every other element the electron-electron repulsion
 * has no closed form, so we approximate it by screening the nuclear charge,
 * Z -> Z_eff. That is a real approximation, not a rendering shortcut: it keeps
 * the correct orbital SHAPES and node structure exactly, and gets the orbital
 * SIZES right to roughly 10-20 percent.
 *
 * The RadialBackend interface below exists so this can be swapped for tabulated
 * Roothaan-Hartree-Fock (Clementi-Roetti) Slater-type expansions later without
 * the renderer knowing anything changed.
 */

import { associatedLaguerre, factorial } from './laguerre';

/** A source of radial functions. Lets us swap the physics model behind the renderer. */
export interface RadialBackend {
  readonly name: string;
  /** R_nl(r) in atomic units, for an atom of atomic number z. */
  evaluate(n: number, l: number, r: number, z: number): number;
  /** Effective nuclear charge felt by an (n, l) electron. Used for sizing/scale hints. */
  effectiveCharge(n: number, l: number, z: number): number;
}

/** Normalisation constant N for R_nl with a given effective charge. */
function normalisation(n: number, l: number, zEff: number): number {
  const a = (2 * zEff) / n;
  return Math.sqrt(a * a * a * (factorial(n - l - 1) / (2 * n * factorial(n + l))));
}

/**
 * Hydrogenic radial function with an explicit effective charge.
 * Exact for zEff = Z = 1 (hydrogen); an approximation otherwise.
 */
export function radialWavefunction(n: number, l: number, r: number, zEff: number): number {
  if (l >= n) throw new Error(`invalid orbital: l (${l}) must be < n (${n})`);
  if (r < 0) throw new Error(`radius must be non-negative, got ${r}`);

  const rho = (2 * zEff * r) / n;

  // exp(-rho/2) underflows to 0 far out; that is correct and avoids NaN from
  // rho^l * 0 * huge-Laguerre at extreme radii.
  const decay = Math.exp(-rho / 2);
  if (decay === 0) return 0;

  return (
    normalisation(n, l, zEff) *
    decay *
    Math.pow(rho, l) *
    associatedLaguerre(n - l - 1, 2 * l + 1, rho)
  );
}

/**
 * Radial probability density P(r) = r^2 * R_nl(r)^2.
 *
 * This is the function whose integral is 1, and it is the one that actually
 * answers "how far is the electron from the nucleus". Note that P(0) = 0 even
 * for a 1s orbital, where R(0) is at its MAXIMUM: there is more space available
 * in a shell at larger r. This is why the 1s peak sits at r = 1 Bohr rather
 * than at the nucleus, and it is a distinction most visualisations blur.
 */
export function radialProbabilityDensity(n: number, l: number, r: number, zEff: number): number {
  const R = radialWavefunction(n, l, r, zEff);
  return r * r * R * R;
}

/**
 * Expectation value <r> for a hydrogenic orbital, analytic:
 *   <r> = (3n^2 - l(l+1)) / (2 Z_eff)   [Bohr radii]
 * Used to auto-size the render volume and as a test oracle.
 */
export function expectedRadius(n: number, l: number, zEff: number): number {
  return (3 * n * n - l * (l + 1)) / (2 * zEff);
}

/**
 * Radius enclosing a given fraction of the radial probability, found by
 * integrating P(r) outward with Simpson's rule until the target is reached.
 * Used to pick a render box that actually contains the atom.
 */
export function radiusEnclosing(
  n: number,
  l: number,
  zEff: number,
  fraction: number,
  steps = 4000,
): number {
  const rMax = 6 * expectedRadius(n, l, zEff);
  const h = rMax / steps;
  let acc = 0;
  let prev = radialProbabilityDensity(n, l, 0, zEff);

  for (let i = 1; i <= steps; i++) {
    const r = i * h;
    const mid = radialProbabilityDensity(n, l, r - h / 2, zEff);
    const curr = radialProbabilityDensity(n, l, r, zEff);
    const slice = (h / 6) * (prev + 4 * mid + curr);
    if (acc + slice >= fraction) {
      // Linear interpolation inside the final slice.
      return r - h + (h * (fraction - acc)) / slice;
    }
    acc += slice;
    prev = curr;
  }
  return rMax;
}

/** The default backend: hydrogenic radial functions screened by Slater's rules. */
export function createHydrogenicBackend(
  effectiveChargeFn: (n: number, l: number, z: number) => number,
): RadialBackend {
  return {
    name: 'hydrogenic (Slater-screened)',
    evaluate: (n, l, r, z) => radialWavefunction(n, l, r, effectiveChargeFn(n, l, z)),
    effectiveCharge: effectiveChargeFn,
  };
}
