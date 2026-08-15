/**
 * Conduction: the Drude model, material properties and the electron gas.
 *
 * Checked against published measurements for copper rather than against the
 * implementation: Fermi velocity 1.57e6 m/s, relaxation time ~25 fs, mean free
 * path ~39 nm, conductivity 5.96e7 S/m.
 *
 * Two tests are about the model's limits rather than its results. One asserts
 * that real drift CANNOT be resolved by any feasible simulation, since the
 * signal sits twenty orders of magnitude below the sampling noise. Another
 * asserts that asking for household current density through silicon produces
 * faster-than-light drift, which is what the validity guard exists to catch.
 */

import { describe, it, expect } from 'vitest';
import {
  CONDUCTION_MATERIALS,
  materialBySymbol,
  atomDensity,
  carrierDensity,
  fermiVelocity,
  relaxationTime,
  meanFreePath,
  driftVelocity,
  currentDensity,
  fieldForCurrentDensity,
  resistivityAt,
  conductivityAt,
  timeToDriftOneMetre,
  characteristicSpeed,
  volumePerCarrier,
  checkValidity,
} from './conduction';
import { DrudeGas } from './drude';
import { REFERENCE_TEMPERATURE_K } from './constants';

const T = REFERENCE_TEMPERATURE_K;
const Cu = materialBySymbol('Cu');

describe('copper, against textbook values', () => {
  it('has the right atom density for an FCC lattice', () => {
    // 4 atoms per cell, a = 3.615 A  ->  8.47e28 atoms per cubic metre.
    expect(atomDensity(Cu) / 1e28).toBeCloseTo(8.47, 1);
  });

  it('gives one conduction electron per atom', () => {
    expect(carrierDensity(Cu, T) / 1e28).toBeCloseTo(8.47, 1);
  });

  it('has a Fermi velocity of about 1.57e6 m/s', () => {
    expect(fermiVelocity(Cu) / 1e6).toBeCloseTo(1.57, 1);
  });

  it('has a relaxation time of about 25 femtoseconds', () => {
    expect(relaxationTime(Cu, T) * 1e15).toBeGreaterThan(20);
    expect(relaxationTime(Cu, T) * 1e15).toBeLessThan(30);
  });

  it('has a mean free path of about 39 nm, roughly a hundred atomic spacings', () => {
    const lambda = meanFreePath(Cu, T);
    expect(lambda * 1e9).toBeGreaterThan(30);
    expect(lambda * 1e9).toBeLessThan(50);
    // Compare with the lattice spacing to make the "hundred ions" claim concrete.
    expect(lambda / (Cu.latticeConstantA * 1e-10)).toBeGreaterThan(80);
  });

  it('has a conductivity of about 5.96e7 S/m', () => {
    expect(conductivityAt(Cu, T) / 1e7).toBeCloseTo(5.96, 1);
  });

  it('recovers Ohm law: J = sigma E', () => {
    const E = 0.05;
    expect(currentDensity(Cu, E, T)).toBeCloseTo(conductivityAt(Cu, T) * E, 6);
  });

  it('round-trips field and current density', () => {
    const J = 1e6; // about 1 A per square millimetre
    const E = fieldForCurrentDensity(Cu, J, T);
    expect(currentDensity(Cu, E, T)).toBeCloseTo(J, 0);
  });
});

describe('the drift velocity surprise', () => {
  it('drifts at well under a millimetre per second at household current', () => {
    const J = 1e6;
    const E = fieldForCurrentDensity(Cu, J, T);
    const vd = driftVelocity(Cu, E, T);

    // J = n e v_d is the definition; check it independently.
    const expected = J / (carrierDensity(Cu, T) * 1.602176634e-19);
    expect(vd).toBeCloseTo(expected, 8);

    expect(vd).toBeGreaterThan(1e-5);
    expect(vd).toBeLessThan(1e-3);
  });

  it('has a drift velocity about ten orders of magnitude below the Fermi velocity', () => {
    const E = fieldForCurrentDensity(Cu, 1e6, T);
    const ratio = driftVelocity(Cu, E, T) / fermiVelocity(Cu);
    expect(ratio).toBeLessThan(1e-9);
    expect(ratio).toBeGreaterThan(1e-12);
  });

  it('takes an electron more than an hour to drift a single metre', () => {
    const E = fieldForCurrentDensity(Cu, 1e6, T);
    const seconds = timeToDriftOneMetre(Cu, E, T);
    expect(seconds).toBeGreaterThan(3600);
  });
});

