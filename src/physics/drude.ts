/**
 * Drude-Sommerfeld electron gas simulation.
 *
 * Each electron flies in a straight line at roughly the Fermi speed, is
 * accelerated slightly by the applied field, and every so often scatters off a
 * lattice imperfection into a completely new random direction. Scattering is a
 * Poisson process with mean interval tau.
 *
 * THE HONEST DIFFICULTY, which is worth stating because it is the entire point.
 *
 * In real copper the drift velocity is about 1e-10 of the Fermi velocity. The
 * mean velocity of N simulated electrons has statistical noise of roughly
 * v_F / sqrt(N), so to see a drift of 1e-10 * v_F rise above that noise you
 * would need about 1e20 electrons. No simulation will ever show real drift
 * emerging from real thermal motion; the signal is twenty orders of magnitude
 * below the noise floor.
 *
 * So this does the only honest thing available: it simulates the chaos exactly,
 * computes the drift ANALYTICALLY from the Drude result v_d = eEtau/m, and
 * offers a field amplification factor for making drift visible, with that
 * factor reported on screen at all times. What you see when drift is visible is
 * a deliberate exaggeration, and the interface says so.
 */

import { ELECTRON_MASS_KG, ELEMENTARY_CHARGE_C } from './constants';
import { characteristicSpeed, relaxationTime, type ConductionMaterial } from './conduction';

