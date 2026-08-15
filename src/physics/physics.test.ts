/**
 * Core wavefunction tests: the mathematical foundation everything else rests on.
 *
 * These check identities and analytic results rather than remembered outputs, so
 * they would fail against a subtly broken implementation. The most valuable is
 * Unsold's theorem, which says a filled subshell sums to a perfectly spherical
 * density: almost any error in the spherical harmonics breaks it, and it needs
 * no reference data to check.
 */

import { describe, it, expect } from 'vitest';
import { radialWavefunction, expectedRadius, radiusEnclosing } from './radial';
import { realSphericalHarmonic, magneticQuantumNumbers } from './sphericalHarmonics';
import { associatedLaguerre, factorial } from './laguerre';
import { electronConfiguration, formatConfiguration, madelungOrder, parseConfiguration } from './aufbau';
import { effectiveNuclearCharge } from './slater';
import { buildOrbitals, totalDensity, evaluateOrbital, electronCount } from './wavefunction';

/* ------------------------------------------------------------------ */
/* Numerical integration helpers                                       */
/* ------------------------------------------------------------------ */

/** Simpson's rule on [a, b] with an even number of intervals. */
function simpson(f: (x: number) => number, a: number, b: number, n = 20000): number {
  if (n % 2 !== 0) n += 1;
  const h = (b - a) / n;
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) {
    sum += f(a + i * h) * (i % 2 === 0 ? 2 : 4);
  }
  return (sum * h) / 3;
}

/**
 * Integrate a function of direction over the unit sphere.
 * Substituting u = cos(theta) removes the sin(theta) Jacobian, leaving a flat
 * integral over u in [-1,1] and phi in [0,2pi]. Simpson in u, trapezoid in phi
 * (which is spectrally accurate for a periodic integrand).
 */
function integrateOverSphere(
  f: (x: number, y: number, z: number) => number,
  nU = 400,
  nPhi = 400,
): number {
  let total = 0;
  const dPhi = (2 * Math.PI) / nPhi;

  for (let j = 0; j < nPhi; j++) {
    const phi = j * dPhi;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);

    const g = (u: number) => {
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      return f(s * cosPhi, s * sinPhi, u);
    };
    total += simpson(g, -1, 1, nU) * dPhi;
  }
  return total;
}

/** Integrate a radial expression f(r) * r^2 out to a generous cutoff. */
function integrateRadial(f: (r: number) => number, rMax: number, n = 40000): number {
  return simpson((r) => f(r) * r * r, 0, rMax, n);
}

/* ------------------------------------------------------------------ */

describe('associated Laguerre polynomials', () => {
  it('matches known closed forms', () => {
    // L^a_0 = 1
    expect(associatedLaguerre(0, 1, 3.7)).toBeCloseTo(1, 12);
    // L^a_1(x) = 1 + a - x
    expect(associatedLaguerre(1, 1, 3)).toBeCloseTo(1 + 1 - 3, 12);
    expect(associatedLaguerre(1, 3, 0.5)).toBeCloseTo(1 + 3 - 0.5, 12);
    // L^a_2(x) = x^2/2 - (a+2)x + (a+1)(a+2)/2
    const a = 2;
    const x = 1.3;
    const expected = (x * x) / 2 - (a + 2) * x + ((a + 1) * (a + 2)) / 2;
    expect(associatedLaguerre(2, a, x)).toBeCloseTo(expected, 12);
  });

  it('computes exact factorials', () => {
    expect(factorial(0)).toBe(1);
    expect(factorial(5)).toBe(120);
    expect(factorial(13)).toBe(6227020800);
  });
});

