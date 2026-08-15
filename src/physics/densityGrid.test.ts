/**
 * The CPU density grid and the isosurface level solver.
 *
 * The key test inverts the solved isovalue back into a radius and compares it
 * against hydrogen's analytically known 90% radius of 2.66 a0. That is a genuine
 * end-to-end check of the integration and bisection, not a restatement of what
 * the code already computed.
 */

import { describe, it, expect } from 'vitest';
import { buildDensityGrid, solveIsovalue, gridElectronCount } from './densityGrid';
import { buildOrbitals, extentForDynamicRange, displayReferenceDensity } from './wavefunction';
import { radialWavefunction } from './radial';

/** A generous box: the grid integral is only as good as what it contains. */
function boxFor(orbitals: ReturnType<typeof buildOrbitals>) {
  return Math.max(extentForDynamicRange(orbitals, 6, displayReferenceDensity(orbitals)), 6);
}

describe('CPU density grid', () => {
  it('agrees with the analytic hydrogen 1s density', () => {
    const orbitals = buildOrbitals(1);
    const grid = buildDensityGrid(orbitals, 8, 64);

    // rho(r) = |psi_1s|^2 = exp(-2r)/pi for hydrogen, in atomic units.
    //
    // Compare at the voxel's OWN centre rather than at the requested point. A
    // voxel centre can sit a long way from an arbitrary coordinate on a coarse
    // grid, and comparing against the requested radius would measure that
    // offset rather than the density function.
    const res = grid.resolution;
    const step = (2 * grid.extent) / res;
    const centre = (index: number) => (index + 0.5) * step - grid.extent;

    const check = (i: number, j: number, k: number) => {
      const x = centre(i);
      const y = centre(j);
      const z = centre(k);
      const r = Math.hypot(x, y, z);
      const expected = Math.exp(-2 * r) / Math.PI;
      const actual = grid.data[k * res * res + j * res + i];
      // Tolerance reflects the radial lookup table's linear interpolation
      // (1024 samples), which is the deliberate speed trade-off in this module.
      expect(actual, `rho at r=${r.toFixed(3)}`).toBeCloseTo(expected, 4);
    };

    const mid = res / 2;
    check(mid, mid, mid);
    check(mid + 2, mid, mid);
    check(mid + 4, mid, mid);
    check(mid + 3, mid + 2, mid + 1);
    check(mid + 8, mid, mid);
  });

  it('integrates to the right number of electrons', () => {
    for (const z of [1, 2, 6, 10]) {
      const orbitals = buildOrbitals(z, 'spherical');
      const grid = buildDensityGrid(orbitals, boxFor(orbitals), 110);
      // A finite cube on a coarse grid cannot be exact; it must be close.
      expect(gridElectronCount(grid), `Z=${z}`).toBeGreaterThan(z * 0.9);
      expect(gridElectronCount(grid), `Z=${z}`).toBeLessThan(z * 1.06);
    }
  });
});

describe('isosurface level solving', () => {
  it('finds a contour that really does enclose the requested fraction', () => {
    const orbitals = buildOrbitals(1);
    const grid = buildDensityGrid(orbitals, 10, 96);

    for (const target of [0.5, 0.9, 0.95]) {
      const iso = solveIsovalue(grid, target);

      // Re-integrate independently to confirm the enclosed fraction.
      let above = 0;
      let total = 0;
      for (let i = 0; i < grid.data.length; i++) {
        total += grid.data[i];
        if (grid.data[i] > iso) above += grid.data[i];
      }
      expect(above / total, `target ${target}`).toBeCloseTo(target, 2);
    }
  });

  it('matches the analytic 90% radius for hydrogen 1s', () => {
    // For a spherically symmetric orbital the contour is a sphere, so the
    // solved isovalue must correspond to the known radius enclosing 90% of the
    // radial probability. For hydrogen 1s that radius is about 2.66 a0.
    const orbitals = buildOrbitals(1);
    const grid = buildDensityGrid(orbitals, 10, 128);
    const iso = solveIsovalue(grid, 0.9);

    // Invert rho(r) = exp(-2r)/pi  ->  r = -ln(pi * rho) / 2
    const radiusFromIso = -Math.log(Math.PI * iso) / 2;

    // Independently: integrate P(r) = r^2 R^2 out to 90%.
    let acc = 0;
    let analyticR = 0;
    const steps = 200000;
    const rMax = 20;
    for (let i = 1; i <= steps; i++) {
      const r = (i / steps) * rMax;
      const R = radialWavefunction(1, 0, r, 1);
      acc += r * r * R * R * (rMax / steps);
      if (acc >= 0.9) {
        analyticR = r;
        break;
      }
    }

    expect(analyticR).toBeCloseTo(2.66, 1);
    expect(radiusFromIso).toBeCloseTo(analyticR, 1);
  });

  it('gives a larger contour for a larger enclosed fraction', () => {
    const orbitals = buildOrbitals(6, 'spherical');
    const grid = buildDensityGrid(orbitals, boxFor(orbitals), 96);
    const iso50 = solveIsovalue(grid, 0.5);
    const iso90 = solveIsovalue(grid, 0.9);
    const iso99 = solveIsovalue(grid, 0.99);
    // Enclosing more probability means reaching further out, to lower density.
    expect(iso90).toBeLessThan(iso50);
    expect(iso99).toBeLessThan(iso90);
  });
});
