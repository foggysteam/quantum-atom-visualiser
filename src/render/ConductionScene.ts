/**
 * The conduction view: a block of crystal, its ion cores, and its electron sea.
 *
 * World units are nanometres. The simulation runs in SI metres and seconds and
 * is converted at the boundary, so the physics module never has to know about
 * rendering scale.
 *
 * TIME. Electrons cross this box in a couple of femtoseconds, so time is slowed
 * by a factor of roughly 1e15 to make anything watchable. The slowdown is shown
 * on screen. Note what falls out of that honestly: copper's mean free path is
 * about 39 nm while this box is a few nm across, so an electron typically
 * crosses the whole visible sample ten or more times before it scatters. That
 * is not a shortcoming of the simulation, it is what the numbers say.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { LatticeView } from './LatticeView';
import { ElectronGas } from './ElectronGas';
import { DrudeGas } from '../physics/drude';
import {
  carrierDensity,
  fermiVelocity,
  relaxationTime,
  meanFreePath,
  driftVelocity,
  currentDensity,
  resistivityAt,
  fieldForCurrentDensity,
  timeToDriftOneMetre,
  materialBySymbol,
  characteristicSpeed,
  volumePerCarrier,
  checkValidity,
  type ConductionMaterial,
  type ModelValidity,
} from '../physics/conduction';
import { BOLTZMANN_J_PER_K, SPEED_OF_LIGHT_M_S } from '../physics/constants';
import { QUALITY_PROFILES, type QualityProfile } from '../ui/device';

export interface ConductionSettings {
  materialSymbol: string;
  temperatureK: number;
  /**
   * Current density in A/m^2 that the field is derived from. Used for METALS,
   * where current density is the quantity people actually have intuitions about
   * (household wiring runs at a few A/mm^2).
   */
  currentDensityAm2: number;
  /**
   * Field in V/m, used directly for non-metals. Deriving the field from a
   * current density there is a trap: asking for household current through
   * intrinsic silicon demands ~2e9 V/m, seventy times its breakdown strength,
   * and predicts faster-than-light drift.
   */
  fieldVoltsPerMetre: number;
  /** Decades of field amplification applied for visualisation only. */
  fieldAmplificationDecades: number;
  /** Seconds of simulated time per second of real time (a tiny number). */
  timeScale: number;
  cellsX: number;
  showLattice: boolean;
  showElectrons: boolean;
  trackOneElectron: boolean;
  showField: boolean;
}

export const DEFAULT_CONDUCTION: ConductionSettings = {
  materialSymbol: 'Cu',
  temperatureK: 293.15,
  currentDensityAm2: 1e6,
  fieldVoltsPerMetre: 1e4,
  fieldAmplificationDecades: 0,
  timeScale: 1e-15,
  cellsX: 12,
  showLattice: true,
  showElectrons: true,
  trackOneElectron: false,
  showField: true,
};

export interface ConductionState {
  material: ConductionMaterial;
  atomCount: number;
  electronCount: number;
  carrierDensity: number;
  fermiVelocity: number;
  driftVelocity: number;
  amplifiedDriftVelocity: number;
  relaxationTimeS: number;
  meanFreePathM: number;
  resistivity: number;
  realField: number;
  amplifiedField: number;
  currentDensity: number;
  secondsToDriftOneMetre: number;
  /** Box dimensions in nanometres. */
  boxNm: { x: number; y: number; z: number };
  measuredDrift: number;
  driftNoiseFloor: number;
  simulatedElapsedS: number;
  scatterEvents: number;
  slowdownFactor: number;
  /** How long light would take to cross the box, for the field-speed comparison. */
  lightCrossingTimeS: number;
  /** Speed carriers actually move at: Fermi in a metal, thermal otherwise. */
  carrierSpeed: number;
  /** Volume needed to contain one free carrier, cubic metres. */
  volumePerCarrierM3: number;
  /** Exact (fractional) carrier count for the box, before rounding to whole electrons. */
  exactCarriersInBox: number;
  validity: ModelValidity;
  /** Mean speed of the simulated carriers right now, m/s. */
  simulatedMeanSpeed: number;
  /**
   * Wall-clock seconds for the drift to decay by 1/e after the field changes.
   * Equal to the relaxation time divided by the slow-motion factor.
   */
  driftDecayRealSeconds: number;
}

