/**
 * Checked against reality: what has actually been measured, and how this
 * render compares.
 *
 * The tool claims to show an atom "as it really is". That claim is only worth
 * anything if it is checkable, so this panel puts the three testable quantities
 * side by side with experiment and grades them honestly. One is exact, one is
 * decent for light elements and poor for heavy ones, and one is bad.
 *
 * It also corrects two things that are very widely misreported, because a panel
 * about experimental evidence that repeated them would be worse than useless.
 */

import { useMemo } from 'react';
import type { Element } from '../physics/elements';
import { buildOrbitals, outerShellRadius, type Orbital } from '../physics/wavefunction';
import { estimatedIonisationEnergyEv } from '../physics/energy';
import { BOHR_IN_PM } from '../physics/constants';

type Grade = 'exact' | 'good' | 'fair' | 'poor';

function GradeChip({ grade }: { grade: Grade }) {
  return <span className={`grade grade-${grade}`}>{grade}</span>;
}

/**
 * Grade a like-for-like comparison by how far the ratio sits from 1.
 *
 * Only valid where the two numbers are the SAME quantity. Applying this to the
 * size comparison would be misleading: an orbital's mean radius and a covalent
 * radius are different things, so hydrogen reads 2.6x while being exact.
 */
function gradeRatio(ratio: number | null): Grade {
  if (ratio == null) return 'poor';
  const off = Math.max(ratio, 1 / ratio);
  if (off < 1.02) return 'exact';
  if (off < 1.3) return 'good';
  if (off < 2) return 'fair';
  return 'poor';
}

interface Props {
  element: Element;
}

/**
 * Everything here is derived from the element alone, deliberately. An earlier
 * version took the orbital list as a prop from the renderer's state, which
 * meant the two could disagree: node structure describing one element while the
 * size and energy rows described another. Node counts depend only on the
 * quantum numbers anyway, so there is nothing to gain from the coupling and a
 * whole class of inconsistency to lose.
 */
