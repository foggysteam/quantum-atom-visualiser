/**
 * Relativistic corrections for heavy atoms.
 *
 * Anchored to the textbook results: hydrogen's 1s electron moves at exactly
 * alpha (1/137) of light speed, gold's at 57% with 22% extra mass, and
 * oganesson's at 86%. Also checks the algebraic identity that contracting every
 * radius by 1/gamma is exactly equivalent to scaling the effective charge by
 * gamma, which is what makes the correction cheap to apply.
 */

import { describe, it, expect } from 'vitest';
import {
  FINE_STRUCTURE_CONSTANT,
  INVERSE_FINE_STRUCTURE,
  orbitalSpeedFraction,
  lorentzFactor,
  radialContraction,
  relativisticZeff,
  relativisticSummary,
} from './relativity';
import { SPEED_OF_LIGHT_M_S } from './constants';

describe('fine structure constant', () => {
  it('is 1/137', () => {
    expect(INVERSE_FINE_STRUCTURE).toBeCloseTo(137.036, 3);
    expect(FINE_STRUCTURE_CONSTANT).toBeCloseTo(0.0072973526, 9);
  });
});

describe('orbital speed', () => {
  it('puts hydrogen 1s at 1/137 of light speed', () => {
    // The classic result: v/c = alpha for hydrogen.
    expect(orbitalSpeedFraction(1, 1)).toBeCloseTo(FINE_STRUCTURE_CONSTANT, 12);
    expect(orbitalSpeedFraction(1, 1) * SPEED_OF_LIGHT_M_S / 1e6).toBeCloseTo(2.19, 1);
  });

  it('scales linearly with charge and inversely with shell', () => {
    expect(orbitalSpeedFraction(50, 1)).toBeCloseTo(50 * FINE_STRUCTURE_CONSTANT, 10);
    expect(orbitalSpeedFraction(50, 5)).toBeCloseTo(10 * FINE_STRUCTURE_CONSTANT, 10);
  });

  it('never reaches light speed, even past the critical charge', () => {
    // Z alpha = 1 around Z = 137, where this expression would break down.
    for (const z of [137, 200, 5000]) {
      const v = orbitalSpeedFraction(z, 1);
      expect(v).toBeLessThan(1);
      expect(Number.isFinite(lorentzFactor(v))).toBe(true);
    }
  });
});

describe('gold, the headline case', () => {
  const gold = relativisticSummary(79);

  it('has its 1s electron at roughly 58% of light speed', () => {
    expect(gold.innerSpeedFraction).toBeGreaterThan(0.55);
    expect(gold.innerSpeedFraction).toBeLessThan(0.60);
  });

  it('gives that electron about 22% extra mass', () => {
    expect(gold.massIncreasePercent).toBeGreaterThan(18);
    expect(gold.massIncreasePercent).toBeLessThan(26);
  });

  it('contracts its 1s orbital to about 82% of the non-relativistic size', () => {
    expect(gold.innerContraction).toBeGreaterThan(0.78);
    expect(gold.innerContraction).toBeLessThan(0.85);
  });
});

describe('trend across the periodic table', () => {
  it('is utterly negligible for light elements', () => {
    const h = relativisticSummary(1);
    expect(h.innerSpeedFraction).toBeLessThan(0.01);
    expect(h.massIncreasePercent).toBeLessThan(0.01);
    expect(h.innerContraction).toBeGreaterThan(0.999);
  });

  it('grows monotonically with atomic number', () => {
    let previous = 0;
    for (let z = 1; z <= 118; z++) {
      const v = relativisticSummary(z).innerSpeedFraction;
      expect(v).toBeGreaterThan(previous);
      previous = v;
    }
  });

  it('reaches about 86% of light speed at oganesson', () => {
    const og = relativisticSummary(118);
    expect(og.innerSpeedFraction).toBeGreaterThan(0.83);
    expect(og.innerSpeedFraction).toBeLessThan(0.89);
    // Nearly double the rest mass, halving the orbital radius.
    expect(og.lorentzFactor).toBeGreaterThan(1.8);
    expect(og.innerContraction).toBeLessThan(0.56);
  });

  it('flags heavy elements as chemically significant and light ones as not', () => {
    expect(relativisticSummary(6).chemicallySignificant).toBe(false);
    expect(relativisticSummary(79).chemicallySignificant).toBe(true);
  });
});

describe('applying the correction', () => {
  it('contracts by exactly 1/gamma', () => {
    for (const [zEff, n] of [[78.7, 1], [40, 2], [10, 3]] as const) {
      const gamma = lorentzFactor(orbitalSpeedFraction(zEff, n));
      expect(radialContraction(zEff, n)).toBeCloseTo(1 / gamma, 12);
    }
  });

  it('is exactly equivalent to scaling the effective charge by gamma', () => {
    // The radial function depends on r only through rho = 2 Z r / n, so
    // shrinking r by 1/gamma and raising Z by gamma are the same operation.
    for (const [zEff, n] of [[78.7, 1], [30, 2]] as const) {
      const gamma = lorentzFactor(orbitalSpeedFraction(zEff, n));
      expect(relativisticZeff(zEff, n)).toBeCloseTo(zEff * gamma, 10);
      expect(relativisticZeff(zEff, n) * radialContraction(zEff, n)).toBeCloseTo(zEff, 10);
    }
  });

  it('leaves light atoms essentially untouched', () => {
    expect(relativisticZeff(1, 1)).toBeCloseTo(1, 4);
    expect(radialContraction(6, 2)).toBeGreaterThan(0.999);
  });

  it('affects inner shells far more than valence shells', () => {
    // Gold: the 1s electron is deeply relativistic; the screened 6s barely moves.
    // The valence contraction in real gold is inherited from the core through
    // orthogonality, which an independent-orbital model cannot reproduce.
    const inner = radialContraction(78.7, 1);
    const valence = radialContraction(3.7, 6);
    expect(inner).toBeLessThan(0.85);
    expect(valence).toBeGreaterThan(0.9999);
  });
});
