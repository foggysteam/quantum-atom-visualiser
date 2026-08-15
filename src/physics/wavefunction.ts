/**
 * Full wavefunctions and total electron density.
 *
 *   psi_nlm(r, theta, phi) = R_nl(r) * Y_lm(theta, phi)
 *   rho(r) = sum over occupied orbitals of  occupancy * |psi|^2
 *
 * A note on partially filled subshells, because this is where honest and
 * convenient part ways:
 *
 * Carbon is 2p2. The chemistry-textbook picture puts one electron in px and one
 * in py (Hund's rule, parallel spins). That picture is useful and it is what
 * everyone draws. But a FREE carbon atom floating in space has no preferred
 * axis, so it cannot actually look like that. Its true ground state is a
 * degenerate 3P term, and the physically meaningful density for an unoriented
 * atom is the spherical average.
 *
 * Rather than silently pick one, both are offered. 'hund' gives the oriented,
 * chemically intuitive picture; 'spherical' gives what a free atom really is.
 * The difference is visible and worth seeing.
 */

import { magneticQuantumNumbers, ORBITAL_LABELS, realSphericalHarmonic } from './sphericalHarmonics';
import {
  radialWavefunction,
  radialProbabilityDensity,
  expectedRadius,
  radiusEnclosing,
} from './radial';
import { electronConfiguration, subshellCapacity } from './aufbau';
import { effectiveNuclearCharge } from './slater';
import { relativisticZeff } from './relativity';
import { subshellLabel } from './constants';

export type OccupancyMode = 'hund' | 'spherical';

export interface Orbital {
  n: number;
  l: number;
  m: number;
  /** Electrons in this specific orbital: 0..2, or fractional in 'spherical' mode. */
  occupancy: number;
  /** Effective nuclear charge used for this subshell's radial function. */
  zEff: number;
  /** e.g. "2px" */
  label: string;
  /** e.g. "2p" */
  subshell: string;
}

/**
 * Distribute a subshell's electrons across its 2l+1 orbitals.
 * 'hund' fills singly first then pairs; 'spherical' spreads evenly.
 */
function distributeElectrons(l: number, electrons: number, mode: OccupancyMode): number[] {
  const count = 2 * l + 1;
  if (mode === 'spherical') {
    return new Array(count).fill(electrons / count);
  }
  const occ = new Array<number>(count).fill(0);
  for (let i = 0; i < count; i++) {
    occ[i] = (i < electrons ? 1 : 0) + (i < electrons - count ? 1 : 0);
  }
  return occ;
}

/**
 * Build the occupied-orbital list for a neutral atom of atomic number z.
 *
 * With `relativistic` set, each subshell's effective charge is scaled by its
 * Lorentz factor, which contracts the orbital by 1/gamma. This is exact for the
 * direct effect and matters enormously for inner s shells of heavy atoms (gold's
 * 1s contracts to about 82%). See physics/relativity.ts for what it does not
 * capture.
 */
export function buildOrbitals(
  z: number,
  mode: OccupancyMode = 'hund',
  relativistic = false,
): Orbital[] {
  const orbitals: Orbital[] = [];

  for (const shell of electronConfiguration(z)) {
    const baseZeff = effectiveNuclearCharge(shell.n, shell.l, z);
    const zEff = relativistic ? relativisticZeff(baseZeff, shell.n) : baseZeff;
    const occupancies = distributeElectrons(shell.l, shell.electrons, mode);
    const ms = magneticQuantumNumbers(shell.l);

    for (let i = 0; i < ms.length; i++) {
      if (occupancies[i] <= 0) continue;
      const m = ms[i];
      orbitals.push({
        n: shell.n,
        l: shell.l,
        m,
        occupancy: occupancies[i],
        zEff,
        label: `${shell.n}${ORBITAL_LABELS[shell.l]?.[m] ?? `l${shell.l}m${m}`}`,
        subshell: subshellLabel(shell.n, shell.l),
      });
    }
  }

  return orbitals;
}

