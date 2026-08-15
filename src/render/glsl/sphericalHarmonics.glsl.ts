/**
 * GLSL port of the real spherical harmonics in physics/sphericalHarmonics.ts.
 *
 * These must stay numerically identical to the TypeScript version: the test
 * suite verifies the TS implementation (normalisation, orthogonality, Unsold's
 * theorem), and this shader is what actually gets drawn. The coefficients below
 * are the same expressions evaluated to full double precision.
 */
export const SPHERICAL_HARMONICS_GLSL = /* glsl */ `
// Real spherical harmonic Y_lm evaluated on a UNIT direction d.
// Returns a signed amplitude; the sign is the wavefunction phase.
float realSphericalHarmonic(int l, int m, vec3 d) {
  if (l == 0) {
    return 0.28209479177387814;              // 1/(2 sqrt(pi))
  }

  if (l == 1) {
    if (m == -1) return 0.4886025119029199 * d.y;   // py
    if (m ==  0) return 0.4886025119029199 * d.z;   // pz
    return             0.4886025119029199 * d.x;    // px
  }

  if (l == 2) {
    if (m == -2) return 1.0925484305920792 * d.x * d.y;              // dxy
    if (m == -1) return 1.0925484305920792 * d.y * d.z;              // dyz
    if (m ==  0) return 0.31539156525252005 * (3.0 * d.z * d.z - 1.0); // dz2
    if (m ==  1) return 1.0925484305920792 * d.x * d.z;              // dxz
    return             0.5462742152960396 * (d.x * d.x - d.y * d.y); // dx2-y2
  }

  // l == 3, the f orbitals.
  if (m == -3) return 0.5900435899266435 * d.y * (3.0 * d.x * d.x - d.y * d.y);
  if (m == -2) return 2.8906114426405540 * d.x * d.y * d.z;
  if (m == -1) return 0.4570457994644658 * d.y * (5.0 * d.z * d.z - 1.0);
  if (m ==  0) return 0.3731763325901154 * d.z * (5.0 * d.z * d.z - 3.0);
  if (m ==  1) return 0.4570457994644658 * d.x * (5.0 * d.z * d.z - 1.0);
  if (m ==  2) return 1.4453057213202770 * d.z * (d.x * d.x - d.y * d.y);
  return              0.5900435899266435 * d.x * (d.x * d.x - 3.0 * d.y * d.y);
}
`;
