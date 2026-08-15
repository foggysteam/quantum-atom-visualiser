/**
 * Nucleus geometry: how many nucleons, how big, and where to draw them.
 *
 * THE CAVEAT, stated up front: nucleons are not little balls sitting at
 * positions. A nucleus is a strongly correlated quantum many-body system. Its
 * protons and neutrons occupy shell-model orbitals and are as delocalised
 * within the nucleus as electrons are within the atom. There is no snapshot of
 * "where the protons are".
 *
 * What IS solidly measured is the nuclear charge DENSITY, from electron
 * scattering, and it is described very well by the Woods-Saxon profile below:
 * a flat interior at roughly constant density with a fuzzy surface about 2.3 fm
 * thick. That density is the honest picture, and it is offered as a render mode.
 *
 * The discrete-sphere packing here is a legibility device for counting protons
 * and neutrons, generated so that its overall distribution reproduces the
 * measured Woods-Saxon profile and its radius follows R = r0 * A^(1/3). It is
 * labelled as a model in the UI rather than passed off as a photograph.
 */

import { NUCLEAR_R0_FM, NUCLEON_DRAW_RADIUS_FM } from './constants';

export type NucleonType = 'proton' | 'neutron';

export interface Nucleon {
  /** Position in femtometres, relative to the nuclear centre of mass. */
  x: number;
  y: number;
  z: number;
  type: NucleonType;
}

export interface NucleusModel {
  nucleons: Nucleon[];
  /** Nuclear radius R = r0 * A^(1/3), in fm. */
  radiusFm: number;
  protons: number;
  neutrons: number;
  massNumber: number;
}

/** Deterministic PRNG so a given nuclide always packs identically. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nuclear radius in fm from the empirical R = r0 * A^(1/3) relation. */
export function nuclearRadiusFm(massNumber: number): number {
  return NUCLEAR_R0_FM * Math.cbrt(massNumber);
}

/** Woods-Saxon surface diffuseness parameter, in fm. */
const SURFACE_DIFFUSENESS_FM = 0.54;

/**
 * Woods-Saxon nuclear density profile, normalised to 1 at the centre.
 *   rho(r) = 1 / (1 + exp((r - R) / a))
 * This is the shape actually extracted from electron-scattering experiments.
 */
export function woodsSaxonProfile(rFm: number, massNumber: number): number {
  const R = nuclearRadiusFm(massNumber);
  return 1 / (1 + Math.exp((rFm - R) / SURFACE_DIFFUSENESS_FM));
}

/**
 * Build a nucleon packing for a nuclide.
 *
 * Nucleons are seeded from the Woods-Saxon distribution by rejection sampling,
 * then relaxed with a short-range repulsion so they do not visually overlap,
 * with a soft confining force holding the assembly together. Deterministic for
 * a given (z, n).
 */
export function packNucleus(z: number, n: number, iterations = 220): NucleusModel {
  const massNumber = z + n;
  const radiusFm = nuclearRadiusFm(massNumber);
  const rand = mulberry32(z * 1000 + n);

  if (massNumber <= 0) {
    return { nucleons: [], radiusFm: 0, protons: z, neutrons: n, massNumber };
  }

  // A single nucleon (hydrogen-1) sits at the centre; nothing to relax.
  if (massNumber === 1) {
    return {
      nucleons: [{ x: 0, y: 0, z: 0, type: z === 1 ? 'proton' : 'neutron' }],
      radiusFm,
      protons: z,
      neutrons: n,
      massNumber,
    };
  }

  // Interleave protons and neutrons so the two species end up mixed, as they
  // are in a real nucleus, rather than segregated into two blobs.
  // Draw without replacement, weighted by how many of each species remain.
  // This always yields exactly z protons and n neutrons, mixed throughout.
  const types: NucleonType[] = [];
  let pLeft = z;
  let nLeft = n;
  for (let i = 0; i < massNumber; i++) {
    if (nLeft === 0 || (pLeft > 0 && rand() < pLeft / (pLeft + nLeft))) {
      types.push('proton');
      pLeft--;
    } else {
      types.push('neutron');
      nLeft--;
    }
  }

  // Rejection-sample positions from the Woods-Saxon profile.
  const sampleRadius = radiusFm + 4 * SURFACE_DIFFUSENESS_FM;
  const positions: Array<[number, number, number]> = [];
  while (positions.length < massNumber) {
    // Uniform point in the bounding sphere.
    const u = rand();
    const r = sampleRadius * Math.cbrt(u);
    const cosTheta = 2 * rand() - 1;
    const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
    const phi = 2 * Math.PI * rand();
    if (rand() > woodsSaxonProfile(r, massNumber)) continue;
    positions.push([r * sinTheta * Math.cos(phi), r * sinTheta * Math.sin(phi), r * cosTheta]);
  }

  // Relax: short-range repulsion plus soft confinement.
  const minSeparation = 2 * NUCLEON_DRAW_RADIUS_FM;
  for (let iter = 0; iter < iterations; iter++) {
    const force: Array<[number, number, number]> = positions.map(() => [0, 0, 0]);

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[i][0] - positions[j][0];
        const dy = positions[i][1] - positions[j][1];
        const dz = positions[i][2] - positions[j][2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= minSeparation * minSeparation || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (minSeparation - d) / minSeparation;
        const fx = (dx / d) * push;
        const fy = (dy / d) * push;
        const fz = (dz / d) * push;
        force[i][0] += fx; force[i][1] += fy; force[i][2] += fz;
        force[j][0] -= fx; force[j][1] -= fy; force[j][2] -= fz;
      }
    }

    const step = 0.5 * minSeparation;
    for (let i = 0; i < positions.length; i++) {
      positions[i][0] += force[i][0] * step;
      positions[i][1] += force[i][1] * step;
      positions[i][2] += force[i][2] * step;

      // Soft confinement: pull anything past the surface back toward it.
      const r = Math.hypot(positions[i][0], positions[i][1], positions[i][2]);
      const limit = radiusFm + SURFACE_DIFFUSENESS_FM;
      if (r > limit) {
        const scale = (limit + (r - limit) * 0.25) / r;
        positions[i][0] *= scale;
        positions[i][1] *= scale;
        positions[i][2] *= scale;
      }
    }
  }

  // Recentre on the centre of mass so the nucleus does not drift off-origin.
  let cx = 0, cy = 0, cz = 0;
  for (const p of positions) { cx += p[0]; cy += p[1]; cz += p[2]; }
  cx /= positions.length; cy /= positions.length; cz /= positions.length;

  const nucleons: Nucleon[] = positions.map((p, i) => ({
    x: p[0] - cx,
    y: p[1] - cy,
    z: p[2] - cz,
    type: types[i],
  }));

  return { nucleons, radiusFm, protons: z, neutrons: n, massNumber };
}