export class ConductionScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  private scene = new THREE.Scene();
  private lattice = new LatticeView();
  private gasView: ElectronGas | null = null;
  private gas: DrudeGas | null = null;
  private fieldArrows: THREE.Group = new THREE.Group();

  private settings: ConductionSettings = { ...DEFAULT_CONDUCTION };
  private material: ConductionMaterial = materialBySymbol('Cu');
  private boxHalfWidths = { x: 1e-9, y: 1e-9, z: 1e-9 };
  private boxNm = { x: 1, y: 1, z: 1 };
  private latticeTime = 0;
  private exactCarriersInBox = 0;

  private running = false;
  private disposed = false;
  private lastFrameTime = 0;
  private onStateChange?: (s: ConductionState) => void;

  constructor(canvas: HTMLCanvasElement, profile: QualityProfile = QUALITY_PROFILES.high) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      // Antialiasing is comparatively cheap here (opaque spheres, no volume) but
      // still worth dropping alongside the pixel ratio on weak hardware.
      antialias: profile.maxPixelRatio > 1.5,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.maxPixelRatio));
    const width = canvas.clientWidth || 1280;
    const height = canvas.clientHeight || 720;
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(0x06080d, 1);

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 500);
    this.camera.position.set(3.2, 2.0, 4.4);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(4, 6, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fb0ff, 0.6);
    rim.position.set(-5, -2, -4);
    this.scene.add(rim);

    this.scene.add(this.lattice.group);
    this.scene.add(this.fieldArrows);
  }

  setStateListener(fn: (s: ConductionState) => void) {
    this.onStateChange = fn;
  }

  /** Rebuild the crystal, the electron gas and the camera framing. */
  rebuild() {
    this.material = materialBySymbol(this.settings.materialSymbol);

    const a = this.material.latticeConstantA / 10; // nm
    // A wire-shaped slab: long along x, which is the field direction.
    const cells = {
      x: this.settings.cellsX,
      y: Math.max(3, Math.round(this.settings.cellsX / 3)),
      z: Math.max(3, Math.round(this.settings.cellsX / 3)),
    };
    this.lattice.build(this.material, cells);

    this.boxNm = { x: cells.x * a, y: cells.y * a, z: cells.z * a };

    // The simulation box matches the drawn slab exactly, so the gas fills the
    // crystal it belongs to.
    this.boxHalfWidths = {
      x: (this.boxNm.x * 1e-9) / 2,
      y: (this.boxNm.y * 1e-9) / 2,
      z: (this.boxNm.z * 1e-9) / 2,
    };
    const volumeM3 = (this.boxNm.x * 1e-9) * (this.boxNm.y * 1e-9) * (this.boxNm.z * 1e-9);

    // Use the PHYSICALLY CORRECT number of carriers for this volume rather than
    // an arbitrary particle count. For copper that works out at almost exactly
    // one electron per atom, which is the claim being illustrated.
    const n = carrierDensity(this.material, this.settings.temperatureK);
    this.exactCarriersInBox = n * volumeM3;
    // At least a handful of particles even when the true count is a millionth
    // of one, so the view is not simply empty; the panel reports the real
    // number, which for diamond is the entire point.
    const electronCount = Math.max(
      this.material.conductionClass === 'metal' ? 1 : 12,
      Math.min(20000, Math.round(this.exactCarriersInBox)),
    );

    this.gas = new DrudeGas({
      material: this.material,
      temperatureK: this.settings.temperatureK,
      fieldVoltsPerMetre: this.amplifiedField(),
      boxHalfWidthsM: this.boxHalfWidths,
      electronCount,
      seed: 20250815,
    });

    this.gasView?.dispose();
    if (this.gasView) {
      this.scene.remove(this.gasView.points);
      this.scene.remove(this.gasView.trail);
    }
    this.gasView = new ElectronGas(electronCount);
    this.scene.add(this.gasView.points);
    this.scene.add(this.gasView.trail);
    this.gasView.setViewportHeight(this.renderer.domElement.clientHeight);

    this.applyTemperature();
    this.buildFieldArrows();
    this.frameCamera();
    this.applyVisibility();
  }

  /** Thermal vibration amplitude, scaled so it reads at typical temperatures. */
  private applyTemperature() {
    // Mean square displacement rises with T; the absolute scale here is chosen
    // for legibility, not quantitative accuracy, and stays small next to the
    // lattice spacing so the crystal never looks molten.
    const a = this.material.latticeConstantA / 10;
    const rms = Math.sqrt(
      (BOLTZMANN_J_PER_K * this.settings.temperatureK) / (BOLTZMANN_J_PER_K * 293.15),
    );
    this.lattice.vibrationAmplitude = a * 0.035 * rms;
  }

  /**
   * The physically applied field, before any visualisation amplification.
   *
   * Metals are driven by current density, which is the intuitive quantity for a
   * wire. Non-metals are driven by field directly, because a current density
   * that is ordinary in copper is physically impossible in silicon.
   */
  private realField(): number {
    if (this.material.conductionClass !== 'metal') {
      return this.settings.fieldVoltsPerMetre;
    }
    return fieldForCurrentDensity(
      this.material,
      this.settings.currentDensityAm2,
      this.settings.temperatureK,
    );
  }

  private amplifiedField(): number {
    return this.realField() * Math.pow(10, this.settings.fieldAmplificationDecades);
  }

  /** Arrows showing the applied field direction along +x. */
  private buildFieldArrows() {
    this.fieldArrows.clear();
    const half = this.boxNm.x / 2;
    const spread = Math.max(this.boxNm.y, this.boxNm.z) * 0.72;

    for (const [oy, oz] of [
      [spread, spread],
      [spread, -spread],
      [-spread, spread],
      [-spread, -spread],
    ]) {
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(-half * 1.15, oy, oz),
        half * 2.3,
        0x4fc3f7,
        half * 0.25,
        half * 0.12,
      );
      this.fieldArrows.add(arrow);
    }
  }

  private applyVisibility() {
    this.lattice.setVisible(this.settings.showLattice);
    this.gasView?.setVisible(this.settings.showElectrons);
    this.gasView?.setTrackedElectron(this.settings.trackOneElectron, 0);
    this.fieldArrows.visible = this.settings.showField;
  }

  update(partial: Partial<ConductionSettings>) {
    const needsRebuild =
      (partial.materialSymbol !== undefined &&
        partial.materialSymbol !== this.settings.materialSymbol) ||
      (partial.cellsX !== undefined && partial.cellsX !== this.settings.cellsX);
    const temperatureChanged =
      partial.temperatureK !== undefined && partial.temperatureK !== this.settings.temperatureK;

    this.settings = { ...this.settings, ...partial };

    if (needsRebuild) {
      this.rebuild();
      return;
    }

    if (temperatureChanged) {
      this.applyTemperature();
      this.gas?.setTemperature(this.settings.temperatureK);
    }
    this.gas?.setField(this.amplifiedField());
    this.applyVisibility();
  }

  private frameCamera() {
    const radius = Math.hypot(this.boxNm.x, this.boxNm.y, this.boxNm.z) / 2;
    const halfV = (this.camera.fov * Math.PI) / 360;
    const halfH = Math.atan(Math.tan(halfV) * this.camera.aspect);
    const distance = (radius * 1.5) / Math.sin(Math.min(halfV, halfH));

    this.camera.position.set(0.45, 0.35, 0.82).normalize().multiplyScalar(distance);
    this.camera.near = distance * 0.01;
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  setSize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.gasView?.setViewportHeight(height * this.renderer.getPixelRatio());
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    const loop = () => {
      if (this.disposed) return;
      requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  private frame() {
    const now = performance.now();
    // Clamp the wall-clock delta: a background tab can hand back a delta of
    // many seconds, which at these time scales would teleport every electron.
    const wallDt = Math.min((now - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = now;

    this.controls.update();

    if (this.gas && this.gasView) {
      const simDt = wallDt * this.settings.timeScale;

      // Substep so no electron moves further than a fraction of the box in one
      // step, and so scattering probability per step stays small enough for the
      // Poisson approximation to hold.
      const tau = this.gas.relaxationTimeS;
      const smallestHalf = Math.min(
        this.boxHalfWidths.x,
        this.boxHalfWidths.y,
        this.boxHalfWidths.z,
      );
      const maxStep = Math.min(tau * 0.2, (smallestHalf * 0.25) / this.gas.carrierSpeed);
      const substeps = Math.max(1, Math.min(64, Math.ceil(simDt / Math.max(maxStep, 1e-20))));
      const dt = simDt / substeps;
      for (let i = 0; i < substeps; i++) this.gas.step(dt);

      this.gasView.sync(this.gas, smallestHalf);
    }

    this.latticeTime += wallDt;
    this.lattice.update(this.latticeTime);

    this.renderer.render(this.scene, this.camera);
    this.emitState();
  }

  private frameCounter = 0;
  private emitState() {
    // The panel shows physical constants and slow-moving averages, so it does
    // not need refreshing at display rate.
    if (this.frameCounter++ % 12 !== 0) return;
    if (!this.gas) return;

    const t = this.settings.temperatureK;
    const realE = this.realField();
    const ampE = this.amplifiedField();

    this.onStateChange?.({
      material: this.material,
      atomCount: this.lattice.siteCount,
      electronCount: this.gas.positions.length / 3,
      carrierDensity: carrierDensity(this.material, t),
      fermiVelocity: fermiVelocity(this.material),
      driftVelocity: driftVelocity(this.material, realE, t),
      amplifiedDriftVelocity: driftVelocity(this.material, ampE, t),
      relaxationTimeS: relaxationTime(this.material, t),
      meanFreePathM: meanFreePath(this.material, t),
      resistivity: resistivityAt(this.material, t),
      realField: realE,
      amplifiedField: ampE,
      currentDensity: currentDensity(this.material, realE, t),
      secondsToDriftOneMetre: timeToDriftOneMetre(this.material, realE, t),
      boxNm: this.boxNm,
      measuredDrift: this.gas.measuredDriftVelocity(),
      driftNoiseFloor: this.gas.driftNoiseFloor(),
      simulatedElapsedS: this.gas.elapsed,
      scatterEvents: this.gas.scatterEvents,
      slowdownFactor: 1 / this.settings.timeScale,
      lightCrossingTimeS: (this.boxNm.x * 1e-9) / SPEED_OF_LIGHT_M_S,
      carrierSpeed: characteristicSpeed(this.material, t),
      volumePerCarrierM3: volumePerCarrier(this.material, t),
      exactCarriersInBox: this.exactCarriersInBox,
      // Checked against the AMPLIFIED field, because that is the field the
      // simulation is actually integrating. Checking the real field instead
      // reports "all fine" while the visible electrons are being driven past
      // several times the Fermi speed.
      validity: checkValidity(this.material, ampE, t),
      simulatedMeanSpeed: this.gas.meanSpeed(),
      // Time constant of the drift decay, in WALL-CLOCK seconds at the current
      // slow-motion setting. This is why the electrons do not stop the instant
      // the field is turned down.
      driftDecayRealSeconds: this.gas.relaxationTimeS / this.settings.timeScale,
    });
  }

  dispose() {
    this.disposed = true;
    this.controls.dispose();
    this.lattice.dispose();
    this.gasView?.dispose();
    this.renderer.dispose();
  }
}
