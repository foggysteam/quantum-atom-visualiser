/**
 * A flat cut through the density, false-coloured.
 *
 * The volumetric view integrates along each ray, which is what makes it look
 * like a real object but also means every pixel mixes together everything
 * behind it. Nodal surfaces get washed out: a 2p orbital viewed down its own
 * axis is a featureless disc, because the two lobes and the node between them
 * all pile onto the same pixel.
 *
 * A slice does not integrate. Each pixel is the density at exactly one point in
 * space, so nodes appear as the sharp zero-crossings they actually are. It is
 * the quantitative view to the volume's photographic one.
 *
 * Drawn as ordinary opaque geometry so the existing depth-buffer compositing
 * handles occlusion against the nucleus and the volume without special cases.
 */

import * as THREE from 'three';
import { VOLUME_ATLAS_GLSL } from './glsl/volumeAtlas.glsl';
import { PALETTES_GLSL } from './glsl/palettes.glsl';

export type SliceAxis = 'x' | 'y' | 'z';

const VERT = /* glsl */ `
out vec3 vLocal;
void main() {
  // Position in the atom's own coordinate frame, in Bohr radii.
  vLocal = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;

in vec3 vLocal;
layout(location = 0) out vec4 fragColor;

uniform float uExtent;
uniform int uPalette;
uniform float uFloor;
uniform float uGamma;
uniform float uBrightness;
uniform int uPhaseMode;

${PALETTES_GLSL}
${VOLUME_ATLAS_GLSL}

void main() {
  vec3 uvw = vLocal / (2.0 * uExtent) + 0.5;

  // Outside the baked box there is no data. Discarding rather than clamping
  // stops the edge texels smearing across the rest of the plane.
  if (any(lessThan(uvw, vec3(0.0))) || any(greaterThan(uvw, vec3(1.0)))) {
    discard;
  }

  vec2 sampled = sampleVolume(uvw).rg;

  float v = (sampled.r - uFloor) / max(1.0 - uFloor, 1e-6);
  v = pow(clamp(v, 0.0, 1.0), uGamma);

  // Drop the plane entirely where there is nothing to show. Otherwise the quad
  // reads as a large opaque card floating through the scene, and its silhouette
  // competes with the atom for attention.
  if (v < 0.004) discard;

  vec3 c = uPhaseMode == 1 ? phaseColour(sampled.g, v) : palette(uPalette, v);
  fragColor = vec4(c * uBrightness, 1.0);
}
`;

export class SlicePlane {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private axis: SliceAxis = 'z';
  private offset = 0;
  private extent = 10;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uVolume: { value: null },
        uAtlasTiles: { value: 1 },
        uAtlasResolution: { value: 1 },
        uExtent: { value: 10 },
        uPalette: { value: 1 },
        uFloor: { value: 0.05 },
        uGamma: { value: 1.0 },
        uBrightness: { value: 1.0 },
        uPhaseMode: { value: 0 },
      },
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
  }

  setVolume(texture: THREE.Texture, extent: number, tiles: number, resolution: number) {
    const u = this.material.uniforms;
    u.uVolume.value = texture;
    u.uExtent.value = extent;
    u.uAtlasTiles.value = tiles;
    u.uAtlasResolution.value = resolution;
    this.extent = extent;
    this.updateTransform();
  }

  setVisible(visible: boolean) {
    this.mesh.visible = visible;
  }

  /** `offset` is a fraction of the box half-width, in [-1, 1]. */
  setPlane(axis: SliceAxis, offset: number) {
    this.axis = axis;
    this.offset = offset;
    this.updateTransform();
  }

  setAppearance(palette: number, floor: number, gamma: number, phaseMode: boolean) {
    const u = this.material.uniforms;
    u.uPalette.value = palette;
    u.uFloor.value = floor;
    u.uGamma.value = gamma;
    u.uPhaseMode.value = phaseMode ? 1 : 0;
  }

  private updateTransform() {
    // The plane is built in the XY plane, so rotate it onto the chosen axis and
    // scale it to span the whole box.
    const size = this.extent * 2;
    this.mesh.scale.set(size, size, 1);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.position.set(0, 0, 0);

    const d = this.offset * this.extent;
    if (this.axis === 'x') {
      this.mesh.rotation.y = Math.PI / 2;
      this.mesh.position.x = d;
    } else if (this.axis === 'y') {
      this.mesh.rotation.x = Math.PI / 2;
      this.mesh.position.y = d;
    } else {
      this.mesh.position.z = d;
    }
    this.mesh.updateMatrix();
    this.mesh.updateMatrixWorld(true);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
