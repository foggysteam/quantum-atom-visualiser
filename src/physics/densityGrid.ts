/**
 * CPU-side density sampling, used to solve for isosurface levels.
 *
 * The GPU already bakes the density into a texture, but the isosurface question
 * ("which density contour encloses 90% of the electron probability?") is an
 * integral over the whole volume, not something a fragment shader can answer.
 * So the density is rebuilt on the CPU at modest resolution and integrated
 * directly.
 *
 * Speed matters here because this runs whenever the visible orbital set changes.
 * The trick is the same separation the GPU bake uses: precompute R_nl(r) into a
 * lookup table once per subshell, then each voxel costs one interpolated table
 * read plus a cheap angular polynomial, instead of a fresh Laguerre evaluation
 * with exponentials for every orbital at every point.
 */

import { radialWavefunction } from './radial';
import { realSphericalHarmonic } from './sphericalHarmonics';
import type { Orbital } from './wavefunction';

const RADIAL_LUT_SIZE = 1024;

interface RadialTable {
  values: Float64Array;
  rMax: number;
}

function buildRadialTable(n: number, l: number, zEff: number, rMax: number): RadialTable {
  const values = new Float64Array(RADIAL_LUT_SIZE);
  for (let i = 0; i < RADIAL_LUT_SIZE; i++) {
    values[i] = radialWavefunction(n, l, (i / (RADIAL_LUT_SIZE - 1)) * rMax, zEff);
  }
  return { values, rMax };
}

function sampleRadial(table: RadialTable, r: number): number {
  if (r >= table.rMax) return 0;
  const t = (r / table.rMax) * (RADIAL_LUT_SIZE - 1);
  const i = Math.floor(t);
  const f = t - i;
  const a = table.values[i];
  const b = table.values[Math.min(i + 1, RADIAL_LUT_SIZE - 1)];
  return a + (b - a) * f;
}

export interface DensityGrid {
  /** Density at each voxel, indexed [z * res * res + y * res + x]. */
  data: Float32Array;
  resolution: number;
  /** Half-width of the sampled cube, in Bohr radii. */
  extent: number;
  /** Volume of one voxel, in cubic Bohr radii. */
  voxelVolume: number;
}

/**
 * Sample the total electron density over a cube of side 2*extent.
 * Voxel values are taken at voxel centres.
 */
export function buildDensityGrid(
  orbitals: Orbital[],
  extent: number,
  resolution = 96,
): DensityGrid {
  const data = new Float32Array(resolution * resolution * resolution);
  const step = (2 * extent) / resolution;
  const voxelVolume = step * step * step;

  if (orbitals.length === 0) {
    return { data, resolution, extent, voxelVolume };
  }

  // One radial table per distinct subshell, reaching the cube's far corners.
  const rMax = extent * Math.sqrt(3) * 1.01;
  const tables = new Map<string, RadialTable>();
  const orbitalTables: RadialTable[] = orbitals.map((o) => {
    const key = `${o.n},${o.l},${o.zEff}`;
    let table = tables.get(key);
    if (!table) {
      table = buildRadialTable(o.n, o.l, o.zEff, rMax);
      tables.set(key, table);
    }
    return table;
  });

  for (let k = 0; k < resolution; k++) {
    const z = (k + 0.5) * step - extent;
    for (let j = 0; j < resolution; j++) {
      const y = (j + 0.5) * step - extent;
      const rowBase = k * resolution * resolution + j * resolution;
      for (let i = 0; i < resolution; i++) {
        const x = (i + 0.5) * step - extent;

        const r = Math.sqrt(x * x + y * y + z * z);
        let rho = 0;

        if (r > 1e-12) {
          const dx = x / r;
          const dy = y / r;
          const dz = z / r;
          for (let o = 0; o < orbitals.length; o++) {
            const orbital = orbitals[o];
            const R = sampleRadial(orbitalTables[o], r);
            if (R === 0) continue;
            const Y = realSphericalHarmonic(orbital.l, orbital.m, dx, dy, dz);
            const psi = R * Y;
            rho += orbital.occupancy * psi * psi;
          }
        } else {
          // At the origin only s orbitals survive; every l > 0 orbital vanishes.
          for (let o = 0; o < orbitals.length; o++) {
            const orbital = orbitals[o];
            if (orbital.l !== 0) continue;
            const psi = sampleRadial(orbitalTables[o], 0) * realSphericalHarmonic(0, 0, 0, 0, 1);
            rho += orbital.occupancy * psi * psi;
          }
        }

        data[rowBase + i] = rho;
      }
    }
  }

  return { data, resolution, extent, voxelVolume };
}

/**
 * Find the density contour enclosing a given fraction of the total electron
 * probability. This is the standard chemistry convention for drawing an
 * orbital: the "shape" of a 2p orbital is the surface inside which the electron
 * is found 90% of the time.
 *
 * Most visualisations pick an arbitrary isovalue that merely looks right. This
 * solves for it: sort nothing, just bisect on the threshold, integrating the
 * density above it each time until the enclosed fraction hits the target.
 *
 * Returns the density value, in electrons per cubic Bohr radius.
 */
export function solveIsovalue(grid: DensityGrid, targetFraction: number): number {
  const { data, voxelVolume } = grid;

  let total = 0;
  let maxDensity = 0;
  for (let i = 0; i < data.length; i++) {
    total += data[i];
    if (data[i] > maxDensity) maxDensity = data[i];
  }
  total *= voxelVolume;
  if (total <= 0 || maxDensity <= 0) return 0;

  const enclosedAbove = (threshold: number): number => {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > threshold) sum += data[i];
    }
    return (sum * voxelVolume) / total;
  };

  // Bisect in LOG density: the values span many orders of magnitude, so a
  // linear bisection would spend every iteration in the top decade and never
  // resolve the faint contours at all.
  let lo = Math.log(maxDensity * 1e-12);
  let hi = Math.log(maxDensity);

  for (let iter = 0; iter < 48; iter++) {
    const mid = (lo + hi) / 2;
    const fraction = enclosedAbove(Math.exp(mid));
    if (fraction > targetFraction) lo = mid;
    else hi = mid;
  }

  return Math.exp((lo + hi) / 2);
}

/** Total electron count implied by the grid. Used as a sanity check. */
export function gridElectronCount(grid: DensityGrid): number {
  let sum = 0;
  for (let i = 0; i < grid.data.length; i++) sum += grid.data[i];
  return sum * grid.voxelVolume;
}
