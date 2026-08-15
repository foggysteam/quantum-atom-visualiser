/**
 * Element data, nuclear packing, Monte Carlo sampling, and an explicit
 * characterisation of where the Slater model stops working.
 *
 * The accuracy tests here are unusual in that they assert the model is WRONG in
 * specific, known ways. That is deliberate: the project publishes those failures
 * in its interface, so they need to be pinned. If someone improves the radial
 * backend those tests should fail, and the fix is to update them, not to quietly
 * widen the tolerance.
 */

import { describe, it, expect } from 'vitest';
import {
  ELEMENTS,
  elementByZ,
  elementBySymbol,
  neutronCount,
  periodAndGroup,
  tablePosition,
} from './elements';
import { packNucleus, nuclearRadiusFm, woodsSaxonProfile } from './nucleus';
import { sampleElectronPositions } from './sampling';
import { buildOrbitals, outerShellRadius } from './wavefunction';
import { expectedRadius } from './radial';
import { NUCLEON_DRAW_RADIUS_FM, BOHR_IN_FM, BOHR_IN_PM } from './constants';

describe('element data', () => {
  it('covers all 118 elements with sequential atomic numbers', () => {
    expect(ELEMENTS).toHaveLength(118);
    ELEMENTS.forEach((e, i) => expect(e.z).toBe(i + 1));
  });

  it('has a unique symbol for every element', () => {
    const symbols = new Set(ELEMENTS.map((e) => e.symbol));
    expect(symbols.size).toBe(118);
  });

  it('never produces a negative neutron count', () => {
    for (const e of ELEMENTS) {
      expect(neutronCount(e), `${e.symbol} neutrons`).toBeGreaterThanOrEqual(0);
      expect(e.massNumber).toBeGreaterThanOrEqual(e.z);
    }
  });

  it('uses a specific nuclide, not a rounded atomic weight', () => {
    // Chlorine's weight is 35.45 because natural Cl is a Cl-35 / Cl-37 mixture.
    // No individual nucleus has a fractional neutron count.
    const cl = elementBySymbol('Cl');
    expect(cl.atomicWeight).toBeCloseTo(35.45, 2);
    expect(cl.massNumber).toBe(35);
    expect(neutronCount(cl)).toBe(18);
  });

  it('looks up by Z and by symbol, case-insensitively', () => {
    expect(elementByZ(29).symbol).toBe('Cu');
    expect(elementBySymbol('cu').name).toBe('Copper');
    expect(elementBySymbol('CU').z).toBe(29);
    expect(() => elementByZ(0)).toThrow();
    expect(() => elementBySymbol('Xx')).toThrow();
  });

  it('assigns every element a period and group', () => {
    for (const e of ELEMENTS) {
      const { period, group } = periodAndGroup(e.z);
      expect(period, `${e.symbol} period`).toBeGreaterThanOrEqual(1);
      expect(period).toBeLessThanOrEqual(7);
      expect(group, `${e.symbol} group`).toBeGreaterThanOrEqual(1);
      expect(group).toBeLessThanOrEqual(18);
    }
    expect(periodAndGroup(1)).toEqual({ period: 1, group: 1 });
    expect(periodAndGroup(2)).toEqual({ period: 1, group: 18 });
    expect(periodAndGroup(29).period).toBe(4);
  });

  it('puts the whole f-block in group 3', () => {
    for (let z = 57; z <= 71; z++) expect(periodAndGroup(z)).toEqual({ period: 6, group: 3 });
    for (let z = 89; z <= 103; z++) expect(periodAndGroup(z)).toEqual({ period: 7, group: 3 });
  });

  it('gives every element a unique drawing position, with no collisions', () => {
    // The bug this guards: putting lanthanides in real main-table columns makes
    // La-Lu land on top of Hf-Rn, so fifteen elements silently vanish.
    const seen = new Map<string, string>();
    for (const e of ELEMENTS) {
      const { row, col } = tablePosition(e.z);
      const key = `${row},${col}`;
      expect(seen.has(key), `${e.symbol} collides with ${seen.get(key)} at ${key}`).toBe(false);
      seen.set(key, e.symbol);
    }
    expect(seen.size).toBe(118);
  });

  it('pulls the f-block out into its own rows', () => {
    expect(tablePosition(57)).toEqual({ row: 9, col: 3, fBlock: true }); // La
    expect(tablePosition(71)).toEqual({ row: 9, col: 17, fBlock: true }); // Lu
    expect(tablePosition(89)).toEqual({ row: 10, col: 3, fBlock: true }); // Ac
    expect(tablePosition(103)).toEqual({ row: 10, col: 17, fBlock: true }); // Lr
    // And the main table keeps its own slots.
    expect(tablePosition(72)).toEqual({ row: 6, col: 4, fBlock: false }); // Hf
    expect(tablePosition(86)).toEqual({ row: 6, col: 18, fBlock: false }); // Rn
  });
});

