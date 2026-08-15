/**
 * Electrical conduction: why copper carries current and diamond does not.
 *
 * THE HEADLINE NUMBER, because nearly every animation of "electricity" gets it
 * backwards. In copper at a typical household current density:
 *
 *   Fermi velocity   ~ 1,570,000 m/s     (how fast electrons actually move)
 *   drift velocity   ~ 0.0001 m/s        (how fast the current moves)
 *   field propagation ~ 200,000,000 m/s  (how fast the wire "turns on")
 *
 * The conduction electrons are already screaming around at over a million
 * metres per second in random directions, at absolute zero, with no field
 * applied at all. Switching on a field does not set them moving; it biases that
 * existing chaos by about one part in ten billion. An individual electron takes
 * roughly an hour to travel a metre of wire.
 *
 * Yet the lamp lights instantly, because what travels is the electromagnetic
 * field, at a good fraction of the speed of light. The electrons are more like
 * water already filling a pipe than like water being pushed into an empty one.
 *
 * WHY SOME MATERIALS CONDUCT: it is not that insulators' electrons are somehow
 * stuck. It is that conduction needs electrons in states they can be nudged
 * into, and that requires a partly filled band. Copper's lone 4s electron sits
 * in a half-filled band, so an arbitrarily small field can accelerate it.
 * Diamond's bands are full, and the next empty one is 5.47 eV up: at room
 * temperature the fraction of electrons with that much thermal energy is around
 * 1e-46. There are effectively zero carriers, not slow ones.
 */

import {
  BOLTZMANN_J_PER_K,
  ELECTRON_MASS_KG,
  ELEMENTARY_CHARGE_C,
  EV_IN_JOULES,
  REFERENCE_TEMPERATURE_K,
  SPEED_OF_LIGHT_M_S,
} from './constants';

export type CrystalStructure = 'fcc' | 'diamond';
export type ConductionClass = 'metal' | 'semiconductor' | 'insulator';

export interface ConductionMaterial {
  symbol: string;
  name: string;
  /** Atomic number, so the atom viewer can be opened on the same element. */
  z: number;
  structure: CrystalStructure;
  /** Conventional cubic cell edge, in angstroms. */
  latticeConstantA: number;
  conductionClass: ConductionClass;

  /** Free electrons contributed per atom. Zero for non-metals. */
  carriersPerAtom: number;
  /** Fermi energy in eV. Zero for non-metals. */
  fermiEnergyEv: number;
  /** Resistivity at 20 C, ohm metres. */
  resistivity20C: number;
  /** Fractional resistivity change per kelvin, near room temperature. */
  tempCoefficient: number;
  /** Band gap in eV. Zero for metals. */
  bandGapEv: number;
  /**
   * Dielectric breakdown field in V/m, above which the material stops being an
   * insulator and arcs. Zero for metals, which have no such limit.
   */
  breakdownFieldVPerM: number;
  /** Carrier effective mass as a fraction of the free electron mass. */
  effectiveMassRatio: number;

  /** Which valence subshell delocalises, for the explanation text. */
  valenceNote: string;
}

