/**
 * Volumetric raymarching with temporal accumulation.
 *
 * The image quality problem with volume rendering is banding: marching in fixed
 * steps puts a visible ring at every step boundary. The standard fix is to
 * jitter each ray's starting offset, which converts banding into per-pixel
 * noise. Noise is the better artefact because it AVERAGES AWAY: once the camera
 * stops, successive frames with different jitter are blended together and the
 * image converges to the exact integral.
 *
 * That is what separates this from a real-time effect. Hold still for a second
 * and the render resolves into something clean enough to be a photograph of
 * something that cannot be photographed.
 *
 * The accumulation is a running mean, out = mix(previous, current, 1/(n+1)),
 * ping-ponged between two half-float targets. Any camera move or parameter
 * change resets n to zero.
 */

import * as THREE from 'three';
import { PALETTES_GLSL } from './glsl/palettes.glsl';
import { FULLSCREEN_VERT } from './glsl/fullscreen.glsl';
import { VOLUME_ATLAS_GLSL } from './glsl/volumeAtlas.glsl';

const RAYMARCH_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

uniform sampler2D uPrevious;      // accumulation history
uniform sampler2D uSceneColour;   // opaque geometry (nucleus) rendered first
uniform sampler2D uSceneDepth;

uniform mat4 uInvProjection;
uniform mat4 uInvView;
uniform vec3 uCameraPos;
uniform float uNear;
uniform float uFar;

uniform float uExtent;            // volume half-width, in Bohr radii
uniform float uSteps;
uniform float uFrame;             // accumulation frame index
uniform float uBlend;             // 1 / (frame + 1)

uniform float uFloor;             // ignore stored values below this
uniform float uGamma;             // transfer-function curve
uniform float uOpacity;           // extinction scale
uniform float uBrightness;
uniform int   uPalette;
uniform int   uPhaseMode;         // 1 = colour by wavefunction sign
uniform int   uVolumeEnabled;     // 0 = geometry only, still tone mapped
uniform int   uIsoMode;           // 1 = draw a solid isosurface instead of a cloud
uniform float uIsoLevel;          // stored-density value of the contour
uniform float uIsoOpacity;        // 1 = solid, less = see the shells behind it

${PALETTES_GLSL}
${VOLUME_ATLAS_GLSL}

// Density value with the box-edge fade already applied, so the isosurface and
// the cloud agree about where the volume stops.
float densityAt(vec3 uvw) {
  vec3 d = abs(uvw - 0.5) * 2.0;
  float edge = 1.0 - smoothstep(0.72, 1.0, max(max(d.x, d.y), d.z));
  return sampleVolume(uvw).r * edge;
}

// Surface normal from the density gradient, by central differences.
//
// An isosurface is by definition a level set of the density, so its normal is
// the gradient direction. Taking it analytically like this is why raycasting
// the surface beats extracting a polygon mesh: the normal is exact per pixel,
// with none of the faceting that marching cubes leaves on a coarse grid.
vec3 densityGradient(vec3 uvw, float h) {
  return normalize(vec3(
    densityAt(uvw + vec3(h, 0.0, 0.0)) - densityAt(uvw - vec3(h, 0.0, 0.0)),
    densityAt(uvw + vec3(0.0, h, 0.0)) - densityAt(uvw - vec3(0.0, h, 0.0)),
    densityAt(uvw + vec3(0.0, 0.0, h)) - densityAt(uvw - vec3(0.0, 0.0, h))
  ) + 1e-9);
}

// Cheap per-pixel, per-frame hash for the jitter offset.
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

// Slab method. Returns (tNear, tFar); tFar < tNear means no hit.
vec2 intersectBox(vec3 ro, vec3 rd, vec3 boxMin, vec3 boxMax) {
  vec3 invD = 1.0 / rd;
  vec3 t0 = (boxMin - ro) * invD;
  vec3 t1 = (boxMax - ro) * invD;
  vec3 tsmall = min(t0, t1);
  vec3 tbig = max(t0, t1);
  return vec2(max(max(tsmall.x, tsmall.y), tsmall.z),
              min(min(tbig.x, tbig.y), tbig.z));
}

// Reconstruct world-space distance to the nearest opaque surface.
float sceneDistance(vec2 uv, vec3 rayDir) {
  float depth = texture(uSceneDepth, uv).r;
  if (depth >= 1.0) return 1e20;   // nothing drawn: unbounded
  vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 viewPos = uInvProjection * ndc;
  viewPos /= viewPos.w;
  vec3 worldPos = (uInvView * vec4(viewPos.xyz, 1.0)).xyz;
  return dot(worldPos - uCameraPos, rayDir);
}

