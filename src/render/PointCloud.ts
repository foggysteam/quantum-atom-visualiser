/**
 * The Monte Carlo point cloud: |psi|^2 shown as sampled measurement outcomes.
 *
 * Each dot is one hypothetical result of asking "where is the electron?".
 * Read the cloud as ten thousand independent measurements on ten thousand
 * identically prepared atoms, NOT as one electron tracing a path. There is no
 * ordering to the points and no trajectory connecting them.
 *
 * Historically this is also the most defensible way to draw an atom, because it
 * is the picture Max Born's probability interpretation licenses directly and
 * nothing more.
 */

import * as THREE from 'three';
import { sampleElectronPositions } from '../physics/sampling';
import type { Orbital } from '../physics/wavefunction';

const VERT = /* glsl */ `
uniform float uSize;
uniform float uScale;
attribute float aPhase;
attribute float aOrbital;
varying float vPhase;
varying float vOrbital;

void main() {
  vPhase = aPhase;
  vOrbital = aOrbital;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  // Perspective-correct point size, clamped so distant clouds stay visible.
  gl_PointSize = clamp(uSize * uScale / -mvPosition.z, 1.0, 9.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColourA;
uniform vec3 uColourB;
uniform float uOpacity;
uniform int uPhaseMode;
varying float vPhase;
varying float vOrbital;

void main() {
  // Round, soft-edged points. Square points read as pixels, not measurements.
  vec2 d = gl_PointCoord - vec2(0.5);
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float falloff = 1.0 - smoothstep(0.0, 0.25, r2);

  vec3 colour = uPhaseMode == 1
    ? (vPhase >= 0.0 ? uColourA : uColourB)
    : mix(uColourB, uColourA, fract(vOrbital * 0.61803398875));

  gl_FragColor = vec4(colour, uOpacity * falloff);
}
`;

export class PointCloud {
  readonly points: THREE.Points;
  private geometry = new THREE.BufferGeometry();
  private material: THREE.ShaderMaterial;
  private capacity = 0;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uSize: { value: 2.2 },
        uScale: { value: 300 },
        uOpacity: { value: 0.5 },
        uPhaseMode: { value: 0 },
        uColourA: { value: new THREE.Color('#ffa63d') },
        uColourB: { value: new THREE.Color('#3ec8d8') },
      },
      transparent: true,
      depthWrite: false,
      // Additive blending makes density read as brightness: where the electron
      // is more likely to be, more dots pile up and the region glows brighter.
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /** Resample the cloud for a new orbital set. Positions are in Bohr radii. */
  resample(orbitals: Orbital[], count: number, seed = 1) {
    const { positions, phases, orbitalIndices } = sampleElectronPositions(orbitals, count, seed);

    const orbitalFloats = new Float32Array(count);
    for (let i = 0; i < count; i++) orbitalFloats[i] = orbitalIndices[i];

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    this.geometry.setAttribute('aOrbital', new THREE.BufferAttribute(orbitalFloats, 1));
    this.geometry.computeBoundingSphere();
    this.capacity = count;
    // Re-apply so the count compensation above tracks the new sample count.
    this.setAppearance(this.userSize, this.userOpacity);
  }

  get pointCount(): number {
    return this.capacity;
  }

  setVisible(visible: boolean) {
    this.points.visible = visible;
  }

  setPhaseMode(enabled: boolean) {
    this.material.uniforms.uPhaseMode.value = enabled ? 1 : 0;
  }

  /**
   * Set point size and opacity.
   *
   * The opacity is compensated for the point count. With additive blending,
   * total brightness is proportional to (points x alpha), so doubling the
   * sample count doubles the brightness and blows the cloud out to solid white.
   * That would make the count slider useless: every change to it would demand a
   * matching opacity correction. Normalising against a reference count means
   * raising the count adds detail without changing exposure, which is what
   * someone adjusting it actually wants.
   */
  setAppearance(size: number, opacity: number) {
    this.userOpacity = opacity;
    this.userSize = size;
    this.material.uniforms.uSize.value = size;
    this.material.uniforms.uOpacity.value =
      opacity * (PointCloud.REFERENCE_COUNT / Math.max(this.capacity, 1));
  }

  private userOpacity = 0.5;
  private userSize = 1.4;
  private static readonly REFERENCE_COUNT = 200000;

  /** Point sizing needs the viewport height to stay consistent across resizes. */
  setViewportHeight(height: number) {
    this.material.uniforms.uScale.value = height * 0.5;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