describe('radial wavefunctions', () => {
  it('reproduces the analytic hydrogen 1s function R = 2 exp(-r)', () => {
    for (const r of [0, 0.25, 1, 2.5, 6]) {
      expect(radialWavefunction(1, 0, r, 1)).toBeCloseTo(2 * Math.exp(-r), 10);
    }
  });

  it('reproduces the analytic hydrogen 2s function', () => {
    // R_20 = (1 / (2 sqrt(2))) (2 - r) exp(-r/2)
    for (const r of [0, 1, 2, 4, 9]) {
      const expected = (1 / (2 * Math.SQRT2)) * (2 - r) * Math.exp(-r / 2);
      expect(radialWavefunction(2, 0, r, 1)).toBeCloseTo(expected, 10);
    }
  });

  it('reproduces the analytic hydrogen 2p function', () => {
    // R_21 = (1 / (2 sqrt(6))) r exp(-r/2)
    for (const r of [0, 1, 3, 8]) {
      const expected = (1 / (2 * Math.sqrt(6))) * r * Math.exp(-r / 2);
      expect(radialWavefunction(2, 1, r, 1)).toBeCloseTo(expected, 10);
    }
  });

  it('is normalised: integral of R^2 r^2 dr = 1 for every orbital up to n=5', () => {
    for (let n = 1; n <= 5; n++) {
      for (let l = 0; l < n; l++) {
        const rMax = 40 * n * n;
        const norm = integrateRadial((r) => radialWavefunction(n, l, r, 1) ** 2, rMax);
        expect(norm, `R_${n}${l} normalisation`).toBeCloseTo(1, 6);
      }
    }
  });

  it('stays normalised for a screened charge', () => {
    for (const zEff of [3.7, 7.85, 12.4]) {
      const norm = integrateRadial((r) => radialWavefunction(3, 2, r, zEff) ** 2, 200 / zEff);
      expect(norm).toBeCloseTo(1, 6);
    }
  });

  it('has exactly n - l - 1 radial nodes', () => {
    for (let n = 1; n <= 6; n++) {
      for (let l = 0; l < n; l++) {
        const rMax = 40 * n * n;
        const steps = 200000;
        let signChanges = 0;
        let prev = 0;

        for (let i = 1; i <= steps; i++) {
          const r = (i / steps) * rMax;
          const v = radialWavefunction(n, l, r, 1);
          // Ignore the exponential tail where the value has underflowed.
          if (Math.abs(v) < 1e-18) continue;
          const sign = Math.sign(v);
          if (prev !== 0 && sign !== prev) signChanges++;
          prev = sign;
        }
        expect(signChanges, `radial nodes of ${n}l=${l}`).toBe(n - l - 1);
      }
    }
  });

  it('gives <r> = 1.5 a0 for hydrogen 1s, matching the analytic result', () => {
    const numeric = integrateRadial((r) => r * radialWavefunction(1, 0, r, 1) ** 2, 60);
    expect(numeric).toBeCloseTo(1.5, 6);
    expect(expectedRadius(1, 0, 1)).toBeCloseTo(1.5, 12);
  });

  it('agrees with the analytic <r> formula across orbitals', () => {
    for (const [n, l] of [[2, 0], [2, 1], [3, 1], [3, 2], [4, 0]] as const) {
      const numeric = integrateRadial((r) => r * radialWavefunction(n, l, r, 1) ** 2, 40 * n * n);
      expect(numeric, `<r> for n=${n} l=${l}`).toBeCloseTo(expectedRadius(n, l, 1), 5);
    }
  });

  it('places the hydrogen 1s radial maximum at exactly 1 Bohr radius', () => {
    // P(r) = r^2 R^2 peaks at the Bohr radius. This is the number Bohr got right.
    let bestR = 0;
    let bestP = -1;
    for (let i = 1; i <= 100000; i++) {
      const r = (i / 100000) * 6;
      const p = r * r * radialWavefunction(1, 0, r, 1) ** 2;
      if (p > bestP) {
        bestP = p;
        bestR = r;
      }
    }
    expect(bestR).toBeCloseTo(1.0, 4);
  });

  it('radiusEnclosing returns a radius containing the requested probability', () => {
    for (const fraction of [0.5, 0.9, 0.99]) {
      const r = radiusEnclosing(2, 1, 1, fraction);
      const enclosed = integrateRadial((rr) => radialWavefunction(2, 1, rr, 1) ** 2, r);
      expect(enclosed, `enclosed at ${fraction}`).toBeCloseTo(fraction, 3);
    }
  });
});