export const CONDUCTION_MATERIALS: ConductionMaterial[] = [
  {
    symbol: 'Cu',
    name: 'Copper',
    z: 29,
    structure: 'fcc',
    latticeConstantA: 3.615,
    conductionClass: 'metal',
    carriersPerAtom: 1,
    fermiEnergyEv: 7.0,
    resistivity20C: 1.68e-8,
    tempCoefficient: 3.9e-3,
    bandGapEv: 0,
    breakdownFieldVPerM: 0,
    effectiveMassRatio: 1.0,
    valenceNote:
      'One 4s electron outside a filled 3d shell. It is loosely held and shared across the whole crystal.',
  },
  {
    symbol: 'Ag',
    name: 'Silver',
    z: 47,
    structure: 'fcc',
    latticeConstantA: 4.085,
    conductionClass: 'metal',
    carriersPerAtom: 1,
    fermiEnergyEv: 5.49,
    resistivity20C: 1.59e-8,
    tempCoefficient: 3.8e-3,
    bandGapEv: 0,
    breakdownFieldVPerM: 0,
    effectiveMassRatio: 1.0,
    valenceNote:
      'One 5s electron outside a filled 4d shell. The best conductor of any element at room temperature.',
  },
  {
    symbol: 'Au',
    name: 'Gold',
    z: 79,
    structure: 'fcc',
    latticeConstantA: 4.078,
    conductionClass: 'metal',
    carriersPerAtom: 1,
    fermiEnergyEv: 5.53,
    resistivity20C: 2.44e-8,
    tempCoefficient: 3.4e-3,
    bandGapEv: 0,
    breakdownFieldVPerM: 0,
    effectiveMassRatio: 1.0,
    valenceNote:
      'One 6s electron outside a filled 5d shell. Relativistic effects contract that 6s orbital, which is also why gold looks yellow.',
  },
  {
    symbol: 'Al',
    name: 'Aluminium',
    z: 13,
    structure: 'fcc',
    latticeConstantA: 4.05,
    conductionClass: 'metal',
    carriersPerAtom: 3,
    fermiEnergyEv: 11.7,
    resistivity20C: 2.65e-8,
    tempCoefficient: 3.9e-3,
    bandGapEv: 0,
    breakdownFieldVPerM: 0,
    effectiveMassRatio: 1.0,
    valenceNote:
      'Three valence electrons (3s2 3p1) per atom, so three times copper carrier density, yet still more resistive: carriers are only half the story, scattering is the other.',
  },
  {
    symbol: 'Si',
    name: 'Silicon',
    z: 14,
    structure: 'diamond',
    latticeConstantA: 5.431,
    conductionClass: 'semiconductor',
    carriersPerAtom: 0,
    fermiEnergyEv: 0,
    resistivity20C: 2.3e3,
    tempCoefficient: -7.5e-2,
    bandGapEv: 1.12,
    breakdownFieldVPerM: 3e7,
    effectiveMassRatio: 0.26,
    valenceNote:
      'All four valence electrons are locked into covalent bonds. Conduction needs thermal excitation across a 1.12 eV gap, so carriers are scarce but not absent.',
  },
  {
    symbol: 'C',
    name: 'Diamond',
    z: 6,
    structure: 'diamond',
    latticeConstantA: 3.567,
    conductionClass: 'insulator',
    carriersPerAtom: 0,
    fermiEnergyEv: 0,
    resistivity20C: 1e14,
    tempCoefficient: -1e-1,
    bandGapEv: 5.47,
    breakdownFieldVPerM: 2e9,
    effectiveMassRatio: 0.20,
    valenceNote:
      'Same crystal structure as silicon, same four bonded electrons, but a 5.47 eV gap. That difference alone spans about twenty orders of magnitude in resistivity.',
  },
];

/** Atoms per conventional cubic cell. FCC has 4; diamond is FCC with a 2-atom basis. */
export function atomsPerCell(structure: CrystalStructure): number {
  return structure === 'diamond' ? 8 : 4;
}

/** Number density of atoms, per cubic metre. */
export function atomDensity(material: ConductionMaterial): number {
  const aMetres = material.latticeConstantA * 1e-10;
  return atomsPerCell(material.structure) / (aMetres * aMetres * aMetres);
}

/**
 * Effective density-of-states prefactor for an intrinsic semiconductor,
 * sqrt(Nc * Nv), per cubic metre at temperature T.
 *
 * Uses silicon's effective masses as a stand-in for both covalent crystals
 * here; the exponential gap term dominates so completely that the prefactor
 * barely matters for the comparison being made.
 */
function intrinsicPrefactor(temperatureK: number): number {
  const NC_300 = 2.8e25;
  const NV_300 = 1.04e25;
  const scale = Math.pow(temperatureK / 300, 1.5);
  return Math.sqrt(NC_300 * NV_300) * scale;
}

/**
 * Free-carrier density in per cubic metre.
 *
 * Metals: one (or three) electrons per atom, temperature independent.
 * Everything else: thermally excited across the gap, n = sqrt(Nc Nv) exp(-Eg / 2kT).
 *
 * The exponential is the whole story. Between silicon and diamond only the gap
 * changes, and the carrier density falls by about thirty orders of magnitude.
 */
export function carrierDensity(material: ConductionMaterial, temperatureK: number): number {
  if (material.conductionClass === 'metal') {
    return material.carriersPerAtom * atomDensity(material);
  }
  const kT = (BOLTZMANN_J_PER_K * temperatureK) / EV_IN_JOULES; // in eV
  return intrinsicPrefactor(temperatureK) * Math.exp(-material.bandGapEv / (2 * kT));
}

/**
 * Fermi velocity, m/s: the speed of the fastest occupied electrons.
 *
 * This is the speed that matters for how electrons actually move, and it is
 * enormous. It also has almost nothing to do with temperature: it comes from
 * the Pauli exclusion principle stacking electrons up in energy, not from heat.
 * Copper's conduction electrons move at ~1.57e6 m/s even at absolute zero.
 */