void main() {
  // Build the primary ray from the inverse camera matrices.
  vec4 ndc = vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec4 viewPos = uInvProjection * ndc;
  viewPos /= viewPos.w;
  vec3 rayDir = normalize((uInvView * vec4(viewPos.xyz, 0.0)).xyz);
  vec3 rayOrigin = uCameraPos;

  vec3 background = texture(uSceneColour, vUv).rgb;
  vec3 colour = background;

  vec2 hit = intersectBox(rayOrigin, rayDir, vec3(-uExtent), vec3(uExtent));
  float tNear = max(hit.x, 0.0);
  float tFar = min(hit.y, sceneDistance(vUv, rayDir));

  if (uVolumeEnabled == 1 && tFar > tNear) {
    float stepSize = (tFar - tNear) / uSteps;

    // Jitter the entry point. Without this the fixed step size prints visible
    // concentric shells that are an artefact of the sampling, not the physics.
    float jitter = hash13(vec3(gl_FragCoord.xy, uFrame));
    float t = tNear + jitter * stepSize;

    vec3 accum = vec3(0.0);
    float transmittance = 1.0;
    float previousDensity = -1.0;

    for (int i = 0; i < 1024; i++) {
      if (float(i) >= uSteps || t > tFar || transmittance < 0.004) break;

      vec3 p = rayOrigin + rayDir * t;
      vec3 uvw = p / (2.0 * uExtent) + 0.5;

      // Fade out approaching the walls of the volume. The box is already sized
      // so the density has decayed below the display threshold by the time it
      // reaches the edge, but the transfer function is user-controlled and a
      // low enough floor will always find something still there. Without this,
      // the cube's flat faces get drawn as hard straight edges slicing through
      // the atom, which is a rendering artefact masquerading as structure.
      vec3 d = abs(uvw - 0.5) * 2.0;
      float edge = 1.0 - smoothstep(0.72, 1.0, max(max(d.x, d.y), d.z));

      vec2 sampled = sampleVolume(uvw).rg;
      sampled.r *= edge;

      if (uIsoMode == 1) {
        // Walk until the density crosses the contour, then bisect to land on
        // it. Without the refinement the surface inherits the step size as
        // visible terracing; six bisections pin it down to a 64th of a step.
        if (previousDensity >= 0.0 && previousDensity < uIsoLevel && sampled.r >= uIsoLevel) {
          float tA = t - stepSize;
          float tB = t;
          for (int b = 0; b < 6; b++) {
            float tM = 0.5 * (tA + tB);
            vec3 uvwM = (rayOrigin + rayDir * tM) / (2.0 * uExtent) + 0.5;
            if (densityAt(uvwM) < uIsoLevel) tA = tM; else tB = tM;
          }

          vec3 hitP = rayOrigin + rayDir * tB;
          vec3 hitUvw = hitP / (2.0 * uExtent) + 0.5;
          vec3 n = densityGradient(hitUvw, 1.0 / uAtlasResolution);

          // Two-sided lighting: the gradient points inward toward higher
          // density, so a surface seen from inside would otherwise go black.
          vec3 viewDir = -rayDir;
          float lambert = abs(dot(n, normalize(vec3(0.5, 0.7, 0.9))));
          float rim = pow(1.0 - abs(dot(n, viewDir)), 2.5);

          float phaseSign = sampleVolume(hitUvw).g;
          vec3 base = uPhaseMode == 1
            ? phaseColour(phaseSign, 1.0)
            : palette(uPalette, 0.72);

          vec3 shaded = base * (0.30 + 0.70 * lambert) + vec3(0.28, 0.45, 0.62) * rim;

          accum += transmittance * uIsoOpacity * shaded * uBrightness;
          transmittance *= 1.0 - uIsoOpacity;
        }
        previousDensity = sampled.r;
      } else {
        // sampled.r is the log-encoded density (see DensityVolume).
        float v = (sampled.r - uFloor) / max(1.0 - uFloor, 1e-6);
        if (v > 0.0) {
          v = pow(clamp(v, 0.0, 1.0), uGamma);

          vec3 c = uPhaseMode == 1
            ? phaseColour(sampled.g, v)
            : palette(uPalette, v);

          // Emission-absorption integration over this step.
          float sigma = v * uOpacity;
          float alpha = 1.0 - exp(-sigma * stepSize);
          accum += transmittance * alpha * c * uBrightness;
          transmittance *= 1.0 - alpha;
        }
      }

      t += stepSize;
    }

    colour = accum + background * transmittance;
  }

  // Running mean against the accumulation history.
  vec3 previous = texture(uPrevious, vUv).rgb;
  vec3 blended = mix(previous, colour, uBlend);
  fragColor = vec4(blended, 1.0);
}
`;

const DISPLAY_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
uniform sampler2D uSource;
uniform float uExposure;

void main() {
  vec3 c = texture(uSource, vUv).rgb * uExposure;
  // Filmic-ish tone curve, then sRGB encode.
  c = c / (c + vec3(1.0));
  c = pow(c, vec3(1.0 / 2.2));
  fragColor = vec4(c, 1.0);
}
`;