export interface DrudeConfig {
  material: ConductionMaterial;
  temperatureK: number;
  /** Applied field in V/m, already including any amplification. */
  fieldVoltsPerMetre: number;
  /**
   * Half-extent of the simulation box along each axis, in metres. Electrons
   * wrap around it.
   *
   * Per-axis rather than a single cube half-width: the drawn crystal is a
   * wire-shaped slab, and a cube-shaped electron box would leave the gas
   * spilling out of the narrow faces while never reaching the ends.
   */
  boxHalfWidthsM: { x: number; y: number; z: number };
  electronCount: number;
  seed?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class DrudeGas {
  /** Positions in metres, xyz interleaved. */
  readonly positions: Float32Array;
  /** Velocities in m/s, xyz interleaved. */
  readonly velocities: Float32Array;
  /** Seconds since each electron last scattered, for colouring. */
  readonly sinceScatter: Float32Array;

  private rand: () => number;
  private config: DrudeConfig;
  private speed: number;
  private tau: number;

  /** Total simulated time, seconds. */
  public elapsed = 0;
  /** Running count of scattering events, for the collision-rate readout. */
  public scatterEvents = 0;
  /** Net displacement of the ensemble centre of mass, metres. */
  public netDisplacement = 0;

  constructor(config: DrudeConfig) {
    this.config = config;
    this.rand = mulberry32(config.seed ?? 12345);
    // Fermi speed in a metal, thermal speed otherwise. Using the Fermi velocity
    // for a semiconductor would give exactly zero, since it has no Fermi sea.
    this.speed = characteristicSpeed(config.material, config.temperatureK);
    this.tau = relaxationTime(config.material, config.temperatureK);

    const n = config.electronCount;
    this.positions = new Float32Array(n * 3);
    this.velocities = new Float32Array(n * 3);
    this.sinceScatter = new Float32Array(n);

    const h = config.boxHalfWidthsM;
    for (let i = 0; i < n; i++) {
      this.positions[i * 3] = (this.rand() * 2 - 1) * h.x;
      this.positions[i * 3 + 1] = (this.rand() * 2 - 1) * h.y;
      this.positions[i * 3 + 2] = (this.rand() * 2 - 1) * h.z;
      this.randomiseVelocity(i);

      // Start the ensemble in steady state. randomiseVelocity zeroes the clock,
      // so leaving it there would mean every electron in the crystal had just
      // collided at t = 0, which is not a physical state and shows up as the
      // entire gas flashing in unison. In steady state the time since the last
      // collision is exponentially distributed with mean tau.
      this.sinceScatter[i] = -this.tau * Math.log(1 - this.rand());
    }
  }

  /**
   * Point an electron in a uniformly random direction at the Fermi speed.
   *
   * A real Fermi gas has a distribution of speeds filling the Fermi sphere, but
   * only states near the Fermi surface take part in conduction, so treating
   * every conduction electron as moving at v_F is the standard and appropriate
   * simplification.
   */
  private randomiseVelocity(i: number) {
    const cosTheta = 2 * this.rand() - 1;
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    const phi = 2 * Math.PI * this.rand();
    this.velocities[i * 3] = this.speed * sinTheta * Math.cos(phi);
    this.velocities[i * 3 + 1] = this.speed * sinTheta * Math.sin(phi);
    this.velocities[i * 3 + 2] = this.speed * cosTheta;
    this.sinceScatter[i] = 0;
  }

  /** Update the field without restarting the simulation. */
  setField(fieldVoltsPerMetre: number) {
    this.config.fieldVoltsPerMetre = fieldVoltsPerMetre;
  }

  setTemperature(temperatureK: number) {
    this.config.temperatureK = temperatureK;
    this.tau = relaxationTime(this.config.material, temperatureK);
    // Thermal speed tracks temperature; Fermi speed does not, and
    // characteristicSpeed already encodes that difference.
    this.speed = characteristicSpeed(this.config.material, temperatureK);
  }

  get relaxationTimeS(): number {
    return this.tau;
  }

  /** Fermi speed for a metal, thermal speed otherwise. */
  get carrierSpeed(): number {
    return this.speed;
  }

  /**
   * Advance by dt seconds of SIMULATED time.
   *
   * The field points along +x. An electron carries charge -e, so its
   * acceleration is -eE/m: the electron sea drifts AGAINST the field, which is
   * why conventional current and electron flow point opposite ways.
   */
  step(dt: number) {
    if (this.tau <= 0 || this.speed <= 0) return;

    const accel = (-ELEMENTARY_CHARGE_C * this.config.fieldVoltsPerMetre) / ELECTRON_MASS_KG;
    const scatterProbability = 1 - Math.exp(-dt / this.tau);
    const h = this.config.boxHalfWidthsM;
    const halves = [h.x, h.y, h.z];
    const n = this.config.electronCount;

    let meanVx = 0;

    for (let i = 0; i < n; i++) {
      const vi = i * 3;

      this.velocities[vi] += accel * dt;

      for (let axis = 0; axis < 3; axis++) {
        const half = halves[axis];
        let p = this.positions[vi + axis] + this.velocities[vi + axis] * dt;
        // Wrap: the box is a window onto an effectively infinite crystal.
        // Modulo rather than a single subtraction, since one substep can carry
        // a fast electron clear across a thin box more than once.
        if (p > half || p < -half) {
          const span = 2 * half;
          p = ((((p + half) % span) + span) % span) - half;
        }
        this.positions[vi + axis] = p;
      }

      this.sinceScatter[i] += dt;

      if (this.rand() < scatterProbability) {
        // Collisions randomise direction completely and, crucially, wipe out
        // whatever drift the field had built up. That memory loss is exactly
        // what makes resistance: without it the electrons would accelerate
        // without limit and the resistivity would be zero.
        this.randomiseVelocity(i);
        this.scatterEvents++;
      }

      meanVx += this.velocities[vi];
    }

    meanVx /= n;
    this.netDisplacement += meanVx * dt;
    this.elapsed += dt;
  }

  /**
   * Measured mean velocity along the field axis, m/s.
   *
   * With a realistic field this is pure noise: the true drift sits about ten
   * orders of magnitude below the sampling error. Compare it against the
   * analytic driftVelocity() to see the gap.
   */
  measuredDriftVelocity(): number {
    let sum = 0;
    for (let i = 0; i < this.config.electronCount; i++) sum += this.velocities[i * 3];
    return sum / this.config.electronCount;
  }

  /** Expected noise floor of the measurement above, m/s. */
  driftNoiseFloor(): number {
    return this.speed / Math.sqrt(3 * this.config.electronCount);
  }

  /**
   * Mean speed of the carriers as actually simulated, m/s.
   *
   * With no field this sits at the Fermi (or thermal) speed. Under an amplified
   * field it rises above it, because electrons accelerate freely between
   * collisions and only get reset when they scatter. Comparing this against
   * carrierSpeed shows how far the visualisation has been pushed from reality.
   */
  meanSpeed(): number {
    let sum = 0;
    const n = this.config.electronCount;
    for (let i = 0; i < n; i++) {
      sum += Math.hypot(
        this.velocities[i * 3],
        this.velocities[i * 3 + 1],
        this.velocities[i * 3 + 2],
      );
    }
    return sum / n;
  }
}
