/**
 * Element reference data for all 118 elements.
 *
 * Columns: Z, symbol, name, mass number A of the most abundant (or, for
 * elements with no stable isotope, the longest-lived / best-characterised)
 * nuclide, standard atomic weight, covalent radius, van der Waals radius,
 * first ionisation energy, category.
 *
 * The A column is what sets the NEUTRON COUNT in the nucleus view, so it is a
 * specific nuclide, not a rounded atomic weight. Chlorine is the clearest case:
 * its atomic weight is 35.45 because natural chlorine is a mix of Cl-35 and
 * Cl-37, but no single chlorine nucleus has 18.45 neutrons. We draw Cl-35.
 *
 * Radii are in picometres; a null means no reliable measured value exists,
 * which is the honest state of affairs for most superheavy elements. Ionisation
 * energies are in electronvolts; values for Z > 104 are calculated, not
 * measured.
 */

export type ElementCategory =
  | 'nonmetal'
  | 'noble'
  | 'alkali'
  | 'alkaline'
  | 'metalloid'
  | 'halogen'
  | 'transition'
  | 'post-transition'
  | 'lanthanide'
  | 'actinide'
  | 'unknown';

export interface Element {
  z: number;
  symbol: string;
  name: string;
  /** Mass number of the represented nuclide. Neutron count is A - Z. */
  massNumber: number;
  /** Standard atomic weight (u). */
  atomicWeight: number;
  /** Covalent radius in pm, or null if unknown. */
  covalentRadiusPm: number | null;
  /** Van der Waals radius in pm, or null if unknown. */
  vdwRadiusPm: number | null;
  /** First ionisation energy in eV, or null if unknown. */
  ionisationEnergyEv: number | null;
  category: ElementCategory;
}

type Row = [
  number, string, string, number, number,
  number | null, number | null, number | null, ElementCategory,
];