export interface TransferSettings {
  floor: number;
  gamma: number;
  opacity: number;
  brightness: number;
  exposure: number;
  palette: number;
  phaseMode: boolean;
  steps: number;
  /** Draw a solid contour surface instead of the cloud. */
  isoMode: boolean;
  /** Fraction of electron probability the contour encloses. */
  isoFraction: number;
  /** 1 is fully solid; lower lets nested shells show through. */
  isoOpacity: number;
}

/**
 * Tuned by eye against the LOG-encoded volume (see DensityVolume).
 *
 * The two that matter most, and they fight each other:
 *
 *  - LOW opacity (1.6). The instinct is to crank this up so the atom looks
 *    solid, but an optically thick medium saturates within a few steps and the
 *    result is a flat cut-out silhouette. Keeping the medium thin lets the ray
 *    integrate all the way through, so the dense core actually shows through
 *    the outer cloud and the shape reads as a volume rather than a disc.
 *
 *  - STEEP gamma (3.2) with high exposure. The stored value is logarithmic, and
 *    feeding a log quantity straight into brightness produces the same flat
 *    look. The steep curve re-expands it into something with real tonal range.
 */
export const DEFAULT_TRANSFER: TransferSettings = {
  floor: 0.22,
  gamma: 3.2,
  opacity: 1.6,
  brightness: 1.0,
  exposure: 3.2,
  palette: 0,
  phaseMode: false,
  steps: 256,
  isoMode: false,
  isoFraction: 0.9,
  isoOpacity: 1.0,
};

export class RaymarchPass {
  private renderer: THREE.WebGLRenderer;
  private material: THREE.RawShaderMaterial;
  private displayMaterial: THREE.RawShaderMaterial;
  private scene = new THREE.Scene();
  private displayScene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  private accum: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private current = 0;
  private frame = 0;

  /** Opaque geometry (nucleus) is rendered here first so the volume can occlude against it. */
  public sceneTarget: THREE.WebGLRenderTarget;