describe('where the Slater model holds and where it fails', () => {
  const modelRadiusPm = (z: number) =>
    outerShellRadius(buildOrbitals(z, 'spherical')) * BOHR_IN_PM;

  const ratio = (z: number) => modelRadiusPm(z) / elementByZ(z).covalentRadiusPm!;

  it('tracks main-group elements reasonably', () => {
    for (const z of [6, 7, 8, 14, 16, 17, 35]) {
      expect(ratio(z), `Z=${z} ${elementByZ(z).symbol}`).toBeLessThan(2);
    }
  });

  it('blows out for elements sitting on a filled d shell', () => {
    // Cu, Ag and Au all have a lone valence s outside a full d shell. Slater
    // screens d electrons as though they penetrated the core like s and p
    // electrons do, which they do not, so the valence orbital comes out far too
    // loose. This is the model's single biggest systematic failure.
    expect(ratio(29)).toBeGreaterThan(2); // Cu
    expect(ratio(47)).toBeGreaterThan(3); // Ag
    expect(ratio(79)).toBeGreaterThan(5); // Au
    // And it worsens monotonically down that group.
    expect(ratio(79)).toBeGreaterThan(ratio(47));
    expect(ratio(47)).toBeGreaterThan(ratio(29));
  });

  it('shows a large ratio for hydrogen even though the model is exact there', () => {
    // Guards against reading the ratio as "error". Hydrogen's wavefunction is
    // the exact analytic solution, yet <r> = 1.5 a0 = 79 pm against a covalent
    // radius of 31 pm. The offset is a difference of definition, not a defect.
    expect(modelRadiusPm(1)).toBeCloseTo(1.5 * BOHR_IN_PM, 6);
    expect(ratio(1)).toBeGreaterThan(2);
  });

  it('produces a finite, positive radius for every element', () => {
    for (let z = 1; z <= 118; z++) {
      const r = modelRadiusPm(z);
      expect(Number.isFinite(r), `Z=${z}`).toBe(true);
      expect(r).toBeGreaterThan(0);
    }
  });
});

