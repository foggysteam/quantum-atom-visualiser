/**
 * The crystal lattice of ion cores.
 *
 * What is drawn here are ION CORES, not neutral atoms. In copper each atom has
 * handed its 4s electron to the crystal as a whole, so what remains at each
 * lattice site is a Cu+ core: the nucleus plus the tightly bound 1s through 3d
 * electrons, which stay put. The 4s electrons are not drawn here at all; they
 * are the separate, delocalised gas in ElectronGas.
 *
 * That division is the whole idea of a metal. The cores are localised and
 * vibrate about fixed sites; the valence electrons belong to no atom in
 * particular and roam the entire crystal.
 *
 * Thermal vibration is drawn too, and it is not decoration: a perfectly rigid,
 * perfectly periodic lattice would not scatter electrons at all and the metal
 * would have zero resistance. Resistance comes from the lattice being
 * imperfect, and near room temperature the dominant imperfection is exactly
 * this thermal displacement.
 *
 * World units are nanometres.
 */

import * as THREE from 'three';
import type { ConductionMaterial } from '../physics/conduction';

export interface LatticeSite {
  x: number;
  y: number;
  z: number;
}

/**
 * Generate lattice sites for a block of unit cells, centred on the origin.
 * Positions are in nanometres.
 */
export function generateLattice(
  material: ConductionMaterial,
  cells: { x: number; y: number; z: number },
): LatticeSite[] {
  const a = material.latticeConstantA / 10; // angstrom -> nanometre

  // Fractional positions within the conventional cubic cell.
  const fccBasis = [
    [0, 0, 0],
    [0, 0.5, 0.5],
    [0.5, 0, 0.5],
    [0.5, 0.5, 0],
  ];
  // Diamond is FCC with a second atom offset by a quarter of the body diagonal.
  const basis =
    material.structure === 'diamond'
      ? [...fccBasis, ...fccBasis.map(([x, y, z]) => [x + 0.25, y + 0.25, z + 0.25])]
      : fccBasis;

  const sites: LatticeSite[] = [];
  const halfX = (cells.x * a) / 2;
  const halfY = (cells.y * a) / 2;
  const halfZ = (cells.z * a) / 2;

  for (let i = 0; i < cells.x; i++) {
    for (let j = 0; j < cells.y; j++) {
      for (let k = 0; k < cells.z; k++) {
        for (const [bx, by, bz] of basis) {
          const x = (i + bx) * a - halfX;
          const y = (j + by) * a - halfY;
          const z = (k + bz) * a - halfZ;
          // Keep the block a clean rectangular slab: basis atoms can spill past
          // the far faces, and a ragged surface reads as a defect rather than
          // as the edge of the sample.
          if (x > halfX || y > halfY || z > halfZ) continue;
          sites.push({ x, y, z });
        }
      }
    }
  }
  return sites;
}

const CORE_COLOURS: Record<string, string> = {
  Cu: '#e08a4a',
  Ag: '#d7dce3',
  Au: '#e8c04a',
  Al: '#9fb3c8',
  Si: '#7d8fa8',
  C: '#8fa0b5',
};

export class LatticeView {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh | null = null;
  private sites: LatticeSite[] = [];
  private dummy = new THREE.Object3D();
  private phases: Float32Array = new Float32Array(0);

  /** Vibration amplitude in nanometres, set from temperature. */
  public vibrationAmplitude = 0;
  /** Core sphere radius in nanometres. */
  private coreRadius = 0.05;

  build(material: ConductionMaterial, cells: { x: number; y: number; z: number }) {
    this.dispose();
    this.sites = generateLattice(material, cells);

    const a = material.latticeConstantA / 10;
    // Draw cores at roughly a third of the nearest-neighbour distance so the
    // lattice reads as discrete sites with space between them for the gas.
    const nearestNeighbour = material.structure === 'diamond' ? a * 0.433 : a * 0.707;
    this.coreRadius = nearestNeighbour * 0.3;

    const geometry = new THREE.SphereGeometry(this.coreRadius, 16, 12);
    const material3d = new THREE.MeshStandardMaterial({
      color: new THREE.Color(CORE_COLOURS[material.symbol] ?? '#9aa7b8'),
      roughness: 0.45,
      metalness: 0.35,
    });

    const mesh = new THREE.InstancedMesh(geometry, material3d, this.sites.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh = mesh;
    this.group.add(mesh);

    // Random but fixed phase per site, so vibration looks incoherent.
    this.phases = new Float32Array(this.sites.length * 3);
    for (let i = 0; i < this.phases.length; i++) {
      this.phases[i] = Math.random() * Math.PI * 2;
    }

    this.update(0);
  }

  /** Reposition the cores for the current time, including thermal vibration. */
  update(timeSeconds: number) {
    if (!this.mesh) return;
    const amp = this.vibrationAmplitude;

    for (let i = 0; i < this.sites.length; i++) {
      const s = this.sites[i];
      // A crude superposition of a few incommensurate frequencies: enough to
      // look like thermal jitter without pretending to be a phonon spectrum.
      const t = timeSeconds;
      const dx = amp * Math.sin(t * 13.1 + this.phases[i * 3]);
      const dy = amp * Math.sin(t * 17.7 + this.phases[i * 3 + 1]);
      const dz = amp * Math.sin(t * 11.3 + this.phases[i * 3 + 2]);

      this.dummy.position.set(s.x + dx, s.y + dy, s.z + dz);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get siteCount(): number {
    return this.sites.length;
  }

  setVisible(visible: boolean) {
    this.group.visible = visible;
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.group.remove(this.mesh);
      this.mesh = null;
    }
    this.sites = [];
  }
}
