/**
 * Bakes the total electron density into a texture on the GPU.
 *
 * WHY BAKE AT ALL: the alternative is evaluating the wavefunctions at every
 * raymarch step. With ~256 steps and ~18 orbitals that is over 4000 evaluations
 * per pixel per frame, which will not hold 60fps at 1080p. Baking once per
 * element change turns the per-frame cost into a couple of texture fetches.
 *
 * THE SPLIT: psi separates into R_nl(r) * Y_lm(direction), and the two halves
 * want different treatment.
 *
 *  - The RADIAL part needs associated Laguerre polynomials, which are fiddly and
 *    numerically delicate. Rather than reimplement them in GLSL and risk them
 *    drifting from the tested TypeScript version, they are evaluated once on the
 *    CPU into a lookup table and uploaded. One implementation, one test suite.
 *
 *  - The ANGULAR part is a handful of cheap polynomials in x, y, z, so it is
 *    evaluated analytically in the shader at full precision. No resolution loss
 *    on the lobe shapes, which is where the eye actually looks.
 *
 * STORAGE FORMAT, and this is the detail the whole render lives or dies on:
 * electron density does not span "a wide range", it spans about EIGHT TO TEN
 * ORDERS OF MAGNITUDE. For copper the density at the nuclear cusp is around
 * 1.6e4 while the 4s valence cloud you actually want to look at is around 1e-3.
 * That is a ratio of ten million to one.
 *
 * Store that linearly, or even cube-rooted, and the entire visible atom rounds
 * to zero next to the spike at r = 0. So the texture stores LOG density,
 * normalised across a fixed number of decades below the peak:
 *
 *     stored = 1 + log10(rho / rhoMax) / decades      clamped to [0, 1]
 *
 * Every decade then gets equal room and equal precision, which is what lets one
 * transfer function reveal both the core and the faint outer shells.
 *
 * STORAGE LAYOUT: a 2D tiled atlas, not a 3D texture. See volumeAtlas.glsl.ts
 * for why; the short version is that rendering into WebGL3DRenderTarget layers
 * silently writes nothing on this driver.
 */

import * as THREE from 'three';
import { SPHERICAL_HARMONICS_GLSL } from './glsl/sphericalHarmonics.glsl';
import { FULLSCREEN_VERT } from './glsl/fullscreen.glsl';
import { radialWavefunction } from '../physics/radial';
import type { Orbital } from '../physics/wavefunction';

/** Samples in the radial lookup table, per subshell. */
const RADIAL_LUT_SIZE = 2048;

/** Maximum orbitals the bake shader can handle in one pass. */
export const MAX_ORBITALS = 64;

/**
 * How many decades BELOW THE DISPLAY REFERENCE the texture represents.
 *
 * The reference is the valence-shell density, not the nuclear peak, so four
 * decades is a wide window rather than a narrow one: it runs from the saturated
 * core down through the valence shell and out into the tail.
 *
 * More decades is not "more accurate". The density is nonzero everywhere, so
 * every extra decade inflates the render box (which is sized to where this
 * range runs out), spends voxels on an ever fainter halo, and blurs the
 * structure actually worth seeing.
 */
export const LOG_DECADES = 4;

const BAKE_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

uniform sampler2D uRadialLUT;   // x: radius samples, y: one row per subshell
uniform float uRadialLutSize;
uniform float uRadialRMax;      // radius (Bohr) at the last LUT sample

uniform vec4 uOrbitals[${MAX_ORBITALS}]; // (radialRow, l, m, occupancy)
uniform int uOrbitalCount;

uniform float uTiles;           // atlas tiles per row
uniform float uResolution;      // voxels per axis
uniform float uExtent;          // half-width of the volume, in Bohr radii
uniform float uDensityRef;      // peak density, mapped to stored value 1.0
uniform float uLogDecades;      // decades below the peak that map down to 0.0

${SPHERICAL_HARMONICS_GLSL}

// Manually interpolated LUT fetch. Uses texelFetch with explicit mixing rather
// than relying on linear filtering of a float texture, which needs an extension
// that is not guaranteed to be present.
float radialAt(float row, float r) {
  if (r >= uRadialRMax) return 0.0;
  float t = (r / uRadialRMax) * (uRadialLutSize - 1.0);
  float i0 = floor(t);
  float frac = t - i0;
  int xi = int(i0);
  int yi = int(row);
  float a = texelFetch(uRadialLUT, ivec2(xi, yi), 0).r;
  float b = texelFetch(uRadialLUT, ivec2(min(xi + 1, int(uRadialLutSize) - 1), yi), 0).r;
  return mix(a, b, frac);
}