  constructor(renderer: THREE.WebGLRenderer, width: number, height: number) {
    this.renderer = renderer;

    const makeTarget = (w: number, h: number, withDepth: boolean) => {
      const t = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: withDepth,
      });
      if (withDepth) {
        t.depthTexture = new THREE.DepthTexture(w, h);
        t.depthTexture.type = THREE.UnsignedIntType;
      }
      return t;
    };

    this.accum = [makeTarget(width, height, false), makeTarget(width, height, false)];
    this.sceneTarget = makeTarget(width, height, true);

    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: RAYMARCH_FRAG,
      uniforms: {
        uVolume: { value: null },
        uAtlasTiles: { value: 1 },
        uAtlasResolution: { value: 1 },
        uPrevious: { value: null },
        uSceneColour: { value: this.sceneTarget.texture },
        uSceneDepth: { value: this.sceneTarget.depthTexture },
        uInvProjection: { value: new THREE.Matrix4() },
        uInvView: { value: new THREE.Matrix4() },
        uCameraPos: { value: new THREE.Vector3() },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uExtent: { value: 10 },
        uSteps: { value: DEFAULT_TRANSFER.steps },
        uFrame: { value: 0 },
        uBlend: { value: 1 },
        uFloor: { value: DEFAULT_TRANSFER.floor },
        uGamma: { value: DEFAULT_TRANSFER.gamma },
        uOpacity: { value: DEFAULT_TRANSFER.opacity },
        uBrightness: { value: DEFAULT_TRANSFER.brightness },
        uPalette: { value: DEFAULT_TRANSFER.palette },
        uPhaseMode: { value: 0 },
        uVolumeEnabled: { value: 1 },
        uIsoMode: { value: 0 },
        uIsoLevel: { value: 0.5 },
        uIsoOpacity: { value: 1.0 },
      },
      // See DensityVolume: with autoClear off, a depth-tested fullscreen quad
      // silently loses to an uncleared depth buffer.
      depthTest: false,
      depthWrite: false,
    });

    this.displayMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: DISPLAY_FRAG,
      uniforms: {
        uSource: { value: null },
        uExposure: { value: DEFAULT_TRANSFER.exposure },
      },
      depthTest: false,
      depthWrite: false,
    });

    const quad = new THREE.PlaneGeometry(2, 2);
    this.scene.add(new THREE.Mesh(quad, this.material));
    this.displayScene.add(new THREE.Mesh(quad, this.displayMaterial));
  }

  /** Discard accumulated samples. Call on any camera or parameter change. */
  reset() {
    this.frame = 0;
  }

  get accumulatedFrames(): number {
    return this.frame;
  }

  /** Stored-texture value of the isosurface contour, from the CPU solver. */
  setIsoLevel(storedValue: number) {
    this.material.uniforms.uIsoLevel.value = storedValue;
    this.reset();
  }

  setVolume(texture: THREE.Texture, extent: number, tiles: number, resolution: number) {
    this.material.uniforms.uVolume.value = texture;
    this.material.uniforms.uExtent.value = extent;
    this.material.uniforms.uAtlasTiles.value = tiles;
    this.material.uniforms.uAtlasResolution.value = resolution;
    this.reset();
  }

  setTransfer(settings: TransferSettings) {
    const u = this.material.uniforms;
    u.uFloor.value = settings.floor;
    u.uGamma.value = settings.gamma;
    u.uOpacity.value = settings.opacity;
    u.uBrightness.value = settings.brightness;
    u.uPalette.value = settings.palette;
    u.uPhaseMode.value = settings.phaseMode ? 1 : 0;
    u.uSteps.value = settings.steps;
    u.uIsoMode.value = settings.isoMode ? 1 : 0;
    u.uIsoOpacity.value = settings.isoOpacity;
    this.displayMaterial.uniforms.uExposure.value = settings.exposure;
    this.reset();
  }

  setSize(width: number, height: number) {
    this.accum[0].setSize(width, height);
    this.accum[1].setSize(width, height);
    this.sceneTarget.setSize(width, height);
    this.material.uniforms.uSceneColour.value = this.sceneTarget.texture;
    this.material.uniforms.uSceneDepth.value = this.sceneTarget.depthTexture;
    this.reset();
  }

  /**
   * Accumulate one sample and present the result.
   * `renderGeometry` draws the opaque scene into the geometry target; it is
   * only invoked on the first frame of an accumulation run, since the geometry
   * cannot change while the camera is still.
   */
  render(camera: THREE.PerspectiveCamera, renderGeometry: () => void, volumeEnabled = true) {
    const u = this.material.uniforms;
    u.uVolumeEnabled.value = volumeEnabled ? 1 : 0;

    if (this.frame === 0) {
      const previousTarget = this.renderer.getRenderTarget();
      this.renderer.setRenderTarget(this.sceneTarget);
      this.renderer.clear(true, true, true);
      renderGeometry();
      this.renderer.setRenderTarget(previousTarget);
    }

    camera.updateMatrixWorld();
    u.uInvProjection.value.copy(camera.projectionMatrixInverse);
    u.uInvView.value.copy(camera.matrixWorld);
    u.uCameraPos.value.copy(camera.position);
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uFrame.value = this.frame;
    u.uBlend.value = 1 / (this.frame + 1);

    const src = this.accum[this.current];
    const dst = this.accum[1 - this.current];
    u.uPrevious.value = src.texture;

    this.renderer.setRenderTarget(dst);
    this.renderer.render(this.scene, this.camera);

    this.displayMaterial.uniforms.uSource.value = dst.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.displayScene, this.camera);

    this.current = 1 - this.current;
    this.frame++;
  }

  dispose() {
    this.accum[0].dispose();
    this.accum[1].dispose();
    this.sceneTarget.dispose();
    this.material.dispose();
    this.displayMaterial.dispose();
  }
}
