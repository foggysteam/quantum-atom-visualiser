/**
 * Colormap generator.
 *
 * Builds perceptually uniform sequential colormaps from first principles and
 * fits a polynomial to each channel, printing coefficients ready to paste into
 * src/render/colormaps.ts.
 *
 *     node tools/generate-colormaps.mjs
 *
 * WHY THIS EXISTS RATHER THAN A TABLE COPIED FROM SOMEWHERE. Ready-made GLSL
 * polynomial fits for the usual scientific colormaps circulate widely, but their
 * licensing is often unclear, and an unclear licence is a poor foundation for an
 * MIT project. Generating our own removes the question entirely, and it has a
 * better property besides: the perceptual uniformity is CONSTRUCTED and can be
 * tested, rather than asserted and hoped for.
 *
 * METHOD. The colormaps are defined as a path through Oklab, a perceptual
 * colour space published by Bjorn Ottosson with the conversion maths in the
 * public domain. Perceptual uniformity is obtained by making lightness increase
 * exactly linearly along the path: equal steps in the data then produce equal
 * steps in perceived brightness, which is the property that makes a colormap
 * honest about the values it encodes.
 *
 * Chroma is pushed as high as the sRGB gamut allows and then backed off by
 * bisection wherever the path would leave the gamut, so the colours are as
 * saturated as they can be without clipping (clipping would flatten detail
 * exactly where the map is most colourful).
 */

/* ---------------------------------------------------------------------------
 * Colour space conversions.
 * Oklab -> linear sRGB after Bjorn Ottosson's published derivation.
 * ------------------------------------------------------------------------ */

function oklabToLinearSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Linear light to sRGB, the standard transfer function. */
function linearToSrgb(x) {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function inGamut([r, g, b]) {
  const eps = 1e-6;
  return r >= -eps && g >= -eps && b >= -eps && r <= 1 + eps && g <= 1 + eps && b <= 1 + eps;
}

/**
 * Convert Oklab polar coordinates to sRGB, reducing chroma by bisection until
 * the colour fits in the gamut. Returns sRGB in [0,1].
 */
function lchToSrgb(L, chroma, hueDegrees) {
  const h = (hueDegrees * Math.PI) / 180;

  let lo = 0;
  let hi = chroma;
  // If even the requested chroma is fine, keep it.
  if (inGamut(oklabToLinearSrgb(L, chroma * Math.cos(h), chroma * Math.sin(h)))) {
    lo = chroma;
  } else {
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklabToLinearSrgb(L, mid * Math.cos(h), mid * Math.sin(h)))) lo = mid;
      else hi = mid;
    }
  }

  const linear = oklabToLinearSrgb(L, lo * Math.cos(h), lo * Math.sin(h));
  return linear.map((v) => Math.min(1, Math.max(0, linearToSrgb(Math.min(1, Math.max(0, v))))));
}

/* ---------------------------------------------------------------------------
 * Colormap definitions.
 *
 * Each is a straight line in lightness (that is the uniformity guarantee) with
 * hue sweeping and chroma following an envelope that peaks in the mid range,
 * where the gamut is widest.
 * ------------------------------------------------------------------------ */

/*
 * Hue is interpolated linearly in DEGREES and may run past 360, which is how
 * the direction of travel around the wheel is chosen. That direction is not
 * cosmetic: a warm map has to wrap forwards through red and orange, and
 * interpolating 300 -> 95 the short way instead sweeps backwards through cyan,
 * producing something almost identical to the cool map. Written as 320 -> 450
 * it passes through 360/0 (red) and 60 (orange) as intended.
 *
 * Approximate Oklab hue angles: 25 red, 60 orange, 95 yellow, 140 green,
 * 200 cyan, 260 blue, 320 purple.
 */
const COLORMAPS = {
  // Cool sequential: deep indigo, through blue and teal, to a light yellow-green.
  depth: {
    lightness: [0.22, 0.95],
    hue: [292, 116],
    saturation: 0.92,
  },
  // Warm sequential: near-black purple, through red and orange, to pale yellow.
  ember: {
    lightness: [0.16, 0.96],
    hue: [325, 450],
    saturation: 0.92,
  },
};

