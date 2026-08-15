/**
 * REAL spherical harmonics Y_lm for l = 0..3, in Cartesian form.
 *
 * Why real and not complex: the textbook solution of the Schrodinger equation
 * gives COMPLEX harmonics e^(i m phi), whose squared modulus is independent of
 * phi. Render those directly and every p orbital comes out as a featureless
 * doughnut, because you have averaged away the angular structure.
 *
 * The familiar lobed shapes (px, py, pz, dxy, dz2, ...) are real linear
 * combinations of the degenerate +m and -m solutions. They are equally valid
 * eigenfunctions of the Hamiltonian (degenerate states can be freely mixed),
 * and they are the ones that correspond to what is actually observed when an
 * atom bonds, because bonding breaks the rotational symmetry. So the real forms
 * are the physically meaningful basis here, not a simplification.
 *
 * Given in Cartesian form on a UNIT direction vector. This avoids acos/atan2
 * entirely, which matters because the identical code runs per-voxel in GLSL.
 *
 * Every coefficient below is normalised so that the integral of Y^2 over the
 * unit sphere is exactly 1. This is checked numerically in the test suite.
 */

/** Canonical chemistry label for each (l, m) pair. */
export const ORBITAL_LABELS: Record<number, Record<number, string>> = {
  0: { 0: 's' },
  1: { [-1]: 'py', 0: 'pz', 1: 'px' },
  2: { [-2]: 'dxy', [-1]: 'dyz', 0: 'dz2', 1: 'dxz', 2: 'dx2-y2' },
  3: {
    [-3]: 'fy(3x2-y2)',
    [-2]: 'fxyz',
    [-1]: 'fyz2',
    0: 'fz3',
    1: 'fxz2',
    2: 'fz(x2-y2)',
    3: 'fx(x2-3y2)',
  },
};

// Precomputed normalisation coefficients.
const C00 = 0.5 * Math.sqrt(1 / Math.PI); // 1/(2 sqrt(pi))

const C1 = 0.5 * Math.sqrt(3 / Math.PI);

const C2_XY = 0.5 * Math.sqrt(15 / Math.PI);
const C2_Z2 = 0.25 * Math.sqrt(5 / Math.PI);
const C2_X2Y2 = 0.25 * Math.sqrt(15 / Math.PI);

const C3_3 = 0.25 * Math.sqrt(35 / (2 * Math.PI));
const C3_2 = 0.5 * Math.sqrt(105 / Math.PI);
const C3_1 = 0.25 * Math.sqrt(21 / (2 * Math.PI));
const C3_0 = 0.25 * Math.sqrt(7 / Math.PI);
const C3_P2 = 0.25 * Math.sqrt(105 / Math.PI);

/**
 * Evaluate the real spherical harmonic Y_lm at a unit direction (x, y, z).
 *
 * The caller must pass a NORMALISED vector. Denormalised input silently
 * produces wrong magnitudes, because the Cartesian forms assume r = 1.
 *
 * Returns a SIGNED value. The sign is the wavefunction phase and is physically
 * essential: it is what makes bonding versus antibonding possible. Density is
 * the square, so the sign vanishes for a single atom, but it must survive here.
 */
export function realSphericalHarmonic(
  l: number,
  m: number,
  x: number,
  y: number,
  z: number,
): number {
  switch (l) {
    case 0:
      return C00;

    case 1:
      switch (m) {
        case -1:
          return C1 * y;
        case 0:
          return C1 * z;
        case 1:
          return C1 * x;
      }
      break;

    case 2:
      switch (m) {
        case -2:
          return C2_XY * x * y;
        case -1:
          return C2_XY * y * z;
        case 0:
          // (3z^2 - r^2) with r = 1
          return C2_Z2 * (3 * z * z - 1);
        case 1:
          return C2_XY * x * z;
        case 2:
          return C2_X2Y2 * (x * x - y * y);
      }
      break;

    case 3:
      switch (m) {
        case -3:
          return C3_3 * y * (3 * x * x - y * y);
        case -2:
          return C3_2 * x * y * z;
        case -1:
          return C3_1 * y * (5 * z * z - 1);
        case 0:
          return C3_0 * z * (5 * z * z - 3);
        case 1:
          return C3_1 * x * (5 * z * z - 1);
        case 2:
          return C3_P2 * z * (x * x - y * y);
        case 3:
          return C3_3 * x * (x * x - 3 * y * y);
      }
      break;
  }

  throw new Error(`realSphericalHarmonic: unsupported (l=${l}, m=${m}); supported l = 0..3`);
}

/** All valid m values for a given l, from -l to +l. */
export function magneticQuantumNumbers(l: number): number[] {
  const out: number[] = [];
  for (let m = -l; m <= l; m++) out.push(m);
  return out;
}