void main() {
  // Work out which slice and which voxel this atlas texel represents.
  vec2 px = gl_FragCoord.xy;
  float tileX = floor(px.x / uResolution);
  float tileY = floor(px.y / uResolution);
  float slice = tileY * uTiles + tileX;

  // Trailing tiles in the last row are unused padding.
  if (slice >= uResolution) {
    fragColor = vec4(0.0);
    return;
  }

  vec2 local = mod(px, uResolution);
  vec3 uvw = vec3(local, slice + 0.5) / uResolution;
  vec3 p = (uvw * 2.0 - 1.0) * uExtent;

  float r = length(p);
  vec3 dir = r > 1e-9 ? p / r : vec3(0.0, 0.0, 1.0);

  float density = 0.0;
  float signedAmplitude = 0.0;

  for (int i = 0; i < ${MAX_ORBITALS}; i++) {
    if (i >= uOrbitalCount) break;
    vec4 o = uOrbitals[i];
    float R = radialAt(o.x, r);
    if (R == 0.0) continue;
    float Y = realSphericalHarmonic(int(o.y), int(o.z), dir);
    float psi = R * Y;
    density += o.w * psi * psi;
    signedAmplitude += o.w * psi;
  }

  // Log encoding, described in the file header.
  float stored = 0.0;
  if (density > 0.0) {
    stored = clamp(1.0 + log(density / uDensityRef) / (2.302585093 * uLogDecades), 0.0, 1.0);
  }

  // Phase channel: the stored magnitude carrying the sign of psi. Meaningful
  // when a single orbital is shown, where it is exactly sign(psi); with several
  // orbitals summed it has no physical reading, and the UI says so.
  float phase = sign(signedAmplitude) * stored;

  fragColor = vec4(stored, phase, 0.0, 1.0);
}
`;

export interface VolumeResult {
  texture: THREE.Texture;
  /** Half-width of the baked volume, in Bohr radii. */
  extent: number;
  densityRef: number;
  resolution: number;
  tiles: number;
}

export class DensityVolume {
  private renderer: THREE.WebGLRenderer;
  private material: THREE.RawShaderMaterial;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private target: THREE.WebGLRenderTarget;
  private radialTexture: THREE.DataTexture | null = null;

  readonly resolution: number;
  readonly tiles: number;

  public extent = 10;
  public densityRef = 1;

  constructor(renderer: THREE.WebGLRenderer, resolution = 192) {
    this.renderer = renderer;

    // Choose a resolution the GPU can actually hold as one atlas texture.
    const maxTexture = renderer.capabilities.maxTextureSize;
    let res = resolution;
    let tiles = Math.ceil(Math.sqrt(res));
    while (tiles * res > maxTexture && res > 32) {
      res = Math.floor(res / 2);
      tiles = Math.ceil(Math.sqrt(res));
    }
    this.resolution = res;
    this.tiles = tiles;

    const atlasSize = tiles * res;
    this.target = new THREE.WebGLRenderTarget(atlasSize, atlasSize, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });

    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BAKE_FRAG,
      uniforms: {
        uRadialLUT: { value: null },
        uRadialLutSize: { value: RADIAL_LUT_SIZE },
        uRadialRMax: { value: 1 },
        uOrbitals: {
          value: Array.from({ length: MAX_ORBITALS }, () => new THREE.Vector4()),
        },
        uOrbitalCount: { value: 0 },
        uTiles: { value: tiles },
        uResolution: { value: res },
        uExtent: { value: 10 },
        uDensityRef: { value: 1 },
        uLogDecades: { value: LOG_DECADES },
      },
      // The renderer runs with autoClear off, so the depth buffer is never
      // cleared and holds undefined values. A fullscreen quad sits at NDC z = 0
      // and with depth testing on it loses to whatever is already there: the
      // draw call issues, reports no error, and writes nothing.
      depthTest: false,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  get texture(): THREE.Texture {
    return this.target.texture;
  }

  /**
   * Build the radial lookup table for the distinct subshells present, and
   * return the row index assigned to each (n, l, zEff) triple.
   */
  private buildRadialLUT(orbitals: Orbital[], rMax: number): Map<string, number> {
    const rows = new Map<string, number>();
    for (const o of orbitals) {
      const key = `${o.n},${o.l},${o.zEff}`;
      if (!rows.has(key)) rows.set(key, rows.size);
    }

    const height = Math.max(1, rows.size);
    const data = new Float32Array(RADIAL_LUT_SIZE * height);

    for (const [key, row] of rows) {
      const [n, l, zEff] = key.split(',').map(Number);
      for (let i = 0; i < RADIAL_LUT_SIZE; i++) {
        const r = (i / (RADIAL_LUT_SIZE - 1)) * rMax;
        data[row * RADIAL_LUT_SIZE + i] = radialWavefunction(n, l, r, zEff);
      }
    }

    this.radialTexture?.dispose();
    const tex = new THREE.DataTexture(
      data,
      RADIAL_LUT_SIZE,
      height,
      THREE.RedFormat,
      THREE.FloatType,
    );
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    this.radialTexture = tex;

    return rows;
  }

  /**
   * Bake the density of the given orbitals.
   *
   * `extent` is the half-width in Bohr. `densityRef` is the density that maps to
   * the top of the stored range; anything denser saturates. See
   * displayReferenceDensity in physics/wavefunction.ts for why that is the
   * valence-shell density rather than the peak.
   */
  bake(orbitals: Orbital[], extent: number, densityRef: number): VolumeResult {
    if (orbitals.length > MAX_ORBITALS) {
      throw new Error(
        `DensityVolume supports at most ${MAX_ORBITALS} orbitals, got ${orbitals.length}`,
      );
    }

    this.extent = extent;
    this.densityRef = densityRef > 0 ? densityRef : 1;

    // The LUT must reach the far corners of the cube, not just its faces.
    const rMax = extent * Math.sqrt(3) * 1.01;
    const rows = this.buildRadialLUT(orbitals, rMax);

    const u = this.material.uniforms;
    u.uRadialLUT.value = this.radialTexture;
    u.uRadialRMax.value = rMax;
    u.uExtent.value = extent;
    u.uDensityRef.value = this.densityRef;
    u.uOrbitalCount.value = orbitals.length;

    const slots = u.uOrbitals.value as THREE.Vector4[];
    orbitals.forEach((o, i) => {
      const row = rows.get(`${o.n},${o.l},${o.zEff}`)!;
      slots[i].set(row, o.l, o.m, o.occupancy);
    });

    // One draw call fills every slice.
    const previousTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previousTarget);

    return {
      texture: this.target.texture,
      extent,
      densityRef: this.densityRef,
      resolution: this.resolution,
      tiles: this.tiles,
    };
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.radialTexture?.dispose();
  }
}