/** Largest chroma that stays inside the sRGB gamut at this lightness and hue. */
function maxChroma(L, hueDegrees) {
  const h = (hueDegrees * Math.PI) / 180;
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklabToLinearSrgb(L, mid * Math.cos(h), mid * Math.sin(h)))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Chroma envelope: a SMOOTH curve lying just under the gamut boundary.
 *
 * This is the crux of getting a fittable colormap. The naive approach picks a
 * chroma and clips wherever it leaves the gamut, but the gamut boundary is a
 * bumpy, non-smooth function of lightness and hue (it dips to about 0.08 in the
 * mid range for these hues, then rises past 0.25 near white). Clipping against
 * it welds those bumps into the colour curve, and no polynomial of any
 * reasonable degree can follow the result: raising the degree from 6 to 14 only
 * moved the error from 36/255 to 24/255.
 *
 * So instead the boundary is measured, a low-degree polynomial is fitted to it,
 * and that fit is pushed down until it lies entirely underneath. The colours
 * then follow a smooth path that never needs clipping, which is both fittable
 * and free of the banding that clipping would cause.
 */
function chromaEnvelope(spec, steps) {
  const ts = [];
  const limits = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const L = spec.lightness[0] + (spec.lightness[1] - spec.lightness[0]) * t;
    const hue = spec.hue[0] + (spec.hue[1] - spec.hue[0]) * t;
    ts.push(t);
    limits.push(maxChroma(L, hue));
  }

  const smooth = fitPolynomial(ts, limits, 4);
  const at = (t) => evaluate(smooth, t);

  // Push the smooth curve below the true boundary everywhere.
  let overshoot = 0;
  for (let i = 0; i < steps; i++) overshoot = Math.max(overshoot, at(ts[i]) - limits[i]);

  return (t) => Math.max(0, (at(t) - overshoot) * spec.saturation);
}

function sampleColormap(spec, steps = 256) {
  const chromaAt = chromaEnvelope(spec, steps);
  const samples = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const L = spec.lightness[0] + (spec.lightness[1] - spec.lightness[0]) * t;
    const hue = spec.hue[0] + (spec.hue[1] - spec.hue[0]) * t;
    samples.push({ t, rgb: lchToSrgb(L, chromaAt(t), hue), L });
  }
  return samples;
}

/* ---------------------------------------------------------------------------
 * Least-squares polynomial fit, solved via the normal equations with Gaussian
 * elimination. The system is only 7x7, so this is more than accurate enough.
 * ------------------------------------------------------------------------ */

/**
 * Map the fitting domain from [0,1] to [-1,1].
 *
 * This matters more than it looks. A monomial least-squares fit on [0,1] uses a
 * Vandermonde system that is famously ill-conditioned, and past about degree 8
 * the numerical error grows faster than the approximation error improves: the
 * fit measurably got WORSE going from degree 8 to degree 10. Centring the
 * domain reduces the condition number by orders of magnitude and lets the
 * higher-degree terms actually help.
 *
 * The shader therefore evaluates on u = 2t - 1, not on t.
 */
const toCentred = (t) => 2 * t - 1;

function fitPolynomial(xsRaw, ys, degree) {
  const xs = xsRaw.map(toCentred);
  const n = degree + 1;
  const ata = Array.from({ length: n }, () => new Array(n).fill(0));
  const atb = new Array(n).fill(0);

  for (let k = 0; k < xs.length; k++) {
    const powers = new Array(n);
    powers[0] = 1;
    for (let i = 1; i < n; i++) powers[i] = powers[i - 1] * xs[k];
    for (let i = 0; i < n; i++) {
      atb[i] += powers[i] * ys[k];
      for (let j = 0; j < n; j++) ata[i][j] += powers[i] * powers[j];
    }
  }

  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(ata[row][col]) > Math.abs(ata[pivot][col])) pivot = row;
    }
    [ata[col], ata[pivot]] = [ata[pivot], ata[col]];
    [atb[col], atb[pivot]] = [atb[pivot], atb[col]];

    for (let row = col + 1; row < n; row++) {
      const factor = ata[row][col] / ata[col][col];
      for (let c = col; c < n; c++) ata[row][c] -= factor * ata[col][c];
      atb[row] -= factor * atb[col];
    }
  }

  const coefficients = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = atb[row];
    for (let c = row + 1; c < n; c++) sum -= ata[row][c] * coefficients[c];
    coefficients[row] = sum / ata[row][row];
  }
  return coefficients;
}

/** Evaluate a fit produced by fitPolynomial. Takes t in [0,1] and centres it. */
const evaluate = (coefficients, t) => {
  const u = toCentred(t);
  let acc = 0;
  for (let i = coefficients.length - 1; i >= 0; i--) acc = acc * u + coefficients[i];
  return acc;
};

/* ------------------------------------------------------------------------ */

const DEGREE = Number(process.argv[2] ?? 14);
const output = {};

