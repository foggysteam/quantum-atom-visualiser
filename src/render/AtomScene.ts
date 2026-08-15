/**
 * Owns the WebGL context and drives every render mode.
 *
 * Frame order matters:
 *   1. Opaque geometry (nucleons, Bohr rings, point cloud) into a colour+depth
 *      target. This only needs redoing when the camera or geometry changes.
 *   2. The volume raymarch, which reads that depth so the cloud correctly
 *      occludes against the nucleus rather than drawing straight through it.
 *   3. Accumulate and tone-map to the screen.
 *
 * World units are Bohr radii everywhere.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { DensityVolume } from './DensityVolume';
import { RaymarchPass, DEFAULT_TRANSFER, type TransferSettings } from './RaymarchPass';
import { NucleusView } from './NucleusView';
import { PointCloud } from './PointCloud';
import { BohrOverlay } from './BohrOverlay';
import { SlicePlane, type SliceAxis } from './SlicePlane';
import { ScaleController } from '../scale/ScaleController';
import { QUALITY_PROFILES, type QualityProfile } from '../ui/device';
import { buildDensityGrid, solveIsovalue } from '../physics/densityGrid';

import {
  buildOrbitals,
  suggestedExtent,
  extentForDynamicRange,
  displayReferenceDensity,
  type Orbital,
  type OccupancyMode,
} from '../physics/wavefunction';
import { LOG_DECADES } from './DensityVolume';
import { elementByZ, neutronCount } from '../physics/elements';

export interface ViewSettings {
  showVolume: boolean;
  showPoints: boolean;
  showNucleons: boolean;
  showNuclearDensity: boolean;
  showBohr: boolean;
  showSlice: boolean;
  sliceAxis: SliceAxis;
  /** Slice position as a fraction of the box half-width, in [-1, 1]. */
  sliceOffset: number;
  pointCount: number;
  pointSize: number;
  pointOpacity: number;
  occupancyMode: OccupancyMode;
  /** Apply the first-order relativistic contraction to orbital radii. */
  relativistic: boolean;
  /** Subshell labels currently visible, e.g. "3d". Empty means all. */
  hiddenSubshells: Set<string>;
}

export const DEFAULT_VIEW: ViewSettings = {
  showVolume: true,
  showPoints: false,
  showNucleons: true,
  showNuclearDensity: false,
  showBohr: false,
  showSlice: false,
  sliceAxis: 'z',
  sliceOffset: 0,
  pointCount: 250000,
  pointSize: 1.5,
  pointOpacity: 0.12,
  occupancyMode: 'hund',
  relativistic: false,
  hiddenSubshells: new Set(),
};

export interface AtomState {
  z: number;
  /** Half-width of the rendered volume box, in Bohr. */
  extent: number;
  /** Radius enclosing 99% of the probability, in Bohr. */
  radius99: number;
  orbitals: Orbital[];
  visibleOrbitals: Orbital[];
  nucleusRadiusFm: number;
  accumulatedFrames: number;
  /** Voxels per axis in the baked density volume. */
  volumeResolution: number;
  /** Density of the current isosurface contour, electrons per cubic Bohr. */
  isoDensity: number;
}

