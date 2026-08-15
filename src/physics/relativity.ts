/**
 * Relativistic effects in heavy atoms.
 *
 * THE CORE FACT: a 1s electron's speed scales with nuclear charge. In hydrogen
 * it moves at about 1/137 of light speed. In gold, at 58%. In oganesson, at 86%.
 * At those speeds the electron's relativistic mass rises sharply, and since the
 * Bohr radius goes as 1/m, the orbital contracts.
 *
 * This is not a footnote. It is why:
 *
 *  - GOLD IS YELLOW. Contraction pulls the 6s level down, narrowing the 5d-to-6s
 *    gap until it absorbs blue light instead of ultraviolet. The reflected light
 *    is missing its blue, so gold looks yellow. Silver, one row up and barely
 *    relativistic, keeps the gap in the UV and stays white.
 *  - MERCURY IS LIQUID. Its 6s pair is contracted and tightly held, so mercury
 *    atoms barely bond to each other. It melts at -39 C, while cadmium directly
 *    above it melts at 321 C.
 *  - LEAD-ACID BATTERIES WORK. Most of a car battery's cell voltage comes from
 *    relativistic stabilisation of lead's 6s electrons.
 *  - LAWRENCIUM BREAKS THE PATTERN. Lr is 7s2 7p1, not 6d1, because relativity
 *    reorders the levels.
 *
 * WHAT THIS MODULE DOES AND DOES NOT DO. It computes the DIRECT effect exactly:
 * given an orbital's speed, the Lorentz factor and the resulting contraction
 * follow immediately. That is well defined and it dominates for inner s shells.
 *
 * It does NOT capture the INDIRECT effect, which needs a self-consistent
 * relativistic calculation. In a real heavy atom the contracted inner s shells
 * screen the nucleus better, so d and f orbitals EXPAND, and the valence s
 * contraction is largely inherited from the core through orthogonality rather
 * than generated locally. An independent-orbital model cannot produce that. So
 * the contraction applied here is honest about being first-order and scalar:
 * it is a Schrodinger atom with a relativistic mass correction, not a Dirac atom.
 */

import { ELECTRON_MASS_KG, SPEED_OF_LIGHT_M_S } from './constants';

/** Fine structure constant, CODATA 2018. */
export const FINE_STRUCTURE_CONSTANT = 7.2973525693e-3;

/** 1 / alpha, the number that decides where relativity starts to bite. */
export const INVERSE_FINE_STRUCTURE = 1 / FINE_STRUCTURE_CONSTANT; // 137.036

/**
 * Orbital speed as a fraction of light speed, from the Bohr result v = Z alpha c / n.
 *
 * Clamped just below 1: past Z alpha = 1 (around Z = 137, the "critical charge")
 * this non-relativistic expression stops meaning anything, and a proper
 * treatment needs quantum electrodynamics in a strong field. No known element
 * reaches it, but the clamp keeps the maths finite regardless.
 */
export function orbitalSpeedFraction(zEff: number, n: number): number {
  const v = (zEff * FINE_STRUCTURE_CONSTANT) / n;
  return Math.min(v, 0.999999);
}

/** Lorentz factor gamma = 1 / sqrt(1 - (v/c)^2). */
export function lorentzFactor(speedFraction: number): number {
  return 1 / Math.sqrt(1 - speedFraction * speedFraction);
}

/**
 * Radial contraction factor for an orbital, in (0, 1].
 *
 * The orbital radius scales as 1/mass, and the relativistic mass is gamma times
 * the rest mass, so the radius shrinks by 1/gamma. Gold's 1s comes out at about
 * 82% of its non-relativistic size.
 */
export function radialContraction(zEff: number, n: number): number {
  return 1 / lorentzFactor(orbitalSpeedFraction(zEff, n));
}

/**
 * Effective charge adjusted for the relativistic mass increase.
 *
 * The radial function depends on r only through rho = 2 Z_eff r / n, so
 * shrinking every radius by 1/gamma is exactly equivalent to scaling Z_eff up
 * by gamma. That means the correction can be applied without touching the
 * wavefunction code at all.
 */
export function relativisticZeff(zEff: number, n: number): number {
  return zEff * lorentzFactor(orbitalSpeedFraction(zEff, n));
}

/** Relativistic mass of an electron at this speed, kg. */
export function relativisticMass(speedFraction: number): number {
  return ELECTRON_MASS_KG * lorentzFactor(speedFraction);
}

/** Orbital speed in metres per second. */
export function orbitalSpeedMs(zEff: number, n: number): number {
  return orbitalSpeedFraction(zEff, n) * SPEED_OF_LIGHT_M_S;
}

export interface RelativisticSummary {
  /** Speed of the innermost (1s) electron as a fraction of c. */
  innerSpeedFraction: number;
  innerSpeedMs: number;
  lorentzFactor: number;
  /** 1s radius as a fraction of its non-relativistic value. */
  innerContraction: number;
  /** Percentage mass increase of the 1s electron. */
  massIncreasePercent: number;
  /** True once the effect is large enough to change observable chemistry. */
  chemicallySignificant: boolean;
}

/**
 * Relativistic summary for an element, based on its 1s electron.
 *
 * The 1s effective charge is Z - 0.30 by Slater's rules (the only other 1s
 * electron screens by 0.30), which is very nearly the bare nuclear charge.
 */
export function relativisticSummary(z: number): RelativisticSummary {
  const zEff1s = Math.max(z - 0.3, 1);
  const speedFraction = orbitalSpeedFraction(zEff1s, 1);
  const gamma = lorentzFactor(speedFraction);

  return {
    innerSpeedFraction: speedFraction,
    innerSpeedMs: speedFraction * SPEED_OF_LIGHT_M_S,
    lorentzFactor: gamma,
    innerContraction: 1 / gamma,
    massIncreasePercent: (gamma - 1) * 100,
    // Around Z = 50 the mass increase passes ~7%, which is where relativistic
    // shifts start showing up in measurable chemistry.
    chemicallySignificant: z >= 50,
  };
}

/** Elements whose everyday behaviour is visibly relativistic. */
export const RELATIVISTIC_NOTES: Record<number, string> = {
  47: 'Silver sits one row above gold and is only mildly relativistic, so its 4d-to-5s gap stays in the ultraviolet and the metal reflects all visible light evenly. That is why silver is white and gold is not.',
  79: 'Gold is yellow because of this. Contraction lowers the 6s level until the 5d-to-6s gap absorbs blue light rather than ultraviolet, so the reflected light is missing its blue.',
  80: 'Mercury is liquid at room temperature because of this. Its contracted 6s pair is held so tightly that mercury atoms barely bond to one another. Cadmium, directly above it and far less relativistic, melts at 321 C.',
  82: 'Lead-acid car batteries owe most of their cell voltage to relativistic stabilisation of lead 6s electrons. A non-relativistic universe would give roughly 1.7 V per cell instead of 2.1 V.',
  103: 'Lawrencium is 7s2 7p1 rather than 6d1: relativity reorders the levels enough to break the filling pattern outright.',
  118: 'Oganesson is predicted to be so relativistic that its electron shells blur toward a uniform gas, and it may not be a noble gas in the usual sense at all.',
};