describe('real spherical harmonics', () => {
  const allLM: Array<[number, number]> = [];
  for (let l = 0; l <= 3; l++) for (const m of magneticQuantumNumbers(l)) allLM.push([l, m]);

  it('is normalised over the unit sphere for every (l, m) up to l=3', () => {
    for (const [l, m] of allLM) {
      const norm = integrateOverSphere((x, y, z) => realSphericalHarmonic(l, m, x, y, z) ** 2);
      expect(norm, `Y_${l},${m} normalisation`).toBeCloseTo(1, 5);
    }
  });

  it('is orthogonal across all distinct (l, m) pairs', () => {
    for (let i = 0; i < allLM.length; i++) {
      for (let j = i + 1; j < allLM.length; j++) {
        const [l1, m1] = allLM[i];
        const [l2, m2] = allLM[j];
        const overlap = integrateOverSphere(
          (x, y, z) =>
            realSphericalHarmonic(l1, m1, x, y, z) * realSphericalHarmonic(l2, m2, x, y, z),
        );
        expect(Math.abs(overlap), `<Y_${l1},${m1}|Y_${l2},${m2}>`).toBeLessThan(1e-5);
      }
    }
  });

  it('satisfies Unsold theorem: a filled subshell is exactly spherical', () => {
    // sum over m of |Y_lm|^2 = (2l+1) / 4pi, independent of direction.
    // If this fails, the harmonics are wrong and every filled-shell render
    // would come out lumpy instead of round.
    // Normalised exactly here rather than written as truncated decimals: the
    // Cartesian harmonics assume r = 1, so a direction that is only unit-length
    // to 10 digits shows up as a 1e-11 error in the sum and looks like a
    // physics bug when it is really a typing bug.
    const normalise = ([x, y, z]: number[]) => {
      const n = Math.hypot(x, y, z);
      return [x / n, y / n, z / n] as const;
    };
    const directions = [
      [1, 0, 0], [0, 1, 0], [0, 0, 1],
      [1, 1, 1], [1, 2, 3], [-1, 2, -1], [0.3, -0.7, 0.2],
    ].map(normalise);

    for (let l = 0; l <= 3; l++) {
      const expected = (2 * l + 1) / (4 * Math.PI);
      for (const [x, y, z] of directions) {
        let sum = 0;
        for (const m of magneticQuantumNumbers(l)) {
          sum += realSphericalHarmonic(l, m, x, y, z) ** 2;
        }
        expect(sum, `Unsold sum for l=${l} at (${x},${y},${z})`).toBeCloseTo(expected, 12);
      }
    }
  });

  it('has l angular nodal planes through the origin (sign changes on a great circle)', () => {
    // Walk a great circle and count sign changes; a real Y_lm changes sign 2m
    // times around the equator for the phi-dependent forms.
    const pz = (t: number) => realSphericalHarmonic(1, 0, 0, Math.sin(t), Math.cos(t));
    let changes = 0;
    let prev = Math.sign(pz(0));
    for (let i = 1; i <= 2000; i++) {
      const s = Math.sign(pz((i / 2000) * 2 * Math.PI));
      if (s !== 0 && s !== prev) {
        changes++;
        prev = s;
      }
    }
    expect(changes).toBe(2); // pz has one nodal plane, crossed twice per loop
  });
});

describe('electron configurations', () => {
  it('fills hydrogen and helium correctly', () => {
    expect(formatConfiguration(electronConfiguration(1))).toBe('1s1');
    expect(formatConfiguration(electronConfiguration(2))).toBe('1s2');
  });

  it('reproduces standard main-group configurations', () => {
    expect(formatConfiguration(electronConfiguration(6))).toBe('1s2 2s2 2p2'); // C
    expect(formatConfiguration(electronConfiguration(10))).toBe('1s2 2s2 2p6'); // Ne
    expect(formatConfiguration(electronConfiguration(18))).toBe('1s2 2s2 2p6 3s2 3p6'); // Ar
  });

  it('gets copper right: [Ar] 3d10 4s1, not the Madelung prediction 3d9 4s2', () => {
    const cu = formatConfiguration(electronConfiguration(29));
    expect(cu).toBe('1s2 2s2 2p6 3s2 3p6 3d10 4s1');
    expect(cu).not.toContain('3d9');
  });

  it('gets chromium right: [Ar] 3d5 4s1', () => {
    expect(formatConfiguration(electronConfiguration(24))).toBe('1s2 2s2 2p6 3s2 3p6 3d5 4s1');
  });

  it('gets palladium right: filled 4d with an empty 5s', () => {
    const pd = electronConfiguration(46);
    expect(formatConfiguration(pd)).toBe('1s2 2s2 2p6 3s2 3p6 3d10 4s2 4p6 4d10');
    expect(pd.some((s) => s.n === 5)).toBe(false);
  });

  it('conserves electron count for every element 1..118', () => {
    for (let z = 1; z <= 118; z++) {
      const total = electronConfiguration(z).reduce((s, sh) => s + sh.electrons, 0);
      expect(total, `electron count for Z=${z}`).toBe(z);
    }
  });

  it('never overfills a subshell', () => {
    for (let z = 1; z <= 118; z++) {
      for (const s of electronConfiguration(z)) {
        expect(s.electrons, `Z=${z} subshell n=${s.n} l=${s.l}`).toBeLessThanOrEqual(
          2 * (2 * s.l + 1),
        );
        expect(s.l).toBeLessThan(s.n);
      }
    }
  });

  it('orders subshells by the Madelung rule', () => {
    const order = madelungOrder(4).map((s) => `${s.n},${s.l}`);
    expect(order.slice(0, 7)).toEqual(['1,0', '2,0', '2,1', '3,0', '3,1', '4,0', '3,2']);
  });

  it('expands noble-gas cores', () => {
    expect(formatConfiguration(parseConfiguration('[Ne] 3s2'))).toBe('1s2 2s2 2p6 3s2');
  });
});

