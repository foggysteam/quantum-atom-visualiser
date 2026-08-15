/**
 * Orbital energies, and confirmation that they are the weakest part of the model.
 *
 * Several tests assert FAILURE bounds: that the estimate always overbinds, that
 * neon is out by more than 4x, and that only the alkali metals stay within a
 * factor of two. Those are deliberate. The interface grades this quantity
 * honestly, so the grading has to be anchored to tested behaviour.
 */

import { describe, it, expect } from 'vitest';
import {
  RYDBERG_EV,
  orbitalEnergyEv,
  estimatedIonisationEnergyEv,
  effectivePrincipalNumber,
  isExtrapolated,
} from './energy';
import { buildOrbitals } from './wavefunction';
import { elementByZ } from './elements';

describe('hydrogen, where the model is exact', () => {
  it('gives the Rydberg energy for the ground state', () => {
    expect(orbitalEnergyEv(1, 1)).toBeCloseTo(-13.6057, 4);
  });

  it('predicts hydrogen ionisation energy to within a tenth of a percent', () => {
    const predicted = estimatedIonisationEnergyEv(buildOrbitals(1));
    const measured = elementByZ(1).ionisationEnergyEv!;
    expect(predicted).toBeCloseTo(measured, 1);
    expect(Math.abs(predicted - measured) / measured).toBeLessThan(0.001);
  });

  it('reproduces the hydrogen series: E goes as -1/n^2', () => {
    expect(orbitalEnergyEv(2, 1)).toBeCloseTo(-RYDBERG_EV / 4, 6);
    expect(orbitalEnergyEv(3, 1)).toBeCloseTo(-RYDBERG_EV / 9, 6);
  });
});

describe('Slater effective principal numbers', () => {
  it('is the integer up to n=3 and reduced beyond', () => {
    expect(effectivePrincipalNumber(1)).toBe(1);
    expect(effectivePrincipalNumber(3)).toBe(3);
    expect(effectivePrincipalNumber(4)).toBe(3.7);
    expect(effectivePrincipalNumber(6)).toBe(4.2);
  });

  it('flags n=7 as extrapolated beyond what Slater tabulated', () => {
    expect(isExtrapolated(6)).toBe(false);
    expect(isExtrapolated(7)).toBe(true);
  });
});

describe('multi-electron atoms, where the model overbinds badly', () => {
  const error = (z: number) => {
    const predicted = estimatedIonisationEnergyEv(buildOrbitals(z));
    const measured = elementByZ(z).ionisationEnergyEv!;
    return predicted / measured;
  };

  it('always overestimates, never underestimates', () => {
    // Double counting of electron-electron repulsion pushes every estimate too
    // deep, so the error has a consistent sign rather than scattering.
    for (const z of [2, 6, 10, 11, 18, 29, 36, 54]) {
      expect(error(z), `Z=${z} ${elementByZ(z).symbol}`).toBeGreaterThan(1);
    }
  });

  it('is worst for atoms with many electrons sharing the outer shell', () => {
    // Neon has eight electrons in one shell all screening each other, so the
    // double counting is at its most severe. Sodium's lone 3s electron has
    // almost nothing to double count against.
    expect(error(10)).toBeGreaterThan(4); // Ne
    expect(error(11)).toBeLessThan(1.6); // Na
    expect(error(10)).toBeGreaterThan(error(11));
  });

  it('stays within a factor of two for the alkali metals', () => {
    // A single loosely held valence electron outside a closed shell is the one
    // case this approximation is genuinely reasonable for.
    for (const z of [3, 11, 19, 37, 55]) {
      expect(error(z), `Z=${z} ${elementByZ(z).symbol}`).toBeLessThan(2);
    }
  });

  it('is a far worse predictor than the radius model is', () => {
    // Sizes land within ~10-20% for main-group elements; energies are out by
    // multiples. The viewer must not present them as equally trustworthy.
    expect(error(10)).toBeGreaterThan(3);
  });
});

describe('robustness across the table', () => {
  it('returns a finite positive ionisation estimate for every element', () => {
    for (let z = 1; z <= 118; z++) {
      const e = estimatedIonisationEnergyEv(buildOrbitals(z));
      expect(Number.isFinite(e), `Z=${z}`).toBe(true);
      expect(e).toBeGreaterThan(0);
    }
  });
});
