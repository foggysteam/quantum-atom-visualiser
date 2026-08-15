/**
 * The delocalised conduction electrons, rendered as moving points.
 *
 * These are the electrons the lattice gave up. They belong to no particular
 * atom and move through the whole crystal. Two things to notice while watching:
 *
 *  - The motion is fast and completely disordered even with no field applied.
 *    That is not thermal jitter; it is the Pauli exclusion principle. Electrons
 *    stack into momentum states up to the Fermi energy, so the fastest are
 *    moving at ~1.57e6 m/s even at absolute zero.
 *
 *  - Turning on a realistic field changes this picture by about one part in ten
 *    billion. You will not see it. That is the honest answer, and it is why the
 *    field control offers an explicit amplification factor.
 *
 * One electron can be tracked with a trail, which is the clearest way to see
 * what a scattering event actually does: a long straight flight, then an abrupt
 * change of direction.
 *
 * World units are nanometres; the simulation works in metres.
 */

import * as THREE from 'three';
import type { DrudeGas } from '../physics/drude';

const M_TO_NM = 1e9;

const VERT = /* glsl */ `
uniform float uSize;
uniform float uScale;
attribute float aRecent;
varying float vRecent;

void main() {
  vRecent = aRecent;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = clamp(uSize * uScale / -mvPosition.z, 1.5, 14.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColour;
uniform vec3 uFlashColour;
uniform float uOpacity;
varying float vRecent;

void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float falloff = 1.0 - smoothstep(0.0, 0.25, r2);

  // Freshly scattered electrons flash, so collisions are visible as events
  // rather than having to be inferred from a change of direction.
  vec3 c = mix(uColour, uFlashColour, vRecent);
  gl_FragColor = vec4(c, uOpacity * falloff);
}
`;

export class ElectronGas {
  readonly points: THREE.Points;
  readonly trail: THREE.Line;

  private geometry = new THREE.BufferGeometry();
  private material: THREE.ShaderMaterial;
  private positions: Float32Array;
  private recent: Float32Array;
  private count: number;

  private trailGeometry = new THREE.BufferGeometry();
  private trailPositions: Float32Array;
  private trailLength = 0;
  private static readonly TRAIL_CAPACITY = 400;
  private trackedIndex = 0;

  constructor(count: number) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.recent = new Float32Array(count);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aRecent', new THREE.BufferAttribute(this.recent, 1));
    this.geometry.setDrawRange(0, count);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uSize: { value: 3.0 },
        uScale: { value: 400 },
        uOpacity: { value: 0.95 },
        uColour: { value: new THREE.Color('#5ec8f2') },
        uFlashColour: { value: new THREE.Color('#ffffff') },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;

    this.trailPositions = new Float32Array(ElectronGas.TRAIL_CAPACITY * 3);
    this.trailGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.trailPositions, 3),
    );
    this.trailGeometry.setDrawRange(0, 0);
    this.trail = new THREE.Line(
      this.trailGeometry,
      new THREE.LineBasicMaterial({ color: new THREE.Color('#ffd76b'), transparent: true, opacity: 0.9 }),
    );
    this.trail.frustumCulled = false;
    this.trail.visible = false;
  }

  /** Copy simulation state into the render buffers. */
  sync(gas: DrudeGas, boxHalfWidthM: number) {
    const tau = gas.relaxationTimeS;
    for (let i = 0; i < this.count; i++) {
      this.positions[i * 3] = gas.positions[i * 3] * M_TO_NM;
      this.positions[i * 3 + 1] = gas.positions[i * 3 + 1] * M_TO_NM;
      this.positions[i * 3 + 2] = gas.positions[i * 3 + 2] * M_TO_NM;
      // Fade the flash out over a twentieth of a relaxation time, so a collision
      // reads as a brief event rather than a lasting state.
      this.recent[i] = tau > 0 ? Math.max(0, 1 - gas.sinceScatter[i] / (tau * 0.05)) : 0;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aRecent.needsUpdate = true;

    if (this.trail.visible) this.updateTrail(gas, boxHalfWidthM);
  }

  /**
   * Append the tracked electron's position to its trail.
   *
   * Wrap-around has to break the trail rather than draw across the box: the
   * electron leaving one face and re-entering the opposite one is a rendering
   * convenience standing in for an effectively infinite crystal, and a line
   * connecting the two would look like a real, instantaneous jump.
   */
  private updateTrail(gas: DrudeGas, boxHalfWidthM: number) {
    const i = this.trackedIndex;
    const x = gas.positions[i * 3] * M_TO_NM;
    const y = gas.positions[i * 3 + 1] * M_TO_NM;
    const z = gas.positions[i * 3 + 2] * M_TO_NM;

    if (this.trailLength > 0) {
      const px = this.trailPositions[(this.trailLength - 1) * 3];
      const py = this.trailPositions[(this.trailLength - 1) * 3 + 1];
      const pz = this.trailPositions[(this.trailLength - 1) * 3 + 2];
      const jump = Math.max(Math.abs(x - px), Math.abs(y - py), Math.abs(z - pz));
      if (jump > boxHalfWidthM * M_TO_NM) {
        this.trailLength = 0; // wrapped: start a fresh segment
      }
    }

    if (this.trailLength >= ElectronGas.TRAIL_CAPACITY) {
      this.trailPositions.copyWithin(0, 3);
      this.trailLength = ElectronGas.TRAIL_CAPACITY - 1;
    }

    this.trailPositions[this.trailLength * 3] = x;
    this.trailPositions[this.trailLength * 3 + 1] = y;
    this.trailPositions[this.trailLength * 3 + 2] = z;
    this.trailLength++;

    this.trailGeometry.setDrawRange(0, this.trailLength);
    this.trailGeometry.attributes.position.needsUpdate = true;
    this.trailGeometry.computeBoundingSphere();
  }

  setTrackedElectron(enabled: boolean, index = 0) {
    this.trail.visible = enabled;
    if (this.trackedIndex !== index) this.trailLength = 0;
    this.trackedIndex = Math.min(index, this.count - 1);
    if (!enabled) {
      this.trailLength = 0;
      this.trailGeometry.setDrawRange(0, 0);
    }
  }

  setVisible(visible: boolean) {
    this.points.visible = visible;
  }

  setAppearance(size: number, opacity: number) {
    this.material.uniforms.uSize.value = size;
    this.material.uniforms.uOpacity.value = opacity;
  }

  setViewportHeight(height: number) {
    this.material.uniforms.uScale.value = height * 0.5;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.trailGeometry.dispose();
    (this.trail.material as THREE.Material).dispose();
  }
}