describe('temperature dependence', () => {
  it('makes metals more resistive when hotter', () => {
    expect(resistivityAt(Cu, 373)).toBeGreaterThan(resistivityAt(Cu, 273));
  });

  it('makes semiconductors LESS resistive when hotter, the opposite of a metal', () => {
    const Si = materialBySymbol('Si');
    expect(resistivityAt(Si, 400)).toBeLessThan(resistivityAt(Si, 300));
    // And the effect is dramatic, not marginal.
    expect(resistivityAt(Si, 300) / resistivityAt(Si, 400)).toBeGreaterThan(50);
  });

  it('never lets the linear metal law run negative at low temperature', () => {
    for (const m of CONDUCTION_MATERIALS.filter((x) => x.conductionClass === 'metal')) {
      for (const t of [1, 20, 77, 200, 300, 600]) {
        expect(resistivityAt(m, t), `${m.symbol} at ${t}K`).toBeGreaterThan(0);
      }
    }
  });
});

describe('why insulators do not conduct', () => {
  it('gives silicon vastly fewer carriers than copper', () => {
    const Si = materialBySymbol('Si');
    const ratio = carrierDensity(Cu, T) / carrierDensity(Si, T);
    // Around thirteen orders of magnitude.
    expect(ratio).toBeGreaterThan(1e11);
  });

  it('gives diamond essentially zero carriers at room temperature', () => {
    const C = materialBySymbol('C');
    const n = carrierDensity(C, T);
    // Fewer than one carrier in a cubic metre: not "slow", absent.
    expect(n).toBeLessThan(1);
    expect(n).toBeGreaterThan(0);
  });

  it('shows the band gap alone spans twenty orders of magnitude in carriers', () => {
    const Si = materialBySymbol('Si');
    const C = materialBySymbol('C');
    // Same structure, same four bonded electrons; only the gap differs.
    expect(Si.structure).toBe(C.structure);
    expect(carrierDensity(Si, T) / carrierDensity(C, T)).toBeGreaterThan(1e20);
  });

  it('orders the materials by conductivity as expected', () => {
    const order = [...CONDUCTION_MATERIALS].sort(
      (a, b) => conductivityAt(b, T) - conductivityAt(a, T),
    );
    expect(order[0].symbol).toBe('Ag'); // silver is the best conductor
    expect(order[order.length - 1].symbol).toBe('C'); // diamond the worst
  });
});

describe('carrier speed: degenerate versus classical', () => {
  it('gives metals a temperature-independent Fermi speed', () => {
    // The Fermi velocity comes from the Pauli principle, not from heat, so
    // cooling copper to 20 K barely changes how fast its electrons move.
    expect(characteristicSpeed(Cu, 20)).toBeCloseTo(characteristicSpeed(Cu, 800), 0);
    expect(characteristicSpeed(Cu, T)).toBeCloseTo(fermiVelocity(Cu), 0);
  });

  it('gives semiconductors a thermal speed that scales as sqrt(T)', () => {
    const Si = materialBySymbol('Si');
    const v300 = characteristicSpeed(Si, 300);
    const v1200 = characteristicSpeed(Si, 1200);
    // Four times the temperature is twice the speed.
    expect(v1200 / v300).toBeCloseTo(2, 1);
  });

  it('makes semiconductor carriers much slower than metal electrons', () => {
    const Si = materialBySymbol('Si');
    expect(characteristicSpeed(Si, T)).toBeGreaterThan(1e5);
    expect(characteristicSpeed(Si, T)).toBeLessThan(characteristicSpeed(Cu, T) / 4);
  });

  it('never returns zero for a non-metal, which would freeze the simulation', () => {
    for (const m of CONDUCTION_MATERIALS) {
      expect(characteristicSpeed(m, T), m.symbol).toBeGreaterThan(0);
    }
  });
});