const ROWS: Row[] = [
  [1, 'H', 'Hydrogen', 1, 1.008, 31, 120, 13.598, 'nonmetal'],
  [2, 'He', 'Helium', 4, 4.0026, 28, 140, 24.587, 'noble'],
  [3, 'Li', 'Lithium', 7, 6.94, 128, 182, 5.392, 'alkali'],
  [4, 'Be', 'Beryllium', 9, 9.0122, 96, 153, 9.323, 'alkaline'],
  [5, 'B', 'Boron', 11, 10.81, 84, 192, 8.298, 'metalloid'],
  [6, 'C', 'Carbon', 12, 12.011, 76, 170, 11.26, 'nonmetal'],
  [7, 'N', 'Nitrogen', 14, 14.007, 71, 155, 14.534, 'nonmetal'],
  [8, 'O', 'Oxygen', 16, 15.999, 66, 152, 13.618, 'nonmetal'],
  [9, 'F', 'Fluorine', 19, 18.998, 57, 147, 17.423, 'halogen'],
  [10, 'Ne', 'Neon', 20, 20.18, 58, 154, 21.565, 'noble'],
  [11, 'Na', 'Sodium', 23, 22.99, 166, 227, 5.139, 'alkali'],
  [12, 'Mg', 'Magnesium', 24, 24.305, 141, 173, 7.646, 'alkaline'],
  [13, 'Al', 'Aluminium', 27, 26.982, 121, 184, 5.986, 'post-transition'],
  [14, 'Si', 'Silicon', 28, 28.085, 111, 210, 8.152, 'metalloid'],
  [15, 'P', 'Phosphorus', 31, 30.974, 107, 180, 10.487, 'nonmetal'],
  [16, 'S', 'Sulfur', 32, 32.06, 105, 180, 10.36, 'nonmetal'],
  [17, 'Cl', 'Chlorine', 35, 35.45, 102, 175, 12.968, 'halogen'],
  [18, 'Ar', 'Argon', 40, 39.948, 106, 188, 15.76, 'noble'],
  [19, 'K', 'Potassium', 39, 39.098, 203, 275, 4.341, 'alkali'],
  [20, 'Ca', 'Calcium', 40, 40.078, 176, 231, 6.113, 'alkaline'],
  [21, 'Sc', 'Scandium', 45, 44.956, 170, 211, 6.561, 'transition'],
  [22, 'Ti', 'Titanium', 48, 47.867, 160, null, 6.828, 'transition'],
  [23, 'V', 'Vanadium', 51, 50.942, 153, null, 6.746, 'transition'],
  [24, 'Cr', 'Chromium', 52, 51.996, 139, null, 6.767, 'transition'],
  [25, 'Mn', 'Manganese', 55, 54.938, 139, null, 7.434, 'transition'],
  [26, 'Fe', 'Iron', 56, 55.845, 132, null, 7.902, 'transition'],
  [27, 'Co', 'Cobalt', 59, 58.933, 126, null, 7.881, 'transition'],
  [28, 'Ni', 'Nickel', 58, 58.693, 124, 163, 7.64, 'transition'],
  [29, 'Cu', 'Copper', 63, 63.546, 132, 140, 7.726, 'transition'],
  [30, 'Zn', 'Zinc', 64, 65.38, 122, 139, 9.394, 'transition'],
  [31, 'Ga', 'Gallium', 69, 69.723, 122, 187, 5.999, 'post-transition'],
  [32, 'Ge', 'Germanium', 74, 72.63, 120, 211, 7.9, 'metalloid'],
  [33, 'As', 'Arsenic', 75, 74.922, 119, 185, 9.815, 'metalloid'],
  [34, 'Se', 'Selenium', 80, 78.971, 120, 190, 9.752, 'nonmetal'],
  [35, 'Br', 'Bromine', 79, 79.904, 120, 185, 11.814, 'halogen'],
  [36, 'Kr', 'Krypton', 84, 83.798, 116, 202, 14.0, 'noble'],
  [37, 'Rb', 'Rubidium', 85, 85.468, 220, 303, 4.177, 'alkali'],
  [38, 'Sr', 'Strontium', 88, 87.62, 195, 249, 5.695, 'alkaline'],
  [39, 'Y', 'Yttrium', 89, 88.906, 190, null, 6.217, 'transition'],
  [40, 'Zr', 'Zirconium', 90, 91.224, 175, null, 6.634, 'transition'],
  [41, 'Nb', 'Niobium', 93, 92.906, 164, null, 6.759, 'transition'],
  [42, 'Mo', 'Molybdenum', 98, 95.95, 154, null, 7.092, 'transition'],
  [43, 'Tc', 'Technetium', 98, 98, 147, null, 7.28, 'transition'],
  [44, 'Ru', 'Ruthenium', 102, 101.07, 146, null, 7.361, 'transition'],
  [45, 'Rh', 'Rhodium', 103, 102.91, 142, null, 7.459, 'transition'],
  [46, 'Pd', 'Palladium', 106, 106.42, 139, 163, 8.337, 'transition'],
  [47, 'Ag', 'Silver', 107, 107.87, 145, 172, 7.576, 'transition'],
  [48, 'Cd', 'Cadmium', 114, 112.41, 144, 158, 8.994, 'transition'],
  [49, 'In', 'Indium', 115, 114.82, 142, 193, 5.786, 'post-transition'],
  [50, 'Sn', 'Tin', 120, 118.71, 139, 217, 7.344, 'post-transition'],
  [51, 'Sb', 'Antimony', 121, 121.76, 139, 206, 8.608, 'metalloid'],
  [52, 'Te', 'Tellurium', 130, 127.6, 138, 206, 9.01, 'metalloid'],
  [53, 'I', 'Iodine', 127, 126.9, 139, 198, 10.451, 'halogen'],
  [54, 'Xe', 'Xenon', 132, 131.29, 140, 216, 12.13, 'noble'],
  [55, 'Cs', 'Caesium', 133, 132.91, 244, 343, 3.894, 'alkali'],
  [56, 'Ba', 'Barium', 138, 137.33, 215, 268, 5.212, 'alkaline'],
  [57, 'La', 'Lanthanum', 139, 138.91, 207, null, 5.577, 'lanthanide'],
  [58, 'Ce', 'Cerium', 140, 140.12, 204, null, 5.539, 'lanthanide'],
  [59, 'Pr', 'Praseodymium', 141, 140.91, 203, null, 5.473, 'lanthanide'],
  [60, 'Nd', 'Neodymium', 142, 144.24, 201, null, 5.525, 'lanthanide'],
  [61, 'Pm', 'Promethium', 145, 145, 199, null, 5.582, 'lanthanide'],
  [62, 'Sm', 'Samarium', 152, 150.36, 198, null, 5.644, 'lanthanide'],
  [63, 'Eu', 'Europium', 153, 151.96, 198, null, 5.67, 'lanthanide'],
  [64, 'Gd', 'Gadolinium', 158, 157.25, 196, null, 6.15, 'lanthanide'],
  [65, 'Tb', 'Terbium', 159, 158.93, 194, null, 5.864, 'lanthanide'],
  [66, 'Dy', 'Dysprosium', 164, 162.5, 192, null, 5.939, 'lanthanide'],
  [67, 'Ho', 'Holmium', 165, 164.93, 192, null, 6.022, 'lanthanide'],
  [68, 'Er', 'Erbium', 166, 167.26, 189, null, 6.108, 'lanthanide'],
  [69, 'Tm', 'Thulium', 169, 168.93, 190, null, 6.184, 'lanthanide'],
  [70, 'Yb', 'Ytterbium', 174, 173.05, 187, null, 6.254, 'lanthanide'],
  [71, 'Lu', 'Lutetium', 175, 174.97, 187, null, 5.426, 'lanthanide'],
  [72, 'Hf', 'Hafnium', 180, 178.49, 175, null, 6.825, 'transition'],
  [73, 'Ta', 'Tantalum', 181, 180.95, 170, null, 7.55, 'transition'],
  [74, 'W', 'Tungsten', 184, 183.84, 162, null, 7.864, 'transition'],
  [75, 'Re', 'Rhenium', 187, 186.21, 151, null, 7.834, 'transition'],
  [76, 'Os', 'Osmium', 192, 190.23, 144, null, 8.438, 'transition'],
  [77, 'Ir', 'Iridium', 193, 192.22, 141, null, 8.967, 'transition'],
  [78, 'Pt', 'Platinum', 195, 195.08, 136, 175, 8.959, 'transition'],
  [79, 'Au', 'Gold', 197, 196.97, 136, 166, 9.226, 'transition'],
  [80, 'Hg', 'Mercury', 202, 200.59, 132, 155, 10.438, 'transition'],
  [81, 'Tl', 'Thallium', 205, 204.38, 145, 196, 6.108, 'post-transition'],
  [82, 'Pb', 'Lead', 208, 207.2, 146, 202, 7.417, 'post-transition'],
  [83, 'Bi', 'Bismuth', 209, 208.98, 148, 207, 7.286, 'post-transition'],
  [84, 'Po', 'Polonium', 209, 209, 140, 197, 8.417, 'post-transition'],
  [85, 'At', 'Astatine', 210, 210, 150, 202, 9.32, 'halogen'],
  [86, 'Rn', 'Radon', 222, 222, 150, 220, 10.749, 'noble'],
  [87, 'Fr', 'Francium', 223, 223, 260, 348, 4.073, 'alkali'],
  [88, 'Ra', 'Radium', 226, 226, 221, 283, 5.279, 'alkaline'],
  [89, 'Ac', 'Actinium', 227, 227, 215, null, 5.38, 'actinide'],
  [90, 'Th', 'Thorium', 232, 232.04, 206, null, 6.307, 'actinide'],
  [91, 'Pa', 'Protactinium', 231, 231.04, 200, null, 5.89, 'actinide'],
  [92, 'U', 'Uranium', 238, 238.03, 196, 186, 6.194, 'actinide'],
  [93, 'Np', 'Neptunium', 237, 237, 190, null, 6.266, 'actinide'],
  [94, 'Pu', 'Plutonium', 244, 244, 187, null, 6.026, 'actinide'],
  [95, 'Am', 'Americium', 243, 243, 180, null, 5.974, 'actinide'],
  [96, 'Cm', 'Curium', 247, 247, 169, null, 5.991, 'actinide'],
  [97, 'Bk', 'Berkelium', 247, 247, null, null, 6.198, 'actinide'],
  [98, 'Cf', 'Californium', 251, 251, null, null, 6.282, 'actinide'],
  [99, 'Es', 'Einsteinium', 252, 252, null, null, 6.42, 'actinide'],
  [100, 'Fm', 'Fermium', 257, 257, null, null, 6.5, 'actinide'],
  [101, 'Md', 'Mendelevium', 258, 258, null, null, 6.58, 'actinide'],
  [102, 'No', 'Nobelium', 259, 259, null, null, 6.65, 'actinide'],
  [103, 'Lr', 'Lawrencium', 266, 266, null, null, 4.96, 'actinide'],
  [104, 'Rf', 'Rutherfordium', 267, 267, null, null, 6.02, 'transition'],
  [105, 'Db', 'Dubnium', 268, 268, null, null, 6.8, 'transition'],
  [106, 'Sg', 'Seaborgium', 269, 269, null, null, 7.8, 'transition'],
  [107, 'Bh', 'Bohrium', 270, 270, null, null, 7.7, 'transition'],
  [108, 'Hs', 'Hassium', 269, 269, null, null, 7.6, 'transition'],
  [109, 'Mt', 'Meitnerium', 278, 278, null, null, 5.8, 'unknown'],
  [110, 'Ds', 'Darmstadtium', 281, 281, null, null, 9.6, 'unknown'],
  [111, 'Rg', 'Roentgenium', 282, 282, null, null, 10.6, 'unknown'],
  [112, 'Cn', 'Copernicium', 285, 285, null, null, 11.97, 'unknown'],
  [113, 'Nh', 'Nihonium', 286, 286, null, null, 7.31, 'unknown'],
  [114, 'Fl', 'Flerovium', 289, 289, null, null, 8.54, 'unknown'],
  [115, 'Mc', 'Moscovium', 290, 290, null, null, 5.58, 'unknown'],
  [116, 'Lv', 'Livermorium', 293, 293, null, null, 6.9, 'unknown'],
  [117, 'Ts', 'Tennessine', 294, 294, null, null, 7.7, 'unknown'],
  [118, 'Og', 'Oganesson', 294, 294, null, null, 8.9, 'unknown'],
];

