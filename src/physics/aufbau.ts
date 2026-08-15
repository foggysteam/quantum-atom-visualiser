/**
 * Ground-state electron configurations.
 *
 * The Madelung (n+l) rule fills subshells in order of increasing n+l, breaking
 * ties toward the lower n. It is a remarkably good rule that is nonetheless
 * WRONG for 20 elements, because once orbital energies get close the actual
 * ground state is decided by exchange energy and d-subshell stabilisation, not
 * by a counting rule.
 *
 * Those exceptions are not trivia here. Copper is the headline case: Madelung
 * predicts [Ar] 3d9 4s2, but the real configuration is [Ar] 3d10 4s1. That lone,
 * loosely bound 4s electron sitting outside a closed d shell is precisely why
 * copper is one of the best conductors known. Get this table wrong and the
 * Phase 2 conduction model is built on a false premise.
 */

import { SUBSHELL_LETTERS } from './constants';

export interface Subshell {
  n: number;
  l: number;
  /** Number of electrons occupying this subshell (max 2(2l+1)). */
  electrons: number;
}

/** Maximum electrons in a subshell of angular momentum l: 2(2l+1). */
export function subshellCapacity(l: number): number {
  return 2 * (2 * l + 1);
}

/**
 * Subshells in Madelung filling order, generated up to principal number nMax.
 * Sorted by (n + l) ascending, ties broken by n ascending.
 */
export function madelungOrder(nMax = 8): Array<{ n: number; l: number }> {
  const shells: Array<{ n: number; l: number }> = [];
  for (let n = 1; n <= nMax; n++) {
    for (let l = 0; l < n; l++) {
      // Beyond l = 3 (g orbitals) nothing is occupied in any known ground state.
      if (l <= 3) shells.push({ n, l });
    }
  }
  shells.sort((a, b) => a.n + a.l - (b.n + b.l) || a.n - b.n);
  return shells;
}

const NOBLE_CORES: Record<string, string> = {
  He: '1s2',
  Ne: '[He] 2s2 2p6',
  Ar: '[Ne] 3s2 3p6',
  Kr: '[Ar] 3d10 4s2 4p6',
  Xe: '[Kr] 4d10 5s2 5p6',
  Rn: '[Xe] 4f14 5d10 6s2 6p6',
};

/**
 * Experimentally determined ground-state configurations that violate Madelung.
 * Source: NIST Atomic Spectra Database ground levels.
 */
const ANOMALIES: Record<number, string> = {
  24: '[Ar] 3d5 4s1', // Cr  - half-filled d shell wins
  29: '[Ar] 3d10 4s1', // Cu  - filled d shell wins; the reason copper conducts
  41: '[Kr] 4d4 5s1', // Nb
  42: '[Kr] 4d5 5s1', // Mo
  44: '[Kr] 4d7 5s1', // Ru
  45: '[Kr] 4d8 5s1', // Rh
  46: '[Kr] 4d10', // Pd  - the only element with an empty outer s subshell
  47: '[Kr] 4d10 5s1', // Ag
  57: '[Xe] 5d1 6s2', // La  - starts d before f
  58: '[Xe] 4f1 5d1 6s2', // Ce
  64: '[Xe] 4f7 5d1 6s2', // Gd  - half-filled f shell
  78: '[Xe] 4f14 5d9 6s1', // Pt
  79: '[Xe] 4f14 5d10 6s1', // Au
  89: '[Rn] 6d1 7s2', // Ac
  90: '[Rn] 6d2 7s2', // Th
  91: '[Rn] 5f2 6d1 7s2', // Pa
  92: '[Rn] 5f3 6d1 7s2', // U
  93: '[Rn] 5f4 6d1 7s2', // Np
  96: '[Rn] 5f7 6d1 7s2', // Cm  - half-filled f shell
  103: '[Rn] 5f14 7s2 7p1', // Lr  - relativistic; 7p beats 6d
};

/**
 * Parse a configuration string such as "[Ar] 3d10 4s1" into subshells.
 * Noble-gas cores are expanded recursively.
 */
export function parseConfiguration(config: string): Subshell[] {
  const result = new Map<string, Subshell>();

  const add = (n: number, l: number, electrons: number) => {
    const key = `${n},${l}`;
    const existing = result.get(key);
    if (existing) existing.electrons += electrons;
    else result.set(key, { n, l, electrons });
  };

  const walk = (text: string) => {
    const tokens = text.match(/\[[A-Za-z]+\]|[0-9]+[spdfgh][0-9]+/g) ?? [];
    for (const token of tokens) {
      if (token.startsWith('[')) {
        const core = token.slice(1, -1);
        const expansion = NOBLE_CORES[core];
        if (!expansion) throw new Error(`unknown noble-gas core "${core}"`);
        walk(expansion);
      } else {
        const m = /^([0-9]+)([spdfgh])([0-9]+)$/.exec(token)!;
        const n = Number(m[1]);
        const l = SUBSHELL_LETTERS.indexOf(m[2] as (typeof SUBSHELL_LETTERS)[number]);
        add(n, l, Number(m[3]));
      }
    }
  };

  walk(config);

  return [...result.values()].sort((a, b) => a.n - b.n || a.l - b.l);
}

/**
 * Ground-state electron configuration for atomic number z, as occupied
 * subshells sorted by n then l. Uses the experimental table where the Madelung
 * rule is known to fail.
 */
export function electronConfiguration(z: number): Subshell[] {
  if (!Number.isInteger(z) || z < 1 || z > 118) {
    throw new Error(`atomic number must be an integer in 1..118, got ${z}`);
  }

  const anomaly = ANOMALIES[z];
  if (anomaly) {
    const parsed = parseConfiguration(anomaly);
    const total = parsed.reduce((sum, s) => sum + s.electrons, 0);
    if (total !== z) {
      throw new Error(`anomaly table for Z=${z} has ${total} electrons, expected ${z}`);
    }
    return parsed;
  }

  const shells: Subshell[] = [];
  let remaining = z;
  for (const { n, l } of madelungOrder()) {
    if (remaining <= 0) break;
    const electrons = Math.min(remaining, subshellCapacity(l));
    shells.push({ n, l, electrons });
    remaining -= electrons;
  }
  if (remaining > 0) throw new Error(`ran out of subshells filling Z=${z}`);

  return shells.sort((a, b) => a.n - b.n || a.l - b.l);
}

/** True if this element's configuration deviates from the Madelung rule. */
export function isMadelungAnomaly(z: number): boolean {
  return z in ANOMALIES;
}

/** Render a configuration as a string like "1s2 2s2 2p6 3s2 3p6 3d10 4s1". */
export function formatConfiguration(shells: Subshell[]): string {
  return shells.map((s) => `${s.n}${SUBSHELL_LETTERS[s.l]}${s.electrons}`).join(' ');
}

/**
 * Valence electrons: those in the highest occupied principal shell, plus any
 * partially filled d or f subshell below it. These are the electrons that do
 * chemistry and, in a metal, the ones that delocalise.
 */
export function valenceElectrons(shells: Subshell[]): Subshell[] {
  const maxN = Math.max(...shells.map((s) => s.n));
  return shells.filter(
    (s) => s.n === maxN || (s.l >= 2 && s.electrons < subshellCapacity(s.l)),
  );
}