describe('Slater effective nuclear charge', () => {
  it('matches worked textbook values for copper', () => {
    // The classic worked example: Cu 4s sees 3.70, Cu 3d sees 7.85.
    expect(effectiveNuclearCharge(4, 0, 29)).toBeCloseTo(3.7, 6);
    expect(effectiveNuclearCharge(3, 2, 29)).toBeCloseTo(7.85, 6);
  });

  it('matches worked textbook values for other elements', () => {
    // Nitrogen 2p: S = 2(0.85) + 4(0.35) = 3.10  ->  Zeff = 3.90
    expect(effectiveNuclearCharge(2, 1, 7)).toBeCloseTo(3.9, 6);
    // Fluorine 2p: S = 2(0.85) + 6(0.35) = 3.80  ->  Zeff = 5.20
    expect(effectiveNuclearCharge(2, 1, 9)).toBeCloseTo(5.2, 6);
    // Sodium 3s: S = 8(0.85) + 2(1.00) = 8.80    ->  Zeff = 2.20
    expect(effectiveNuclearCharge(3, 0, 11)).toBeCloseTo(2.2, 6);
  });

  it('leaves hydrogen unscreened', () => {
    expect(effectiveNuclearCharge(1, 0, 1)).toBe(1);
  });

  it('increases across a period, which is why atoms shrink left to right', () => {
    const li = effectiveNuclearCharge(2, 0, 3);
    const ne = effectiveNuclearCharge(2, 1, 10);
    expect(ne).toBeGreaterThan(li);
  });
});

describe('total electron density', () => {
  it('integrates to the electron count for several elements', () => {
    // Integrate rho over all space in spherical coordinates. Using the
    // spherical occupancy mode makes the density exactly radial, so a 1D
    // radial integral is exact rather than merely convergent.
    for (const z of [1, 2, 6, 10, 18, 29]) {
      const orbitals = buildOrbitals(z, 'spherical');
      const rMax = 60;
      const integral =
        4 *
        Math.PI *
        simpson((r) => totalDensity(orbitals, 0, 0, r) * r * r, 0, rMax, 60000);
      expect(integral, `electron count for Z=${z}`).toBeCloseTo(z, 3);
    }
  });

  it('reports the right number of electrons in both occupancy modes', () => {
    for (const z of [6, 26, 29, 47]) {
      expect(electronCount(buildOrbitals(z, 'hund'))).toBeCloseTo(z, 9);
      expect(electronCount(buildOrbitals(z, 'spherical'))).toBeCloseTo(z, 9);
    }
  });

  it('makes a filled subshell spherically symmetric, but an unfilled one not', () => {
    const sample = (orbitals: ReturnType<typeof buildOrbitals>, r: number) => {
      const axis = totalDensity(orbitals, 0, 0, r);
      const diag = totalDensity(orbitals, r / Math.sqrt(3), r / Math.sqrt(3), r / Math.sqrt(3));
      return Math.abs(axis - diag) / Math.max(axis, diag);
    };

    // Neon: every subshell full -> perfectly spherical.
    expect(sample(buildOrbitals(10, 'hund'), 0.8)).toBeLessThan(1e-9);

    // Carbon in Hund mode: 2p2 is oriented, so it must NOT be spherical.
    expect(sample(buildOrbitals(6, 'hund'), 1.5)).toBeGreaterThan(0.01);

    // The same carbon atom, spherically averaged, is round again.
    expect(sample(buildOrbitals(6, 'spherical'), 1.5)).toBeLessThan(1e-9);
  });

  it('gives copper a lone 4s electron reaching well beyond the 3d shell', () => {
    const orbitals = buildOrbitals(29);
    const s4 = orbitals.find((o) => o.n === 4 && o.l === 0)!;
    const d3 = orbitals.filter((o) => o.n === 3 && o.l === 2);

    expect(s4.occupancy).toBe(1);
    expect(d3.reduce((s, o) => s + o.occupancy, 0)).toBe(10);
    // The 4s electron is far less tightly held, hence available to conduct.
    expect(expectedRadius(4, 0, s4.zEff)).toBeGreaterThan(
      expectedRadius(3, 2, d3[0].zEff) * 2,
    );
  });

  it('orbital amplitudes are finite and well behaved at and near the origin', () => {
    for (const z of [1, 6, 29]) {
      for (const o of buildOrbitals(z)) {
        for (const p of [0, 1e-9, 1e-3, 1, 10]) {
          const v = evaluateOrbital(o, p, 0, 0);
          expect(Number.isFinite(v), `${o.label} at r=${p}`).toBe(true);
        }
      }
    }
  });
});