export class AtomScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly scaleController = new ScaleController();

  private geometryScene = new THREE.Scene();
  private volume: DensityVolume;
  private raymarch: RaymarchPass;
  private nucleus: NucleusView;
  private pointCloud = new PointCloud();
  private bohr = new BohrOverlay();
  private slice = new SlicePlane();

  private transfer: TransferSettings = { ...DEFAULT_TRANSFER };
  private view: ViewSettings = { ...DEFAULT_VIEW, hiddenSubshells: new Set() };

  private z = 1;
  private orbitals: Orbital[] = [];
  private visibleOrbitals: Orbital[] = [];
  private extent = 10;
  /** Radius enclosing 99% of the electron probability, in Bohr. Reported, not rendered. */
  private radius99 = 10;
  /**
   * User exposure offset, in decades of density.
   *
   * 0 exposes for the valence shell. POSITIVE raises the white point toward the
   * core: more density is then needed to reach white, so the outer cloud dims
   * away and the inner shells emerge. Negative brightens the faint tail, and
   * pushed far enough will light the whole render box up to its walls.
   */
  private whitePointDecades = 0;

  private lastCameraMatrix = new THREE.Matrix4();
  private running = false;
  private disposed = false;
  private onStateChange?: (state: AtomState) => void;

  constructor(canvas: HTMLCanvasElement, profile: QualityProfile = QUALITY_PROFILES.high) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // the accumulation buffer supersedes MSAA here
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.maxPixelRatio));
    this.renderer.autoClear = false;

    const width = canvas.clientWidth || 1280;
    const height = canvas.clientHeight || 720;
    this.renderer.setSize(width, height, false);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 22);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.zoomSpeed = 0.9;
    // Allow zooming from the whole cloud right down to nucleon scale.
    this.controls.minDistance = 1e-6;
    this.controls.maxDistance = 1e4;

    this.volume = new DensityVolume(this.renderer, profile.volumeResolution);
    this.transfer.steps = profile.steps;
    this.view.pointCount = profile.pointCount;
    this.raymarch = new RaymarchPass(this.renderer, width, height);
    this.nucleus = new NucleusView(this.scaleController);

    // Lighting for the nucleon spheres. The volume is emissive and unlit.
    this.geometryScene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 4, 5);
    this.geometryScene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.7);
    rim.position.set(-4, -2, -3);
    this.geometryScene.add(rim);

    this.geometryScene.add(this.nucleus.group);
    this.geometryScene.add(this.pointCloud.points);
    this.geometryScene.add(this.bohr.group);
    this.geometryScene.add(this.slice.mesh);

    this.pointCloud.setViewportHeight(height);
  }

  setStateListener(fn: (state: AtomState) => void) {
    this.onStateChange = fn;
  }

  /** Load an element: rebuild orbitals, nucleus, volume and point cloud. */
  setElement(z: number) {
    this.z = z;
    const element = elementByZ(z);

    this.orbitals = buildOrbitals(z, this.view.occupancyMode, this.view.relativistic);
    // Reported as a property of the whole ATOM, so it stays based on every
    // orbital even when only some are being drawn.
    this.radius99 = suggestedExtent(this.orbitals, 0.99);
    // The render box and the exposure reference are both set from the VISIBLE
    // subset in applyOrbitalVisibility, which runs immediately after this.
    this.extent = this.radius99 * 1.1;

    this.nucleus.setNuclide(z, neutronCount(element));
    this.bohr.setShells(this.orbitals.map((o) => ({ n: o.n, zEff: o.zEff })));

    this.applyOrbitalVisibility();
    this.frameCamera();
    this.emitState();
  }

  /** Recompute which orbitals are shown, then rebake the volume and cloud. */
  private applyOrbitalVisibility() {
    this.visibleOrbitals = this.orbitals.filter(
      (o) => !this.view.hiddenSubshells.has(o.subshell),
    );

    if (this.visibleOrbitals.length > 0) {
      // Recompute the reference from the VISIBLE set: hiding the valence shell
      // should re-expose for whatever is now outermost, not keep exposing for
      // an orbital that is no longer on screen.
      const ref =
        displayReferenceDensity(this.visibleOrbitals) *
        Math.pow(10, this.whitePointDecades);

      // Size the box to what is actually being drawn, not to the whole atom.
      // Isolating an inner subshell otherwise leaves it a speck in the middle of
      // a box scaled for the valence shell: praseodymium's 4f orbitals sit at a
      // few percent of the 6s radius, so they vanish entirely.
      const previousExtent = this.extent;
      this.extent = Math.max(
        extentForDynamicRange(this.visibleOrbitals, LOG_DECADES, ref),
        suggestedExtent(this.visibleOrbitals, 0.99) * 1.1,
      );

      const result = this.volume.bake(this.visibleOrbitals, this.extent, ref);

      // Reframe only on a large change, so ordinary toggles do not yank a
      // camera the user has deliberately placed.
      const change = this.extent / previousExtent;
      if (change > 2 || change < 0.5) this.frameCamera();
      this.raymarch.setVolume(
        result.texture,
        result.extent,
        result.tiles,
        result.resolution,
      );
      this.slice.setVolume(result.texture, result.extent, result.tiles, result.resolution);

      if (this.view.showPoints) {
        this.pointCloud.resample(this.visibleOrbitals, this.view.pointCount);
      }
      if (this.transfer.isoMode) {
        this.recomputeIsoLevel();
      }
    }

    this.raymarch.reset();
    this.emitState();
  }

  setView(partial: Partial<ViewSettings>) {
    const needsResample =
      (partial.pointCount !== undefined && partial.pointCount !== this.view.pointCount) ||
      (partial.showPoints === true && this.pointCloud.pointCount === 0);
    const needsRebuild =
      (partial.occupancyMode !== undefined &&
        partial.occupancyMode !== this.view.occupancyMode) ||
      (partial.relativistic !== undefined && partial.relativistic !== this.view.relativistic);
    const visibilityChanged = partial.hiddenSubshells !== undefined;

    this.view = { ...this.view, ...partial };

    this.pointCloud.setVisible(this.view.showPoints);
    this.pointCloud.setAppearance(this.view.pointSize, this.view.pointOpacity);
    this.pointCloud.setPhaseMode(this.transfer.phaseMode);
    this.nucleus.showNucleons = this.view.showNucleons;
    this.nucleus.showDensityShell = this.view.showNuclearDensity;
    this.nucleus.updateScale();
    this.bohr.setVisible(this.view.showBohr);
    this.slice.setVisible(this.view.showSlice);
    this.slice.setPlane(this.view.sliceAxis, this.view.sliceOffset);

    if (needsRebuild) {
      this.setElement(this.z);
      return;
    }
    if (visibilityChanged) {
      this.applyOrbitalVisibility();
      return;
    }
    if (needsResample && this.view.showPoints && this.visibleOrbitals.length) {
      this.pointCloud.resample(this.visibleOrbitals, this.view.pointCount);
    }

    this.raymarch.reset();
    this.emitState();
  }

  setTransfer(partial: Partial<TransferSettings>) {
    const needsIsoSolve =
      (partial.isoFraction !== undefined && partial.isoFraction !== this.transfer.isoFraction) ||
      (partial.isoMode === true && !this.transfer.isoMode);

    this.transfer = { ...this.transfer, ...partial };
    this.raymarch.setTransfer(this.transfer);
    this.pointCloud.setPhaseMode(this.transfer.phaseMode);
    this.slice.setAppearance(
      this.transfer.palette,
      this.transfer.floor,
      this.transfer.gamma,
      this.transfer.phaseMode,
    );

    if (needsIsoSolve) this.recomputeIsoLevel();
    this.emitState();
  }

  /**
   * Solve for the density contour enclosing the requested probability, then
   * convert it into the volume texture's stored (log-encoded) units so the
   * shader can compare against it directly.
   *
   * Only run when the isosurface is actually being drawn: it rebuilds the
   * density on the CPU and bisects over it, which is far too much work to do on
   * every element change if nothing is going to use the result.
   */
  private recomputeIsoLevel() {
    if (this.visibleOrbitals.length === 0) return;

    const grid = buildDensityGrid(this.visibleOrbitals, this.extent, 96);
    const isoDensity = solveIsovalue(grid, this.transfer.isoFraction);
    this.isoDensity = isoDensity;

    // Same encoding the bake shader applies.
    const stored =
      isoDensity > 0
        ? Math.min(
            1,
            Math.max(0, 1 + Math.log10(isoDensity / this.volume.densityRef) / LOG_DECADES),
          )
        : 0;
    this.raymarch.setIsoLevel(stored);
  }

  /** Density of the current contour, in electrons per cubic Bohr. */
  private isoDensity = 0;

  /**
   * Shift the exposure white point, in decades of density.
   * 0 exposes for the valence shell; -2 or so exposes for the inner shells.
   */
  setWhitePoint(decades: number) {
    this.whitePointDecades = decades;
    this.applyOrbitalVisibility();
  }

  setNucleusExaggeration(factor: number) {
    this.scaleController.nucleusExaggeration = factor;
    this.nucleus.updateScale();
    this.raymarch.reset();
    this.emitState();
  }

  /**
   * Set near/far from the current viewing distance.
   *
   * The depth buffer only has to be good enough to occlude the volume against
   * the nucleon spheres, but the camera has to work across five orders of
   * magnitude of zoom. A fixed near plane cannot do both: too near and depth
   * precision collapses when looking at the whole cloud, too far and the
   * nucleons are clipped away when you fly down to them. So the planes track
   * the distance, with far held out past the cloud so it never clips.
   */
  private updateClipPlanes(distance: number) {
    this.camera.near = Math.max(distance * 0.005, 1e-9);
    this.camera.far = Math.max(distance * 200, this.extent * 6);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Distance at which a sphere of the given radius fits comfortably in frame.
   *
   * Uses whichever field of view is NARROWER. A tall, narrow window has a much
   * smaller horizontal FOV than vertical, so framing on the vertical alone lets
   * the atom overflow the sides.
   */
  private distanceToFit(radius: number, margin = 1.35): number {
    const halfV = (this.camera.fov * Math.PI) / 360;
    const halfH = Math.atan(Math.tan(halfV) * this.camera.aspect);
    return (radius * margin) / Math.sin(Math.min(halfV, halfH));
  }

  /** Position the camera to frame the whole electron cloud. */
  frameCamera() {
    const distance = this.distanceToFit(this.extent);
    // Slightly off-axis. Looking straight down a coordinate axis is the one
    // viewpoint that hides orbital shape: a p orbital viewed along its own axis
    // is a featureless disc, because the ray integration averages the lobes.
    const dir = new THREE.Vector3(0.42, 0.30, 0.86).normalize();
    this.camera.position.copy(dir.multiplyScalar(distance));
    this.updateClipPlanes(distance);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.raymarch.reset();
  }

  /** Move the camera along the logarithmic atom-to-nucleus zoom. */
  setZoom(t: number) {
    const nucleusRadiusFm = this.nucleus.nuclide?.radiusFm ?? 1;
    const distance = ScaleController.zoomToDistance(t, this.extent, nucleusRadiusFm);
    const direction = this.camera.position.clone().normalize();
    if (direction.lengthSq() === 0) direction.set(0, 0, 1);
    this.camera.position.copy(direction.multiplyScalar(distance));
    this.updateClipPlanes(distance);
    this.controls.update();
    this.raymarch.reset();
  }

  get currentZoom(): number {
    const nucleusRadiusFm = this.nucleus.nuclide?.radiusFm ?? 1;
    return ScaleController.distanceToZoom(
      this.camera.position.length(),
      this.extent,
      nucleusRadiusFm,
    );
  }

  setSize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    const previousAspect = this.camera.aspect;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    // Narrowing the window shrinks the horizontal field of view, so a framing
    // that fitted before may not now. Pull back to keep the atom in frame.
    if (this.camera.aspect < previousAspect) {
      const fit = this.distanceToFit(this.extent);
      if (this.camera.position.length() < fit) {
        this.camera.position.setLength(fit);
        this.updateClipPlanes(fit);
      }
    }
    const ratio = this.renderer.getPixelRatio();
    this.raymarch.setSize(Math.floor(width * ratio), Math.floor(height * ratio));
    this.pointCloud.setViewportHeight(height * ratio);
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (this.disposed) return;
      requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  private frame() {
    this.controls.update();

    // Any camera movement invalidates the accumulated samples.
    if (!this.camera.matrixWorld.equals(this.lastCameraMatrix)) {
      this.lastCameraMatrix.copy(this.camera.matrixWorld);
      this.raymarch.reset();
    }

    const drawGeometry = () => {
      this.renderer.render(this.geometryScene, this.camera);
    };

    // Everything goes through the same pass, even with the volume switched off.
    // Drawing the geometry straight to the canvas instead would skip the tone
    // mapping and the temporal accumulation, and the additively blended point
    // cloud would clip to solid white rather than resolving into a smooth,
    // convergent image.
    const volumeEnabled = this.view.showVolume && this.visibleOrbitals.length > 0;
    this.raymarch.render(this.camera, drawGeometry, volumeEnabled);

    this.emitState();
  }

  private lastEmittedFrames = -1;
  private emitState() {
    const frames = this.raymarch.accumulatedFrames;
    if (frames === this.lastEmittedFrames) return;
    // Throttle hard. Without this every animation frame triggers a React
    // re-render of both control panels, which costs more than the raymarch.
    // The convergence counter only needs to look alive, not be frame-exact.
    if (frames > 3 && frames % 20 !== 0 && frames < 240) return;
    this.lastEmittedFrames = frames;
    this.onStateChange?.({
      z: this.z,
      extent: this.extent,
      radius99: this.radius99,
      orbitals: this.orbitals,
      visibleOrbitals: this.visibleOrbitals,
      nucleusRadiusFm: this.nucleus.nuclide?.radiusFm ?? 0,
      accumulatedFrames: frames,
      volumeResolution: this.volume.resolution,
      isoDensity: this.isoDensity,
    });
  }

  dispose() {
    this.disposed = true;
    this.controls.dispose();
    this.volume.dispose();
    this.raymarch.dispose();
    this.nucleus.dispose();
    this.pointCloud.dispose();
    this.bohr.dispose();
    this.slice.dispose();
    this.renderer.dispose();
  }
}
