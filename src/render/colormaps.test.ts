/**
 * Colormap verification.
 *
 * The generator CLAIMS these maps are perceptually uniform. This checks it,
 * independently, by converting the fitted sRGB output back into Oklab and
 * measuring the lightness it actually produces. That round trip is what makes
 * the claim testable rather than decorative: the colours are fitted, so nothing
 * guarantees the fit preserved the property the construction was designed for.
 */

import { describe, it, expect } from 'vitest';
import { DEPTH_COEFFICIENTS, EMBER_COEFFICIENTS, evaluateColormap } from './colormaps';

const MAPS = {
  depth: DEPTH_COEFFICIENTS,
  ember: EMBER_COEFFICIENTS,
} as const;

/** sRGB to linear light: the inverse of the standard transfer function. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Oklab lightness of an sRGB colour, after Bjorn Ottosson's derivation. */
function oklabLightness([r, g, b]: [number, number, number]): number {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);

  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.629978687 * B);

  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

describe.each(Object.entries(MAPS))('%s colormap', (_name, coefficients) => {
  const samples = Array.from({ length: 256 }, (_, i) => {
    const t = i / 255;
    return { t, rgb: evaluateColormap(coefficients, t) };
  });

  it('stays inside the sRGB gamut across its whole range', () => {
    for (const { t, rgb } of samples) {
      for (const channel of rgb) {
        expect(Number.isFinite(channel), `t=${t.toFixed(3)}`).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });

  it('increases in perceived lightness monotonically', () => {
    // The defining property of a sequential colormap. If lightness ever dips,
    // the map invents a dark band that readers will interpret as a feature of
    // the data.
    let previous = -Infinity;
    for (const { t, rgb } of samples) {
      const L = oklabLightness(rgb);
      expect(L, `lightness dipped at t=${t.toFixed(3)}`).toBeGreaterThan(previous - 2e-3);
      previous = Math.max(previous, L);
    }
  });

  it('is perceptually UNIFORM, not merely monotonic', () => {
    // Equal steps in t must give equal steps in perceived lightness. Measured
    // as the spread of consecutive lightness differences: a rainbow map would
    // fail this badly while still passing the monotonic test above.
    const deltas: number[] = [];
    for (let i = 1; i < samples.length; i++) {
      deltas.push(oklabLightness(samples[i].rgb) - oklabLightness(samples[i - 1].rgb));
    }
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const worst = Math.max(...deltas.map((d) => Math.abs(d - mean)));

    expect(mean).toBeGreaterThan(0);
    // Every step within a small fraction of the mean step.
    expect(worst / mean).toBeLessThan(0.35);
  });

  it('spans a wide lightness range, dark to light', () => {
    const first = oklabLightness(samples[0].rgb);
    const last = oklabLightness(samples[samples.length - 1].rgb);
    expect(first).toBeLessThan(0.35);
    expect(last).toBeGreaterThan(0.85);
  });

  it('is smooth: no visible jump between adjacent samples', () => {
    for (let i = 1; i < samples.length; i++) {
      for (let c = 0; c < 3; c++) {
        const jump = Math.abs(samples[i].rgb[c] - samples[i - 1].rgb[c]);
        // Under eight 8-bit levels between neighbouring samples out of 256.
        // Generous on purpose: a channel legitimately moves fast where the hue
        // sweeps, and this test exists to catch a genuine discontinuity, which
        // would show up as a jump many times larger than this.
        expect(jump, `channel ${c} jumped at t=${samples[i].t.toFixed(3)}`).toBeLessThan(8 / 255);
      }
    }
  });

  it('carries hue, so it is not just a greyscale ramp', () => {
    const maxSpread = Math.max(
      ...samples.map(({ rgb }) => Math.max(...rgb) - Math.min(...rgb)),
    );
    expect(maxSpread).toBeGreaterThan(0.25);
  });

  it('clamps out-of-range inputs rather than extrapolating', () => {
    // A polynomial evaluated outside its fitted domain diverges fast, so the
    // implementation must clamp t before evaluating rather than after.
    expect(evaluateColormap(coefficients, -5)).toEqual(evaluateColormap(coefficients, 0));
    expect(evaluateColormap(coefficients, 5)).toEqual(evaluateColormap(coefficients, 1));
  });
});

describe('the two maps are distinguishable', () => {
  it('differ in hue at the midpoint', () => {
    const depth = evaluateColormap(DEPTH_COEFFICIENTS, 0.5);
    const ember = evaluateColormap(EMBER_COEFFICIENTS, 0.5);
    const distance = Math.hypot(
      depth[0] - ember[0],
      depth[1] - ember[1],
      depth[2] - ember[2],
    );
    expect(distance).toBeGreaterThan(0.25);
  });
});
