/**
 * The nucleus, drawn two ways.
 *
 * 1. Discrete nucleons as instanced spheres. Legible, countable, and the way
 *    everyone pictures it, but see the caveat in physics/nucleus.ts: nucleons
 *    do not have positions in the way this implies.
 *
 * 2. The Woods-Saxon charge density as a soft shell, which is what electron
 *    scattering experiments actually measure.
 *
 * Both are drawn at whatever exaggeration the ScaleController is set to, and
 * the UI always displays that factor.
 */

import * as THREE from 'three';
import { packNucleus, type NucleusModel } from '../physics/nucleus';
import { NUCLEON_DRAW_RADIUS_FM } from '../physics/constants';
import { ScaleController } from '../scale/ScaleController';

const PROTON_COLOUR = new THREE.Color('#ff5a4d');
const NEUTRON_COLOUR = new THREE.Color('#9aa7b8');

export class NucleusView {
  readonly group = new THREE.Group();

  private instanced: THREE.InstancedMesh | null = null;
  private densityShell: THREE.Mesh | null = null;
  private model: NucleusModel | null = null;
  private scaleController: ScaleController;

  public showNucleons = true;
  public showDensityShell = false;

  constructor(scaleController: ScaleController) {
    this.scaleController = scaleController;
  }

  /** Rebuild for a nuclide. */
  setNuclide(protons: number, neutrons: number) {
    this.dispose();
    this.model = packNucleus(protons, neutrons);

    const geometry = new THREE.SphereGeometry(1, 16, 12);
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.55,
      metalness: 0.05,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, this.model.nucleons.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const colours = new Float32Array(this.model.nucleons.length * 3);
    this.model.nucleons.forEach((n, i) => {
      const c = n.type === 'proton' ? PROTON_COLOUR : NEUTRON_COLOUR;
      colours[i * 3] = c.r;
      colours[i * 3 + 1] = c.g;
      colours[i * 3 + 2] = c.b;
    });
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colours, 3);

    this.instanced = mesh;
    this.group.add(mesh);

    // The measured charge-density surface, as a translucent shell.
    const shellGeometry = new THREE.SphereGeometry(1, 48, 32);
    const shellMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ff8a6b'),
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.densityShell = new THREE.Mesh(shellGeometry, shellMaterial);
    this.group.add(this.densityShell);

    this.updateScale();
  }

  /** Reapply positions and radii after the exaggeration factor changes. */
  updateScale() {
    if (!this.model || !this.instanced) return;

    const nucleonRadiusWorld = this.scaleController.nucleusWorldRadius(NUCLEON_DRAW_RADIUS_FM);
    const dummy = new THREE.Object3D();

    this.model.nucleons.forEach((n, i) => {
      dummy.position.set(
        this.scaleController.nucleusWorldRadius(n.x),
        this.scaleController.nucleusWorldRadius(n.y),
        this.scaleController.nucleusWorldRadius(n.z),
      );
      dummy.scale.setScalar(nucleonRadiusWorld);
      dummy.updateMatrix();
      this.instanced!.setMatrixAt(i, dummy.matrix);
    });
    this.instanced.instanceMatrix.needsUpdate = true;
    this.instanced.visible = this.showNucleons;

    if (this.densityShell) {
      const shellRadius = this.scaleController.nucleusWorldRadius(this.model.radiusFm);
      this.densityShell.scale.setScalar(shellRadius);
      this.densityShell.visible = this.showDensityShell;
    }
  }

  /** Apparent radius of the drawn nucleus in world units, for camera framing. */
  get drawnRadiusWorld(): number {
    if (!this.model) return 0;
    return this.scaleController.nucleusWorldRadius(this.model.radiusFm);
  }

  get nuclide(): NucleusModel | null {
    return this.model;
  }

  dispose() {
    if (this.instanced) {
      this.instanced.geometry.dispose();
      (this.instanced.material as THREE.Material).dispose();
      this.group.remove(this.instanced);
      this.instanced = null;
    }
    if (this.densityShell) {
      this.densityShell.geometry.dispose();
      (this.densityShell.material as THREE.Material).dispose();
      this.group.remove(this.densityShell);
      this.densityShell = null;
    }
  }
}