describe('how much material holds one carrier', () => {
  it('needs only a few cubic nanometres of copper', () => {
    expect(volumePerCarrier(Cu, T)).toBeLessThan(1e-28);
  });

  it('needs micrometres of silicon', () => {
    const side = Math.cbrt(volumePerCarrier(materialBySymbol('Si'), T));
    expect(side).toBeGreaterThan(1e-6);
    expect(side).toBeLessThan(1e-4);
  });

  it('needs a block of diamond bigger than the Earth', () => {
    const side = Math.cbrt(volumePerCarrier(materialBySymbol('C'), T));
    const earthDiameter = 1.27e7;
    expect(side).toBeGreaterThan(earthDiameter);
  });
});

describe('model validity guards', () => {
  it('accepts an ordinary copper wire', () => {
    const E = fieldForCurrentDensity(Cu, 1e6, T);
    expect(checkValidity(Cu, E, T).ok).toBe(true);
  });

  it('rejects household current density through silicon', () => {
    // This is the trap: the arithmetic is fine, the physics is impossible.
    const Si = materialBySymbol('Si');
    const E = fieldForCurrentDensity(Si, 1e6, T);
    const v = checkValidity(Si, E, T);
    expect(v.ok).toBe(false);
    expect(v.relativisticDrift).toBe(true);
    expect(Math.abs(driftVelocity(Si, E, T))).toBeGreaterThan(2.99e8);
  });

  it('flags fields past dielectric breakdown', () => {
    const Si = materialBySymbol('Si');
    const v = checkValidity(Si, Si.breakdownFieldVPerM * 2, T);
    expect(v.exceedsBreakdown).toBe(true);
    expect(v.ok).toBe(false);
  });

  it('accepts a modest field in silicon', () => {
    expect(checkValidity(materialBySymbol('Si'), 1e3, T).ok).toBe(true);
  });
});