describe('nucleus model', () => {
  it('follows R = r0 * A^(1/3)', () => {
    expect(nuclearRadiusFm(1)).toBeCloseTo(1.25, 6);
    expect(nuclearRadiusFm(8)).toBeCloseTo(2.5, 6); // cube root of 8 is 2
    expect(nuclearRadiusFm(64)).toBeCloseTo(5.0, 6);
    // Iron-56 is measured at roughly 4.6-4.8 fm.
    expect(nuclearRadiusFm(56)).toBeGreaterThan(4.5);
    expect(nuclearRadiusFm(56)).toBeLessThan(5.0);
  });

  it('packs exactly the requested protons and neutrons', () => {
    for (const [z, n] of [[1, 0], [2, 2], [6, 6], [26, 30], [29, 34], [92, 146]] as const) {
      const model = packNucleus(z, n);
      expect(model.nucleons).toHaveLength(z + n);
      expect(model.nucleons.filter((x) => x.type === 'proton')).toHaveLength(z);
      expect(model.nucleons.filter((x) => x.type === 'neutron')).toHaveLength(n);
    }
  });

  it('places a lone hydrogen proton at the origin', () => {
    const h = packNucleus(1, 0);
    expect(h.nucleons).toHaveLength(1);
    expect(h.nucleons[0]).toMatchObject({ x: 0, y: 0, z: 0, type: 'proton' });
  });

  it('is deterministic for a given nuclide', () => {
    const a = packNucleus(26, 30);
    const b = packNucleus(26, 30);
    expect(a.nucleons).toEqual(b.nucleons);
  });

  it('is centred on the origin', () => {
    const model = packNucleus(29, 34);
    const mean = model.nucleons.reduce(
      (acc, p) => [acc[0] + p.x, acc[1] + p.y, acc[2] + p.z],
      [0, 0, 0],
    ).map((v) => v / model.nucleons.length);
    for (const c of mean) expect(Math.abs(c)).toBeLessThan(1e-9);
  });

  it('does not leave nucleons badly overlapping after relaxation', () => {
    const model = packNucleus(26, 30);
    const minAllowed = 2 * NUCLEON_DRAW_RADIUS_FM * 0.75;
    let worst = Infinity;
    for (let i = 0; i < model.nucleons.length; i++) {
      for (let j = i + 1; j < model.nucleons.length; j++) {
        const a = model.nucleons[i];
        const b = model.nucleons[j];
        worst = Math.min(worst, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
      }
    }
    expect(worst).toBeGreaterThan(minAllowed);
  });

  it('keeps nucleons within the nuclear surface', () => {
    const model = packNucleus(29, 34);
    for (const p of model.nucleons) {
      expect(Math.hypot(p.x, p.y, p.z)).toBeLessThan(model.radiusFm * 1.4);
    }
  });

  it('has a Woods-Saxon profile that is flat inside and falls off at the surface', () => {
    const A = 56;
    const R = nuclearRadiusFm(A);
    expect(woodsSaxonProfile(0, A)).toBeGreaterThan(0.99);
    expect(woodsSaxonProfile(R, A)).toBeCloseTo(0.5, 6); // half density at R, by definition
    expect(woodsSaxonProfile(R + 2, A)).toBeLessThan(0.03);
  });

  it('confirms the nucleus is utterly dwarfed by the atom', () => {
    // Hydrogen: nucleus about 1.7 fm across, atom about 1 Bohr radius.
    // If this ratio is not tiny, the scale handling is broken.
    const ratio = (2 * nuclearRadiusFm(1)) / BOHR_IN_FM;
    expect(ratio).toBeLessThan(1e-4);
    expect(1 / ratio).toBeGreaterThan(20000);
  });
});

describe('Monte Carlo sampling of |psi|^2', () => {
  it('reproduces the analytic mean radius for hydrogen 1s', () => {
    const orbitals = buildOrbitals(1);
    const { positions } = sampleElectronPositions(orbitals, 200000, 42);

    let meanR = 0;
    for (let i = 0; i < 200000; i++) {
      meanR += Math.hypot(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    }
    meanR /= 200000;

    // <r> = 1.5 a0 exactly; allow for Monte Carlo noise at this sample size.
    expect(meanR).toBeCloseTo(1.5, 1);
  });

  it('reproduces the analytic mean radius for a screened multi-electron orbital', () => {
    const orbitals = buildOrbitals(29);
    const s4 = orbitals.filter((o) => o.n === 4 && o.l === 0);
    const { positions } = sampleElectronPositions(s4, 100000, 7);

    let meanR = 0;
    for (let i = 0; i < 100000; i++) {
      meanR += Math.hypot(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    }
    meanR /= 100000;

    expect(meanR).toBeCloseTo(expectedRadius(4, 0, s4[0].zEff), 0);
  });

  it('samples a pz orbital into two lobes on the z axis, with nothing in the xy plane', () => {
    const orbitals = buildOrbitals(1).map((o) => ({ ...o, n: 2, l: 1, m: 0 }));
    const { positions } = sampleElectronPositions(orbitals, 50000, 3);

    let nearPlane = 0;
    let meanAbsZ = 0;
    let meanAbsX = 0;
    for (let i = 0; i < 50000; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      const r = Math.hypot(x, y, z);
      if (r > 0 && Math.abs(z) / r < 0.02) nearPlane++;
      meanAbsZ += Math.abs(z);
      meanAbsX += Math.abs(x);
    }

    // The xy plane is a nodal plane: the density there is exactly zero.
    expect(nearPlane / 50000).toBeLessThan(0.005);
    // And the cloud is elongated along z.
    expect(meanAbsZ).toBeGreaterThan(meanAbsX * 1.5);
  });

  it('produces a spherical cloud for a closed-shell atom', () => {
    const { positions } = sampleElectronPositions(buildOrbitals(10, 'hund'), 100000, 11);

    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < 100000; i++) {
      sx += positions[i * 3] ** 2;
      sy += positions[i * 3 + 1] ** 2;
      sz += positions[i * 3 + 2] ** 2;
    }
    // Neon is closed-shell, so the three variances must match.
    expect(sx / sy).toBeCloseTo(1, 1);
    expect(sx / sz).toBeCloseTo(1, 1);
  });

  it('records the wavefunction phase on each sampled point', () => {
    const orbitals = buildOrbitals(1).map((o) => ({ ...o, n: 2, l: 1, m: 0 }));
    const { positions, phases } = sampleElectronPositions(orbitals, 5000, 5);
    for (let i = 0; i < 5000; i++) {
      // For pz the phase sign must track the sign of z.
      expect(phases[i]).toBe(Math.sign(positions[i * 3 + 2]) || 1);
    }
  });

  it('returns finite positions for every orbital of a heavy element', () => {
    const { positions } = sampleElectronPositions(buildOrbitals(79), 20000, 13);
    for (let i = 0; i < positions.length; i++) {
      expect(Number.isFinite(positions[i])).toBe(true);
    }
  });
});
