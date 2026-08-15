/**
 * Orbital energies, and an honest account of how badly this model estimates them.
 *
 * The hydrogenic energy of an orbital is
 *
 *     E = -13.606 eV * Z_eff^2 / n*^2
 *
 * where n* is Slater's EFFECTIVE principal quantum number, which departs from n
 * for the outer shells (4 -> 3.7, 5 -> 4.0, 6 -> 4.2). Slater fitted those
 * values to spectroscopic data precisely because the plain integer n does not
 * work.
 *
 * WHY THIS IS THE WEAKEST PART OF THE WHOLE MODEL, stated plainly because the
 * numbers are not close. For hydrogen the result is exact. For everything else
 * it OVERBINDS, typically by 1.5x to 5x, and the error grows with the number of
 * electrons sharing a shell. Neon comes out around 116 eV against a measured
 * 21.6 eV.
 *
 * Two distinct reasons, both structural rather than fixable by tuning:
 *
 *  1. DOUBLE COUNTING. This expression hands each electron the full attraction
 *     to a screened nucleus, but the screening IS the other electrons. Their
 *     mutual repulsion therefore gets counted once for each partner rather than
 *     once per pair.
 *
 *  2. NO RELAXATION. An ionisation energy is a difference between two atoms,
 *     the neutral and the ion. Removing an electron lets every remaining
 *     electron re-screen and settle inward, which lowers the ion's energy and so
 *     lowers the energy actually needed. A single orbital energy knows nothing
 *     about that rearrangement. Doing it properly means computing both atoms
 *     self-consistently and subtracting.
 *
 * Slater's rules were fitted to reproduce sizes and screening, not energies, and
 * this module exists mainly so the viewer can show that distinction rather than
 * quietly present sizes and energies as equally trustworthy.
 */

import { expectedRadius } from './radial';
import type { Orbital } from './wavefunction';

/** Rydberg energy in eV: the ionisation energy of hydrogen from first principles. */
export const RYDBERG_EV = 13.605693122994;

/**
 * Slater's effective principal quantum numbers. Integers up to n = 3, then
 * empirically reduced. Slater tabulated these only to n = 6; the value for 7 is
 * an extrapolation and is flagged as such by isExtrapolated below.
 */
const EFFECTIVE_N: Record<number, number> = {
  1: 1.0,
  2: 2.0,
  3: 3.0,
  4: 3.7,
  5: 4.0,
  6: 4.2,
  7: 4.3,
};

export function effectivePrincipalNumber(n: number): number {
  return EFFECTIVE_N[n] ?? n;
}

/** True where the effective principal number is extrapolated rather than fitted. */
export function isExtrapolated(n: number): boolean {
  return n >= 7;
}

/** Hydrogenic orbital energy in eV. Negative, since the electron is bound. */
export function orbitalEnergyEv(n: number, zEff: number): number {
  const nStar = effectivePrincipalNumber(n);
  return (-RYDBERG_EV * zEff * zEff) / (nStar * nStar);
}

/**
 * Estimated first ionisation energy: the binding energy of the least bound
 * electron, which is the one in the orbital with the largest mean radius.
 *
 * Read the caveats in the file header before trusting this number. It is
 * included so the viewer can display how far off it is, not because it is good.
 */
export function estimatedIonisationEnergyEv(orbitals: Orbital[]): number {
  if (orbitals.length === 0) return 0;

  let outer = orbitals[0];
  let outerR = expectedRadius(outer.n, outer.l, outer.zEff);
  for (const o of orbitals) {
    const r = expectedRadius(o.n, o.l, o.zEff);
    if (r > outerR) {
      outer = o;
      outerR = r;
    }
  }

  return Math.abs(orbitalEnergyEv(outer.n, outer.zEff));
}

/** Total electronic energy, summing each occupied orbital's energy. */
export function totalOrbitalEnergyEv(orbitals: Orbital[]): number {
  return orbitals.reduce(
    (sum, o) => sum + o.occupancy * orbitalEnergyEv(o.n, o.zEff),
    0,
  );
}