describe('Drude gas simulation', () => {
  const makeGas = (field: number, count = 4000) =>
    new DrudeGas({
      material: Cu,
      temperatureK: T,
      fieldVoltsPerMetre: field,
      boxHalfWidthsM: { x: 5e-9, y: 2e-9, z: 2e-9 },
      electronCount: count,
      seed: 7,
    });

  it('starts in steady state, not with every electron freshly collided', () => {
    const gas = makeGas(0, 5000);
    const tau = relaxationTime(Cu, T);

    let sum = 0;
    let zeroes = 0;
    for (let i = 0; i < 5000; i++) {
      sum += gas.sinceScatter[i];
      if (gas.sinceScatter[i] === 0) zeroes++;
    }
    // Exponentially distributed with mean tau, so almost none should be at zero.
    expect(zeroes).toBeLessThan(5);
    expect(sum / 5000).toBeGreaterThan(tau * 0.8);
    expect(sum / 5000).toBeLessThan(tau * 1.2);
  });

  it('starts with electrons at the Fermi speed in random directions', () => {
    const gas = makeGas(0);
    for (let i = 0; i < 50; i++) {
      const speed = Math.hypot(
        gas.velocities[i * 3],
        gas.velocities[i * 3 + 1],
        gas.velocities[i * 3 + 2],
      );
      expect(speed).toBeCloseTo(fermiVelocity(Cu), 0);
    }
    // No field, so no net direction.
    expect(Math.abs(gas.measuredDriftVelocity())).toBeLessThan(gas.driftNoiseFloor() * 4);
  });

  it('keeps electrons inside the box by wrapping, on every axis', () => {
    const gas = makeGas(0);
    const halves = [5e-9, 2e-9, 2e-9];
    // Deliberately coarse steps: at the Fermi speed an electron crosses the
    // thin axes several times in one step, which is exactly the case a naive
    // single-subtraction wrap would fail.
    for (let i = 0; i < 400; i++) gas.step(5e-15);
    for (let i = 0; i < gas.positions.length; i++) {
      const half = halves[i % 3];
      expect(Math.abs(gas.positions[i]), `axis ${i % 3}`).toBeLessThanOrEqual(half + 1e-15);
    }
  });

  it('scatters at roughly the expected rate', () => {
    const gas = makeGas(0, 2000);
    const dt = 1e-15;
    const steps = 500;
    for (let i = 0; i < steps; i++) gas.step(dt);

    // Expected events = N * total time / tau.
    const expected = (2000 * steps * dt) / relaxationTime(Cu, T);
    expect(gas.scatterEvents).toBeGreaterThan(expected * 0.85);
    expect(gas.scatterEvents).toBeLessThan(expected * 1.15);
  });

  it('reproduces the analytic drift velocity under a huge field', () => {
    // With an absurdly large field the drift rises above the sampling noise and
    // the simulation can be checked against v_d = e E tau / m directly. This is
    // exactly the amplification the UI exposes, used here as a test oracle.
    const field = 1e8;
    const gas = makeGas(field, 20000);
    const dt = 1e-15;
    for (let i = 0; i < 3000; i++) gas.step(dt);

    const analytic = driftVelocity(Cu, field, T);
    const measured = gas.measuredDriftVelocity();
    // Electrons drift against the field, so the measured value is negative.
    expect(measured).toBeLessThan(0);
    expect(Math.abs(measured)).toBeGreaterThan(Math.abs(analytic) * 0.6);
    expect(Math.abs(measured)).toBeLessThan(Math.abs(analytic) * 1.4);
  });

  it('decays drift exponentially with time constant tau after the field is removed', () => {
    // This is the behaviour that looks like a bug in the UI: turn the field off
    // and the electrons keep moving for a while. It is the relaxation time, and
    // it is the reason metals have resistance at all.
    const field = 1e8;
    const gas = makeGas(field, 20000);
    const dt = 1e-15;
    for (let i = 0; i < 3000; i++) gas.step(dt);

    const driven = Math.abs(gas.measuredDriftVelocity());
    expect(driven).toBeGreaterThan(gas.driftNoiseFloor() * 5);

    // Field off. After one tau the drift should have fallen to roughly 1/e.
    gas.setField(0);
    const tau = relaxationTime(Cu, T);
    const steps = Math.round(tau / dt);
    for (let i = 0; i < steps; i++) gas.step(dt);
    const afterOneTau = Math.abs(gas.measuredDriftVelocity());

    expect(afterOneTau).toBeLessThan(driven * 0.65);
    expect(afterOneTau).toBeGreaterThan(driven * 0.10);

    // After several tau it should be back down in the noise.
    for (let i = 0; i < steps * 5; i++) gas.step(dt);
    expect(Math.abs(gas.measuredDriftVelocity())).toBeLessThan(gas.driftNoiseFloor() * 4);
  });

  it('drives carriers well past the Fermi speed when the field is amplified', () => {
    // The amplification slider pushes the simulation outside the regime Drude
    // describes, which is exactly why validity has to be checked against the
    // amplified field rather than the real one.
    const gas = makeGas(1e10, 4000);
    for (let i = 0; i < 2000; i++) gas.step(1e-15);
    expect(gas.meanSpeed()).toBeGreaterThan(gas.carrierSpeed * 2);
    expect(checkValidity(Cu, 1e10, T).ok).toBe(false);
  });

  it('reports the model as valid at the real field but not at an amplified one', () => {
    const realE = fieldForCurrentDensity(Cu, 1e6, T);
    expect(checkValidity(Cu, realE, T).ok).toBe(true);
    expect(checkValidity(Cu, realE * 1e12, T).ok).toBe(false);
  });

  it('cannot possibly resolve real drift, and reports why', () => {
    // The honest limitation: at a realistic field the drift is buried far below
    // the statistical noise of any feasible number of simulated electrons.
    const field = fieldForCurrentDensity(Cu, 1e6, T);
    const gas = makeGas(field, 20000);
    const analytic = Math.abs(driftVelocity(Cu, field, T));
    expect(analytic).toBeLessThan(gas.driftNoiseFloor() * 1e-6);
  });
});