/**
 * Evaluate psi for one orbital at a Cartesian point, coordinates in Bohr radii.
 * Returns a SIGNED amplitude; the sign is the phase.
 */
export function evaluateOrbital(orbital: Orbital, x: number, y: number, z: number): number {
  const r = Math.sqrt(x * x + y * y + z * z);

  // At the origin the direction is undefined. Every l > 0 orbital vanishes
  // there anyway (R goes as rho^l), and l = 0 has no angular dependence, so any
  // direction is safe.
  if (r < 1e-12) {
    if (orbital.l > 0) return 0;
    return radialWavefunction(orbital.n, 0, 0, orbital.zEff) * realSphericalHarmonic(0, 0, 0, 0, 1);
  }

  const R = radialWavefunction(orbital.n, orbital.l, r, orbital.zEff);
  if (R === 0) return 0;

  const Y = realSphericalHarmonic(orbital.l, orbital.m, x / r, y / r, z / r);
  return R * Y;
}

/** Probability density |psi|^2 for a single orbital (not weighted by occupancy). */
export function orbitalDensity(orbital: Orbital, x: number, y: number, z: number): number {
  const psi = evaluateOrbital(orbital, x, y, z);
  return psi * psi;
}

/**
 * Total electron density at a point, summed over orbitals and weighted by
 * occupancy. Integrating this over all space gives the electron count Z.
 *
 * Note this is a sum of |psi|^2, NOT |sum of psi|^2. Different orbitals are
 * orthogonal and hold distinguishable electrons, so their densities add; there
 * is no interference between them within one atom. (Interference between
 * orbitals on DIFFERENT atoms is exactly what chemical bonding is, which is
 * Phase 2.)
 */
export function totalDensity(orbitals: Orbital[], x: number, y: number, z: number): number {
  let rho = 0;
  for (const orbital of orbitals) {
    if (orbital.occupancy <= 0) continue;
    rho += orbital.occupancy * orbitalDensity(orbital, x, y, z);
  }
  return rho;
}

/**
 * A sensible half-width for the render box, in Bohr radii: large enough to
 * contain 99% of the outermost orbital's radial probability.
 *
 * There is no "edge" to an atom. The density decays exponentially and is
 * nonzero everywhere, forever. Any boundary is a choice about where to stop
 * drawing, so the viewer states the enclosed fraction explicitly.
 */
export function suggestedExtent(orbitals: Orbital[], fraction = 0.99): number {
  let maxR = 0;
  for (const o of orbitals) {
    maxR = Math.max(maxR, radiusEnclosing(o.n, o.l, o.zEff, fraction));
  }
  return maxR;
}

/**
 * Peak total density, found by scanning. Not assumed to be at the nucleus:
 * that only holds while an s orbital is visible, and the user can hide it.
 */
export function peakDensity(orbitals: Orbital[], searchRadius: number): number {
  let max = 0;
  const dirs = UNIT_DIRECTIONS;
  const steps = 512;
  for (let i = 0; i <= steps; i++) {
    const r = (i / steps) * searchRadius;
    for (const [dx, dy, dz] of dirs) {
      max = Math.max(max, totalDensity(orbitals, r * dx, r * dy, r * dz));
    }
  }
  return max > 0 ? max : 1;
}

/**
 * The density to treat as "white" when displaying.
 *
 * NOT the peak. The peak is the nuclear cusp, and in a heavy atom it is seven
 * or more orders of magnitude denser than the valence shell. Normalise to it
 * and the entire outer atom falls off the bottom of any sane display range,
 * leaving one bright dot and nothing else.
 *
 * So this exposes for the VALENCE SHELL instead: the reference is the density
 * around the outermost occupied subshell's radial maximum. The core then simply
 * saturates, which is fine, it is a sub-voxel point at this scale. This is the
 * same decision a photographer makes pointing a camera at a lit window: expose
 * for the subject and let the highlight blow out.
 */