export const ELEMENTS: Element[] = ROWS.map(
  ([z, symbol, name, massNumber, atomicWeight, covalentRadiusPm, vdwRadiusPm, ionisationEnergyEv, category]) => ({
    z,
    symbol,
    name,
    massNumber,
    atomicWeight,
    covalentRadiusPm,
    vdwRadiusPm,
    ionisationEnergyEv,
    category,
  }),
);

const BY_Z = new Map(ELEMENTS.map((e) => [e.z, e]));
const BY_SYMBOL = new Map(ELEMENTS.map((e) => [e.symbol.toLowerCase(), e]));

export function elementByZ(z: number): Element {
  const e = BY_Z.get(z);
  if (!e) throw new Error(`no element with atomic number ${z}`);
  return e;
}

export function elementBySymbol(symbol: string): Element {
  const e = BY_SYMBOL.get(symbol.toLowerCase());
  if (!e) throw new Error(`no element with symbol "${symbol}"`);
  return e;
}

/** Neutron count of the represented nuclide. */
export function neutronCount(element: Element): number {
  return element.massNumber - element.z;
}

/** Colour per category, used for the periodic table and accents. */
export const CATEGORY_COLOURS: Record<ElementCategory, string> = {
  nonmetal: '#5ec8f2',
  noble: '#b48ef5',
  alkali: '#f2705e',
  alkaline: '#f2a35e',
  metalloid: '#4fd6b0',
  halogen: '#7ce85f',
  transition: '#f2d05e',
  'post-transition': '#8fa3b8',
  lanthanide: '#f278c0',
  actinide: '#e0619a',
  unknown: '#6b7686',
};

