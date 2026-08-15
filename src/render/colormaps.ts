/**
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

/**
 * Cool sequential: deep indigo through teal to a light yellow-green.
 * Maximum fit error 0.90 of 255 levels.
 */
export const DEPTH_COEFFICIENTS: ReadonlyArray<readonly [number, number, number]> = [
  [3.283249711876e-1, 5.231492733474e-1, 5.427986345236e-1],
  [2.015918942929e-1, 4.993604328054e-1, 3.161803670223e-1],
  [-8.941700371992e-1, 2.601417144569e-1, 1.200445610572e-1],
  [-1.010936135070e+0, 1.263263241708e-1, -1.157217469055e+0],
  [-3.036862187492e+0, -5.878737546624e-1, -9.065885976969e-1],
  [7.286391580564e+0, -2.833777668837e-2, 8.808758434605e-1],
  [2.624166291866e+1, 2.056825120321e-1, 4.198892742889e-1],
  [-1.921279720469e+1, -6.016744543481e-1, 1.363424998938e+0],
  [-5.375296619474e+1, 6.699178421840e-1, 1.092865713265e+0],
  [2.636450950979e+1, 1.254633972631e+0, -4.753710460140e+0],
  [4.825716893370e+1, -1.485321419176e+0, -3.716163246912e+0],
  [-1.818984806322e+1, -1.183364238028e+0, 5.628064569761e+0],
  [-1.848697150392e+1, 1.429624119199e+0, 4.757479329087e+0],
  [4.959986328490e+0, 4.053036683381e-1, -2.195395662626e+0],
  [1.857208644187e+0, -4.989312075853e-1, -1.968892875398e+0],
];

/**
 * Warm sequential: near-black through purple and red to a pale yellow.
 * Maximum fit error 0.32 of 255 levels.
 */
export const EMBER_COEFFICIENTS: ReadonlyArray<readonly [number, number, number]> = [
  [7.931752356071e-1, 2.168310306649e-1, 1.912713783096e-1],
  [5.900533037065e-1, 6.140321934658e-1, -3.178039480094e-1],
  [-4.489092668465e-1, 4.948140277047e-1, -2.306825766054e-1],
  [-2.466648518763e-1, -5.939734484461e-1, 1.614846046264e+0],
  [2.222241278689e-1, 2.732823589434e-1, 4.625981293927e+0],
  [1.035074663240e-1, 1.218345013611e+0, -1.405172759823e-1],
  [-1.987141016372e-2, -2.936293011173e+0, -1.696459934933e+1],
  [5.728333527887e-3, -1.377092345687e+0, -6.304282087815e+0],
  [1.365418810740e-2, 6.752868485314e+0, 3.360283490180e+1],
  [-5.856024431377e-3, 8.400856513494e-1, 1.310551880607e+1],
  [-9.119332963184e-3, -8.174649897767e+0, -3.767690966139e+1],
  [-3.630842794845e-3, -2.567335143793e-1, -1.102396312078e+1],
  [-5.405288747400e-3, 5.209283837170e+0, 2.239598020103e+1],
  [1.258102164845e-3, 2.582288807704e-2, 3.419967706018e+0],
  [3.148388820949e-3, -1.360887615951e+0, -5.478183282663e+0],
];

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