export function displayReferenceDensity(orbitals: Orbital[]): number {
  if (orbitals.length === 0) return 1;

  // Outermost subshell, by mean radius.
  let outer = orbitals[0];
  let outerR = expectedRadius(outer.n, outer.l, outer.zEff);
  for (const o of orbitals) {
    const r = expectedRadius(o.n, o.l, o.zEff);
    if (r > outerR) {
      outer = o;
      outerR = r;
    }
  }

  // Where that subshell's radial probability peaks.
  let peakR = outerR;
  let best = -1;
  const limit = outerR * 3;
  for (let i = 1; i <= 600; i++) {
    const r = (i / 600) * limit;
    const p = radialProbabilityDensity(outer.n, outer.l, r, outer.zEff);
    if (p > best) {
      best = p;
      peakR = r;
    }
  }

  // Total density on that shell, taking the brightest direction.
  let ref = 0;
  for (const [dx, dy, dz] of UNIT_DIRECTIONS) {
    ref = Math.max(ref, totalDensity(orbitals, peakR * dx, peakR * dy, peakR * dz));
  }
  return ref > 0 ? ref : peakDensity(orbitals, outerR * 4);
}

/**
 * Radius beyond which the density has fallen more than `decades` powers of ten
 * below the given reference, and so is no longer represented in the volume.
 *
 * This is what the render box should be sized to. Sizing it to an enclosed-
 * probability radius instead (say 99%) leaves density still above the display
 * threshold when the ray reaches the wall, and the cube's flat faces get drawn
 * straight across the atom as hard straight edges.
 *
 * Note this is emphatically NOT "the size of the atom". The density never
 * reaches zero anywhere. It is the radius past which nothing further would be
 * visible at the chosen dynamic range.
 */
export function extentForDynamicRange(
  orbitals: Orbital[],
  decades: number,
  reference: number,
): number {
  const seed = Math.max(outerShellRadius(orbitals), 1) * 8;
  const threshold = reference * Math.pow(10, -decades);

  const steps = 1024;
  let last = 0;
  for (let i = 0; i <= steps; i++) {
    const r = (i / steps) * seed;
    let maxHere = 0;
    for (const [dx, dy, dz] of UNIT_DIRECTIONS) {
      maxHere = Math.max(maxHere, totalDensity(orbitals, r * dx, r * dy, r * dz));
    }
    if (maxHere >= threshold) last = r;
  }
  // A little headroom so the fade-out is not exactly on the wall.
  return Math.max(last * 1.08, 1);
}

/**
 * Directions sampled when looking for extremes of the density. Orbital lobes
 * point along the axes and the diagonals, so these catch every maximum that
 * matters without a full spherical sweep.
 */
const UNIT_DIRECTIONS: Array<[number, number, number]> = (() => {
  const raw: Array<[number, number, number]> = [
    [1, 0, 0], [0, 1, 0], [0, 0, 1],
    [1, 1, 0], [1, 0, 1], [0, 1, 1],
    [1, -1, 0], [1, 0, -1], [0, 1, -1],
    [1, 1, 1], [1, 1, -1], [1, -1, 1], [-1, 1, 1],
  ];
  return raw.map(([x, y, z]) => {
    const n = Math.hypot(x, y, z);
    return [x / n, y / n, z / n] as [number, number, number];
  });
})();

/** Mean radius of the outermost occupied orbital, in Bohr radii. */
export function outerShellRadius(orbitals: Orbital[]): number {
  let maxR = 0;
  for (const o of orbitals) maxR = Math.max(maxR, expectedRadius(o.n, o.l, o.zEff));
  return maxR;
}

/** Group orbitals by subshell label, preserving order. */
export function groupBySubshell(orbitals: Orbital[]): Map<string, Orbital[]> {
  const groups = new Map<string, Orbital[]>();
  for (const o of orbitals) {
    const list = groups.get(o.subshell);
    if (list) list.push(o);
    else groups.set(o.subshell, [o]);
  }
  return groups;
}

/** Total electrons represented, for sanity checks in the UI. */
export function electronCount(orbitals: Orbital[]): number {
  return orbitals.reduce((sum, o) => sum + o.occupancy, 0);
}

export { subshellCapacity };