/** True if z is a lanthanide (57-71) or actinide (89-103). */
export function isFBlock(z: number): boolean {
  return (z >= 57 && z <= 71) || (z >= 89 && z <= 103);
}

/**
 * Chemical period (row) and group (column).
 *
 * The f-block elements are all assigned group 3, which is the convention: they
 * share that column in the main table and are conventionally pulled out into
 * their own rows underneath so the table is not fifteen columns wider.
 *
 * For where to actually DRAW an element, use tablePosition, which handles that
 * pull-out. Trying to give the f-block real columns in the main table, as an
 * earlier version of this did, makes lanthanum through lutetium collide with
 * hafnium through radon.
 */
export function periodAndGroup(z: number): { period: number; group: number } {
  const LAYOUT: Record<number, [number, number]> = {};
  const fill = (start: number, end: number, period: number, groupStart: number) => {
    for (let i = start; i <= end; i++) LAYOUT[i] = [period, groupStart + (i - start)];
  };
  LAYOUT[1] = [1, 1];
  LAYOUT[2] = [1, 18];
  fill(3, 4, 2, 1);
  fill(5, 10, 2, 13);
  fill(11, 12, 3, 1);
  fill(13, 18, 3, 13);
  fill(19, 36, 4, 1);
  fill(37, 54, 5, 1);
  fill(55, 56, 6, 1);
  fill(72, 86, 6, 4);
  fill(87, 88, 7, 1);
  fill(104, 118, 7, 4);
  for (let i = 57; i <= 71; i++) LAYOUT[i] = [6, 3];
  for (let i = 89; i <= 103; i++) LAYOUT[i] = [7, 3];

  const entry = LAYOUT[z];
  if (!entry) throw new Error(`no periodic table position for Z=${z}`);
  return { period: entry[0], group: entry[1] };
}

/**
 * Grid position for drawing, in a 10-row layout.
 *
 * Rows 1-7 are the main table. Row 8 is left blank as a visual gap. Rows 9 and
 * 10 hold the lanthanides and actinides, indented to start under group 3 where
 * they belong.
 */
export function tablePosition(z: number): { row: number; col: number; fBlock: boolean } {
  if (z >= 57 && z <= 71) return { row: 9, col: 3 + (z - 57), fBlock: true };
  if (z >= 89 && z <= 103) return { row: 10, col: 3 + (z - 89), fBlock: true };
  const { period, group } = periodAndGroup(z);
  return { row: period, col: group, fBlock: false };
}