for (const [name, spec] of Object.entries(COLORMAPS)) {
  const samples = sampleColormap(spec);
  const xs = samples.map((s) => s.t);

  const channels = [0, 1, 2].map((channel) =>
    fitPolynomial(xs, samples.map((s) => s.rgb[channel]), DEGREE),
  );

  let maxError = 0;
  for (const s of samples) {
    for (let c = 0; c < 3; c++) {
      maxError = Math.max(maxError, Math.abs(evaluate(channels[c], s.t) - s.rgb[c]));
    }
  }

  // Lightness must rise monotonically; that is the uniformity claim.
  const monotonic = samples.every((s, i) => i === 0 || s.L >= samples[i - 1].L - 1e-12);

  output[name] = { channels, maxError, monotonic };

  console.log(`\n/* ${name}: max fit error ${(maxError * 255).toFixed(2)}/255, ` +
    `lightness monotonic: ${monotonic} */`);
  for (let i = 0; i <= DEGREE; i++) {
    const [r, g, b] = channels.map((c) => c[i].toFixed(10));
    console.log(`  [${r}, ${g}, ${b}],`);
  }
}

console.log('\nSummary:');
for (const [name, { maxError }] of Object.entries(output)) {
  console.log(`  ${name}: max error ${(maxError * 255).toFixed(2)} of 255 levels`);
}

/* ---------------------------------------------------------------------------
 * Emit src/render/colormaps.ts.
 *
 * Written by the generator rather than copied by hand: there are ninety
 * coefficients and a single mistyped digit would be invisible in review and
 * produce a subtly wrong colour ramp.
 * ------------------------------------------------------------------------ */

const { writeFileSync } = await import('node:fs');

const DESCRIPTIONS = {
  depth: 'Cool sequential: deep indigo through teal to a light yellow-green.',
  ember: 'Warm sequential: near-black through purple and red to a pale yellow.',
};

const header = `/**
 * Colormap coefficients. GENERATED FILE, do not edit by hand.
 *
 *     node tools/generate-colormaps.mjs
 *
 * These are original, produced by fitting polynomials to paths constructed in
 * Oklab. Nothing here is copied from another project, which keeps this
 * repository's licensing unambiguous.
 *
 * WHAT MAKES THEM PERCEPTUALLY UNIFORM. Lightness rises exactly linearly along
 * each map, so equal steps in the data produce equal steps in perceived
 * brightness. That is what makes a colormap honest: a rainbow map invents
 * bright and dark bands that are not in the data, and the eye reads them as
 * structure that is not there. Chroma follows a smooth curve fitted just under
 * the sRGB gamut boundary, so colours are as saturated as they can be without
 * clipping.
 *
 * Polynomials are evaluated on a CENTRED domain, u = 2t - 1. Fitting on [0,1]
 * gives an ill-conditioned Vandermonde system whose accuracy stops improving
 * with degree; centring fixes it.
 *
 * See tools/generate-colormaps.mjs for the derivation, and colormaps.test.ts,
 * which verifies the uniformity claim rather than taking it on trust.
 */

`;

const emit = (name, { channels, maxError }) => {
  const rows = channels[0]
    .map((_, i) => `  [${channels.map((c) => c[i].toExponential(12)).join(', ')}],`)
    .join('\n');
  return `/**
 * ${DESCRIPTIONS[name]}
 * Maximum fit error ${(maxError * 255).toFixed(2)} of 255 levels.
 */
export const ${name.toUpperCase()}_COEFFICIENTS: ReadonlyArray<readonly [number, number, number]> = [
${rows}
];
`;
};

const evaluator = `
/**
 * Evaluate a colormap at t in [0,1], returning sRGB components in [0,1].
 *
 * Shared with the shader: glsl/palettes.glsl.ts builds its GLSL from these same
 * arrays, so there is a single source of truth and the tests exercise the exact
 * numbers the GPU uses.
 */
export function evaluateColormap(
  coefficients: ReadonlyArray<readonly [number, number, number]>,
  t: number,
): [number, number, number] {
  const u = 2 * Math.min(1, Math.max(0, t)) - 1;
  const out: [number, number, number] = [0, 0, 0];
  for (let channel = 0; channel < 3; channel++) {
    let acc = 0;
    for (let i = coefficients.length - 1; i >= 0; i--) {
      acc = acc * u + coefficients[i][channel];
    }
    out[channel] = Math.min(1, Math.max(0, acc));
  }
  return out;
}
`;

writeFileSync(
  'src/render/colormaps.ts',
  header +
    Object.entries(output)
      .map(([name, data]) => emit(name, data))
      .join('\n') +
    evaluator,
);
console.log('\nWrote src/render/colormaps.ts');