export function RealityCheck({ element }: Props) {
  const z = element.z;
  const orbitals: Orbital[] = useMemo(() => buildOrbitals(z), [z]);

  const checks = useMemo(() => {
    const spherical = buildOrbitals(z, 'spherical');
    const modelRadiusPm = outerShellRadius(spherical) * BOHR_IN_PM;
    const predictedIe = estimatedIonisationEnergyEv(spherical);

    const radiusRatio = element.covalentRadiusPm
      ? modelRadiusPm / element.covalentRadiusPm
      : null;
    const ieRatio = element.ionisationEnergyEv
      ? predictedIe / element.ionisationEnergyEv
      : null;

    return { modelRadiusPm, predictedIe, radiusRatio, ieRatio };
  }, [z, element]);

  // Distinct subshells with their node counts. Node structure is the one thing
  // the model gets exactly right, because it is fixed by the quantum numbers
  // rather than by any approximation to the screening.
  const subshells = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ label: string; radial: number; angular: number }> = [];
    for (const o of orbitals) {
      if (seen.has(o.subshell)) continue;
      seen.add(o.subshell);
      out.push({ label: o.subshell, radial: o.n - o.l - 1, angular: o.l });
    }
    return out;
  }, [orbitals]);

  const ieGrade = gradeRatio(checks.ieRatio);
  // Deliberately NOT graded. See gradeRatio: these are different quantities, so
  // a ratio of 1 is not the target and a pass/fail mark would be invented.
  const sizeDegraded = checks.radiusRatio != null && checks.radiusRatio > 3;

  return (
    <>
      <div className="check-row">
        <span className="check-name">Node structure</span>
        <GradeChip grade="exact" />
      </div>
      <div className="check-detail">
        {subshells.map((s) => (
          <span key={s.label} className="node-chip">
            {s.label}: {s.radial + s.angular} node{s.radial + s.angular === 1 ? '' : 's'}
          </span>
        ))}
      </div>
      <div className="plot-caption">
        Every orbital has exactly n&minus;l&minus;1 spherical nodes and l planar
        ones. This is fixed by the quantum numbers, so no approximation to the
        screening can spoil it, and the test suite checks every orbital up to
        n=6. Hydrogen&apos;s nodal structure has been imaged directly.
      </div>

      <div className="check-row">
        <span className="check-name">Size</span>
        <span className="grade grade-note">not directly comparable</span>
      </div>
      <div className="check-detail">
        <span className="node-chip">
          &lt;r&gt; {checks.modelRadiusPm.toFixed(0)} pm
        </span>
        <span className="node-chip">
          r&#8331;&#8331;&#8331; {element.covalentRadiusPm ? `${element.covalentRadiusPm} pm` : 'unknown'}
        </span>
        {checks.radiusRatio && (
          <span className={`node-chip ${sizeDegraded ? 'chip-warn' : ''}`}>
            {checks.radiusRatio.toFixed(1)}x
          </span>
        )}
      </div>
      <div className="plot-caption">
        Given no grade on purpose. An orbital&apos;s mean radius and a covalent
        radius are different quantities, so a ratio of 1 is not the target and
        any pass mark here would be invented. Hydrogen shows 2.6x while being the
        exact analytic solution.
        {sizeDegraded &&
          ' This element is past 3x, which is beyond the definitional offset: it sits on a filled d shell, where Slater screening genuinely breaks down. The plot below shows the pattern.'}
      </div>

      <div className="check-row">
        <span className="check-name">Ionisation energy</span>
        <GradeChip grade={ieGrade} />
      </div>
      <div className="check-detail">
        <span className="node-chip">model {checks.predictedIe.toFixed(1)} eV</span>
        <span className="node-chip">
          measured{' '}
          {element.ionisationEnergyEv ? `${element.ionisationEnergyEv} eV` : 'unknown'}
        </span>
        {checks.ieRatio && <span className="node-chip">{checks.ieRatio.toFixed(1)}x</span>}
      </div>
      <div className="plot-caption">
        Energies are the weakest thing here and the estimate always comes out too
        deep. Two structural reasons: the expression gives each electron the full
        attraction to a screened nucleus, but the screening <em>is</em> the other
        electrons, so their mutual repulsion is counted once per partner instead
        of once per pair. And a real ionisation energy is a difference between
        two atoms; removing an electron lets the rest settle inward, which a
        single orbital energy knows nothing about. Hydrogen, having no second
        electron, is exact to within 0.1%.
      </div>

      <h3>What has actually been seen</h3>

      <div className="evidence">
        <div className="evidence-title">Scanning tunnelling microscopy (1981)</div>
        <div className="evidence-body">
          Routinely described as photographs of atoms. It is not photography and
          the images are not of orbital shapes. An STM measures the tunnelling
          current between a sharp tip and a surface, which tracks the local
          density of electron states. The familiar bumps are a contour map of
          where electrons are available to tunnel, at a surface, not a picture of
          an isolated atom.
        </div>
      </div>

      <div className="evidence">
        <div className="evidence-title">Photoionization microscopy (2013)</div>
        <div className="evidence-body">
          The closest anyone has come to directly imaging orbital structure.
          Stodolna and colleagues magnified the wavefunction of hydrogen atoms
          onto a detector and resolved the nodes as visible dark rings, matching
          the predicted counts. The honest caveat: those were Stark states, atoms
          held in a strong electric field, so the node <em>counts</em> compare
          directly with what is drawn here while the shapes do not.
        </div>
      </div>

      <div className="evidence">
        <div className="evidence-title">X-ray and electron diffraction</div>
        <div className="evidence-body">
          The most quantitative check available. Diffraction from crystals
          recovers the total electron density, and it is genuinely measured
          rather than inferred. It gives densities in bulk material rather than
          for free atoms, which is why the size comparison above uses covalent
          radii extracted from such data.
        </div>
      </div>

      <div className="note">
        No atom has ever been photographed optically, and none can be. Visible
        light is a few thousand times larger than an atom, so it cannot resolve
        one any more than you could feel the shape of a grain of sand through a
        boxing glove. Every image of an atom in existence is a map of some
        measured quantity, drawn by a machine. This one is a map of a computed
        quantity, which is why the grades above matter.
      </div>
    </>
  );
}
