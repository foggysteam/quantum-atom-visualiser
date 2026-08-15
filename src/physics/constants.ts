/**
 * Physical constants and unit conventions.
 *
 * Internally the whole physics layer works in ATOMIC UNITS: lengths are in Bohr
 * radii (a0 = 1), energies in Hartree. This is not a stylistic choice, it is what
 * makes the hydrogenic wavefunctions numerically well conditioned. In SI units
 * the radial exponent would be exp(-r / 5.29e-11) and single-precision floats on
 * the GPU would collapse immediately.
 *
 * Conversion to physical units happens only at the display boundary (scale bars,
 * readouts), never inside the wavefunction maths.
 *
 * Values are CODATA 2018.
 */

/** Bohr radius in metres. The natural length unit of the atom. */
export const BOHR_RADIUS_M = 5.29177210903e-11;

/** 1 Bohr radius expressed in picometres (1 pm = 1e-12 m). */
export const BOHR_IN_PM = BOHR_RADIUS_M * 1e12; // 52.917721...

/** 1 Bohr radius expressed in angstroms (1 A = 1e-10 m). */
export const BOHR_IN_ANGSTROM = BOHR_RADIUS_M * 1e10; // 0.529177...

/** 1 Bohr radius expressed in femtometres (1 fm = 1e-15 m). */
export const BOHR_IN_FM = BOHR_RADIUS_M * 1e15; // 52917.72...

/** Hartree energy in electronvolts. */
export const HARTREE_IN_EV = 27.211386245988;

/* ---- SI constants, used by the conduction model ---- */

/** Electron rest mass, kg. */
export const ELECTRON_MASS_KG = 9.1093837015e-31;

/** Elementary charge, C. */
export const ELEMENTARY_CHARGE_C = 1.602176634e-19;

/** Boltzmann constant, J/K. */
export const BOLTZMANN_J_PER_K = 1.380649e-23;

/** One electronvolt in joules. */
export const EV_IN_JOULES = 1.602176634e-19;

/** Speed of light in vacuum, m/s. */
export const SPEED_OF_LIGHT_M_S = 299792458;

/** Standard reference temperature for resistivity data, K (20 degrees C). */
export const REFERENCE_TEMPERATURE_K = 293.15;

/**
 * Nuclear radius coefficient r0 in the empirical relation R = r0 * A^(1/3).
 * 1.25 fm is the standard value fitted to electron-scattering charge radii.
 */
export const NUCLEAR_R0_FM = 1.25;

/** Proton root-mean-square charge radius in fm (CODATA 2018). */
export const PROTON_CHARGE_RADIUS_FM = 0.8414;

/**
 * Effective hard-sphere radius used when drawing nucleons, in fm. Slightly under
 * the ~0.84 fm charge radius so that packed nucleons touch rather than overlap.
 * Nucleons are not hard spheres at all; see nucleus.ts for the honest caveat.
 */
export const NUCLEON_DRAW_RADIUS_FM = 0.85;

/**
 * The single most misrepresented number in all of atomic imagery.
 *
 * A hydrogen atom is roughly 1 Bohr radius across (~53000 fm to the 1s maximum,
 * and the density extends far beyond that). Its nucleus is a single proton,
 * about 1.7 fm across. Essentially every picture ever drawn of an atom inflates
 * the nucleus by four to five orders of magnitude.
 */
export const HYDROGEN_NUCLEUS_TO_ATOM_RATIO = (2 * PROTON_CHARGE_RADIUS_FM) / BOHR_IN_FM;

/** Convert a length in Bohr radii to picometres. */
export function bohrToPm(rBohr: number): number {
  return rBohr * BOHR_IN_PM;
}

/** Convert a length in Bohr radii to femtometres. */
export function bohrToFm(rBohr: number): number {
  return rBohr * BOHR_IN_FM;
}

/** Convert a length in picometres to Bohr radii. */
export function pmToBohr(rPm: number): number {
  return rPm / BOHR_IN_PM;
}

/** Convert a length in femtometres to Bohr radii. */
export function fmToBohr(rFm: number): number {
  return rFm / BOHR_IN_FM;
}

/** Orbital angular momentum letter codes, indexed by l. */
export const SUBSHELL_LETTERS = ['s', 'p', 'd', 'f', 'g', 'h'] as const;

/** Human label for a subshell, e.g. (3, 2) -> "3d". */
export function subshellLabel(n: number, l: number): string {
  return `${n}${SUBSHELL_LETTERS[l] ?? `l=${l}`}`;
}
