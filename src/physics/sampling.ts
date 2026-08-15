/**
 * Monte Carlo sampling of |psi|^2.
 *
 * This produces the "dot density" picture: every point is one possible outcome
 * of measuring where the electron is. It is arguably the most honest depiction
 * available, because it shows exactly what quantum mechanics actually predicts,
 * which is a probability distribution over measurement results and nothing more.
 *
 * Crucially the dots are NOT a trajectory. There is no order to them and no
 * path connecting them. Scatter ten thousand of them and you are looking at
 * ten thousand independent hypothetical measurements of ten thousand identically
 * prepared atoms, not one electron moving around.
 *
 * Strategy: the wavefunction separates, so sample radius and direction
 * independently. Radius by inverse-CDF on P(r) = r^2 R(r)^2 (exact, no
 * rejection), direction by rejection sampling against |Y_lm|^2.
 */

import { radialProbabilityDensity, radiusEnclosing } from './radial';
import { realSphericalHarmonic } from './sphericalHarmonics';
import type { Orbital } from './wavefunction';

const CDF_RESOLUTION = 2048;

interface RadialSampler {
  /** Cumulative probability at each grid point, normalised to end at 1. */
  cdf: Float64Array;
  /** Radius (Bohr) at each grid point. */
  radii: Float64Array;
}

const radialCache = new Map<string, RadialSampler>();

function buildRadialSampler(n: number, l: number, zEff: number): RadialSampler {
  const key = `${n},${l},${zEff.toFixed(6)}`;
  const cached = radialCache.get(key);
  if (cached) return cached;

  // Go out far enough that the truncated tail is negligible.
  const rMax = radiusEnclosing(n, l, zEff, 0.9999);
  const radii = new Float64Array(CDF_RESOLUTION + 1);
  const cdf = new Float64Array(CDF_RESOLUTION + 1);

  const h = rMax / CDF_RESOLUTION;
  let acc = 0;
  let prev = radialProbabilityDensity(n, l, 0, zEff);
  radii[0] = 0;
  cdf[0] = 0;

  for (let i = 1; i <= CDF_RESOLUTION; i++) {
    const r = i * h;
    const curr = radialProbabilityDensity(n, l, r, zEff);
    acc += ((prev + curr) / 2) * h; // trapezoid
    radii[i] = r;
    cdf[i] = acc;
    prev = curr;
  }

  // Normalise so the table ends at exactly 1.
  const total = cdf[CDF_RESOLUTION];
  for (let i = 0; i <= CDF_RESOLUTION; i++) cdf[i] /= total;

  const sampler = { cdf, radii };
  radialCache.set(key, sampler);
  return sampler;
}

/** Draw a radius from P(r) = r^2 R^2 by inverting the CDF. */
function sampleRadius(sampler: RadialSampler, u: number): number {
  const { cdf, radii } = sampler;
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] <= u) lo = mid;
    else hi = mid;
  }
  const span = cdf[hi] - cdf[lo];
  const t = span > 0 ? (u - cdf[lo]) / span : 0;
  return radii[lo] + t * (radii[hi] - radii[lo]);
}

const angularMaxCache = new Map<string, number>();

/** Maximum of |Y_lm|^2 over the sphere, found on a fine grid with a safety margin. */
function angularMaximum(l: number, m: number): number {
  const key = `${l},${m}`;
  const cached = angularMaxCache.get(key);
  if (cached !== undefined) return cached;

  let max = 0;
  const steps = 200;
  for (let i = 0; i <= steps; i++) {
    const cosTheta = -1 + (2 * i) / steps;
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    for (let j = 0; j < steps; j++) {
      const phi = (2 * Math.PI * j) / steps;
      const v = realSphericalHarmonic(
        l, m,
        sinTheta * Math.cos(phi),
        sinTheta * Math.sin(phi),
        cosTheta,
      );
      max = Math.max(max, v * v);
    }
  }
  const withMargin = max * 1.05;
  angularMaxCache.set(key, withMargin);
  return withMargin;
}

/** Draw a unit direction from |Y_lm|^2 by rejection. */
function sampleDirection(
  l: number,
  m: number,
  rand: () => number,
): [number, number, number] {
  if (l === 0) {
    // s orbitals are isotropic: sample the sphere uniformly, no rejection.
    const cosTheta = 2 * rand() - 1;
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    const phi = 2 * Math.PI * rand();
    return [sinTheta * Math.cos(phi), sinTheta * Math.sin(phi), cosTheta];
  }

  const ceiling = angularMaximum(l, m);
  // Bounded so a pathological case cannot spin forever.
  for (let attempt = 0; attempt < 1000; attempt++) {
    const cosTheta = 2 * rand() - 1;
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    const phi = 2 * Math.PI * rand();
    const x = sinTheta * Math.cos(phi);
    const y = sinTheta * Math.sin(phi);
    const z = cosTheta;
    const Y = realSphericalHarmonic(l, m, x, y, z);
    if (rand() * ceiling <= Y * Y) return [x, y, z];
  }
  return [0, 0, 1];
}

export interface SampledPoint {
  x: number;
  y: number;
  z: number;
  /** Sign of psi at this point: the phase lobe the point belongs to. */
  phase: number;
  /** Index into the orbital array the point was drawn from. */
  orbitalIndex: number;
}

/**
 * Sample `count` electron positions from a set of occupied orbitals.
 * Orbitals are chosen in proportion to their occupancy, so the resulting cloud
 * is the correctly weighted total electron density.
 *
 * Positions are returned in Bohr radii.
 */
export function sampleElectronPositions(
  orbitals: Orbital[],
  count: number,
  seed = 1,
): { positions: Float32Array; phases: Float32Array; orbitalIndices: Uint16Array } {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const orbitalIndices = new Uint16Array(count);

  if (orbitals.length === 0) {
    return { positions, phases, orbitalIndices };
  }

  // Cumulative occupancy for picking which orbital each point comes from.
  const cumulative: number[] = [];
  let totalOccupancy = 0;
  for (const o of orbitals) {
    totalOccupancy += o.occupancy;
    cumulative.push(totalOccupancy);
  }

  let state = seed >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = 0; i < count; i++) {
    // Choose an orbital weighted by occupancy.
    const target = rand() * totalOccupancy;
    let oi = 0;
    while (oi < cumulative.length - 1 && cumulative[oi] < target) oi++;
    const orbital = orbitals[oi];

    const sampler = buildRadialSampler(orbital.n, orbital.l, orbital.zEff);
    const r = sampleRadius(sampler, rand());
    const [dx, dy, dz] = sampleDirection(orbital.l, orbital.m, rand);

    positions[i * 3] = r * dx;
    positions[i * 3 + 1] = r * dy;
    positions[i * 3 + 2] = r * dz;
    phases[i] = Math.sign(realSphericalHarmonic(orbital.l, orbital.m, dx, dy, dz)) || 1;
    orbitalIndices[i] = oi;
  }

  return { positions, phases, orbitalIndices };
}