export function fermiVelocity(material: ConductionMaterial): number {
  if (material.fermiEnergyEv <= 0) return 0;
  return Math.sqrt((2 * material.fermiEnergyEv * EV_IN_JOULES) / ELECTRON_MASS_KG);
}

/**
 * Thermal velocity of a carrier, m/s: sqrt(3 k T / m*).
 *
 * This is the CLASSICAL speed, and it is what carriers in a semiconductor
 * actually have. The distinction from the Fermi velocity is not a technicality:
 *
 *  - In a metal the electrons are degenerate. They are stacked into momentum
 *    states by the Pauli principle, the ones that conduct sit at the Fermi
 *    surface, and their speed barely depends on temperature at all. Copper's
 *    conduction electrons move at 1.57e6 m/s even at absolute zero.
 *
 *  - In a semiconductor the carriers are sparse enough to behave like an
 *    ordinary gas. Their speed is thermal, proportional to sqrt(T), and around
 *    2e5 m/s at room temperature: nearly ten times slower than in copper, and
 *    it vanishes as the crystal is cooled.
 */
export function thermalVelocity(material: ConductionMaterial, temperatureK: number): number {
  const mass = material.effectiveMassRatio * ELECTRON_MASS_KG;
  return Math.sqrt((3 * BOLTZMANN_J_PER_K * temperatureK) / mass);
}

/**
 * The speed carriers actually move at: Fermi velocity in a metal, thermal
 * velocity otherwise. This is what the simulation should use.
 */
export function characteristicSpeed(
  material: ConductionMaterial,
  temperatureK: number,
): number {
  return material.conductionClass === 'metal'
    ? fermiVelocity(material)
    : thermalVelocity(material, temperatureK);
}

/**
 * Volume, in cubic metres, that contains one free carrier on average.
 *
 * The most concrete way to say what an insulator is. Copper holds about 1e29
 * carriers per cubic metre; for diamond you would have to assemble a block
 * thousands of kilometres across before expecting to find a single one.
 */
export function volumePerCarrier(
  material: ConductionMaterial,
  temperatureK: number,
): number {
  const n = carrierDensity(material, temperatureK);
  return n > 0 ? 1 / n : Infinity;
}

/** Resistivity at a temperature, from the linear coefficient (metals) or the gap. */
export function resistivityAt(material: ConductionMaterial, temperatureK: number): number {
  if (material.conductionClass === 'metal') {
    const delta = temperatureK - REFERENCE_TEMPERATURE_K;
    // Clamped: the linear law is only valid near room temperature, and would
    // otherwise pass through zero and go negative around 40 K.
    return Math.max(
      material.resistivity20C * (1 + material.tempCoefficient * delta),
      material.resistivity20C * 0.02,
    );
  }
  // Non-metals: resistivity tracks the inverse of the thermally excited carriers.
  const nRef = carrierDensity(material, REFERENCE_TEMPERATURE_K);
  const n = carrierDensity(material, temperatureK);
  if (n <= 0) return Infinity;
  return material.resistivity20C * (nRef / n);
}

/** Conductivity, siemens per metre. */
export function conductivityAt(material: ConductionMaterial, temperatureK: number): number {
  const rho = resistivityAt(material, temperatureK);
  return rho > 0 && Number.isFinite(rho) ? 1 / rho : 0;
}

/**
 * Drude relaxation time, seconds: the mean interval between scattering events.
 *
 *   tau = m / (n e^2 rho)
 *
 * For copper this comes out around 25 femtoseconds. In that time an electron
 * moving at the Fermi velocity covers about 39 nm, roughly a hundred atomic
 * spacings, so it flies past a hundred ions before anything deflects it. A
 * perfect, stationary lattice would not scatter it at all; what actually
 * scatters electrons is the lattice being imperfect, mostly thermal vibration.
 */
export function relaxationTime(material: ConductionMaterial, temperatureK: number): number {
  const n = carrierDensity(material, temperatureK);
  const rho = resistivityAt(material, temperatureK);
  if (n <= 0 || !Number.isFinite(rho) || rho <= 0) return 0;
  return ELECTRON_MASS_KG / (n * ELEMENTARY_CHARGE_C * ELEMENTARY_CHARGE_C * rho);
}

/** Mean free path, metres: how far an electron travels between collisions. */
export function meanFreePath(material: ConductionMaterial, temperatureK: number): number {
  const v = fermiVelocity(material);
  if (v <= 0) return 0;
  return v * relaxationTime(material, temperatureK);
}

