/**
 * Slater's rules for effective nuclear charge.
 *
 * The problem: for any atom with more than one electron, the Schrodinger
 * equation has no closed-form solution, because every electron repels every
 * other one and they all move at once. There is no exact orbital to draw.
 *
 * Slater's approximation (1930): pretend each electron sees a nucleus of
 * reduced charge Z_eff = Z - S, where S accounts for the other electrons
 * screening it from the nucleus. Inner electrons screen almost completely,
 * same-shell electrons screen partially, outer electrons not at all.
 *
 * This is crude, and it is also the reason the render comes out the right size.
 * Using bare Z, a copper atom's 4s orbital would be drawn about 8x too small.
 *
 * Grouping (order matters, "to the left" means lower in this list):
 *   [1s] [2s2p] [3s3p] [3d] [4s4p] [4d] [4f] [5s5p] [5d] [5f] [6s6p] ...
 */

import { electronConfiguration, type Subshell } from './aufbau';

/**
 * Sort key placing a subshell in the Slater group sequence.
 * Within a principal shell: s and p share a group, then d, then f.
 */
function slaterGroupKey(n: number, l: number): number {
  const cls = l <= 1 ? 0 : l - 1; // s,p -> 0; d -> 1; f -> 2
  return n * 10 + cls;
}

/**
 * Screening constant S felt by an electron in subshell (n, l) of the given
 * configuration. The electron itself is excluded from its own screening.
 */
export function screeningConstant(n: number, l: number, shells: Subshell[]): number {
  const ownGroup = slaterGroupKey(n, l);
  let s = 0;

  for (const shell of shells) {
    const group = slaterGroupKey(shell.n, shell.l);

    // Count electrons in this subshell, excluding the one we are looking at.
    const count = group === ownGroup && shell.n === n && shell.l === l
      ? shell.electrons - 1
      : shell.electrons;
    if (count <= 0) continue;

    if (group === ownGroup) {
      // Same group. 1s is the special case: 0.30, not 0.35.
      s += count * (n === 1 ? 0.3 : 0.35);
    } else if (group > ownGroup) {
      // Outer electrons do not screen at all.
      continue;
    } else if (l <= 1) {
      // s or p electron: n-1 shell screens 0.85, deeper shells screen fully.
      if (shell.n === n - 1) s += count * 0.85;
      else if (shell.n <= n - 2) s += count * 1.0;
      // Same n but a lower group (cannot happen: s,p is the lowest group).
    } else {
      // d or f electron: everything to the left screens completely.
      s += count * 1.0;
    }
  }

  return s;
}

const configCache = new Map<number, Subshell[]>();
function configFor(z: number): Subshell[] {
  let c = configCache.get(z);
  if (!c) {
    c = electronConfiguration(z);
    configCache.set(z, c);
  }
  return c;
}

/**
 * Effective nuclear charge felt by an (n, l) electron in a neutral atom of
 * atomic number z. Clamped to a small positive floor so the radial function
 * can never blow up if the rules produce a nonsensical value.
 */
export function effectiveNuclearCharge(n: number, l: number, z: number): number {
  if (z === 1) return 1; // Hydrogen: exact, no screening to approximate.
  const s = screeningConstant(n, l, configFor(z));
  return Math.max(0.3, z - s);
}