/** Carrier mobility, m^2 per volt second. */
export function mobility(material: ConductionMaterial, temperatureK: number): number {
  const tau = relaxationTime(material, temperatureK);
  return (ELEMENTARY_CHARGE_C * tau) / ELECTRON_MASS_KG;
}

/**
 * Drift velocity, m/s, for a given applied field.
 *
 * v_d = mu * E = e tau E / m
 *
 * For copper in a typical circuit this is a fraction of a millimetre per
 * second. Compare it with fermiVelocity(): the ratio is around 1e-10.
 */
export function driftVelocity(
  material: ConductionMaterial,
  fieldVoltsPerMetre: number,
  temperatureK: number,
): number {
  return mobility(material, temperatureK) * fieldVoltsPerMetre;
}

/** Current density, A/m^2, for a given field. */
export function currentDensity(
  material: ConductionMaterial,
  fieldVoltsPerMetre: number,
  temperatureK: number,
): number {
  return conductivityAt(material, temperatureK) * fieldVoltsPerMetre;
}

/**
 * Field needed to drive a given current density. Useful for setting up a
 * realistic scenario: a household cable runs at a few A/mm^2, which is a few
 * times 1e6 A/m^2.
 */
export function fieldForCurrentDensity(
  material: ConductionMaterial,
  currentDensityAm2: number,
  temperatureK: number,
): number {
  const sigma = conductivityAt(material, temperatureK);
  return sigma > 0 ? currentDensityAm2 / sigma : 0;
}

/** How long an electron takes to drift one metre, in seconds. */
export function timeToDriftOneMetre(
  material: ConductionMaterial,
  fieldVoltsPerMetre: number,
  temperatureK: number,
): number {
  const v = driftVelocity(material, fieldVoltsPerMetre, temperatureK);
  return v > 0 ? 1 / v : Infinity;
}

/**
 * Whether the Drude picture is still meaningful at a given field.
 *
 * Two ways it breaks, and both are easy to walk into. Asking for a household
 * current density through intrinsic silicon demands a field of ~2e9 V/m, which
 * is about seventy times silicon's breakdown strength, and predicts a drift
 * velocity faster than light. The model does not warn you; it just returns a
 * number. So the caller has to check.
 */
export interface ModelValidity {
  ok: boolean;
  /** Field exceeds the material's dielectric breakdown strength. */
  exceedsBreakdown: boolean;
  /** Predicted drift is a sizeable fraction of light speed, which is nonsense. */
  relativisticDrift: boolean;
  /**
   * Drift exceeds the carriers' own random speed, meaning the "small bias on
   * random motion" approximation the whole model rests on has failed.
   */
  exceedsCarrierSpeed: boolean;
  message: string | null;
}

export function checkValidity(
  material: ConductionMaterial,
  fieldVoltsPerMetre: number,
  temperatureK: number,
): ModelValidity {
  const vd = Math.abs(driftVelocity(material, fieldVoltsPerMetre, temperatureK));
  const vc = characteristicSpeed(material, temperatureK);

  const exceedsBreakdown =
    material.breakdownFieldVPerM > 0 && fieldVoltsPerMetre > material.breakdownFieldVPerM;
  const relativisticDrift = vd > 0.01 * SPEED_OF_LIGHT_M_S;
  const exceedsCarrierSpeed = vc > 0 && vd > vc;

  let message: string | null = null;
  if (relativisticDrift) {
    message =
      'The model predicts a drift velocity near or above the speed of light, which is nonsense. Drude assumes a small bias on random motion, and that assumption has broken down completely.';
  } else if (exceedsBreakdown) {
    message = `This field exceeds ${material.name}'s dielectric breakdown strength (${(material.breakdownFieldVPerM / 1e6).toFixed(0)} MV/m). A real sample would arc rather than conduct.`;
  } else if (exceedsCarrierSpeed) {
    message =
      'Drift now exceeds the carriers’ own random speed, so this is no longer a small perturbation. Real carriers would saturate instead.';
  }

  return {
    ok: message === null,
    exceedsBreakdown,
    relativisticDrift,
    exceedsCarrierSpeed,
    message,
  };
}

export function materialBySymbol(symbol: string): ConductionMaterial {
  const m = CONDUCTION_MATERIALS.find((x) => x.symbol === symbol);
  if (!m) throw new Error(`no conduction material "${symbol}"`);
  return m;
}
