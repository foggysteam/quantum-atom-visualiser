/**
 * The Bohr model, drawn deliberately as a ghost.
 *
 * Included because it is the picture almost everyone carries in their head, and
 * seeing it superimposed on the real probability cloud is the fastest way to
 * understand how wrong it is. It is drawn faint, grey and dashed so it never
 * competes with the actual density, and the UI labels it as superseded.
 *
 * What Bohr got RIGHT, and it was a triumph in 1913: the orbit radii
 * r_n = n^2 a0 / Z reproduce hydrogen's emission spectrum exactly, and the n=1
 * radius really is where the 1s radial probability peaks.
 *
 * What it got WRONG: electrons do not follow circular paths, do not have
 * simultaneous positions and momenta, and are not localised at a radius. The
 * model also fails outright for every atom with more than one electron.
 */

import * as THREE from 'three';

export class BohrOverlay {
  readonly group = new THREE.Group();
  private disposables: Array<THREE.BufferGeometry | THREE.Material> = [];

  constructor() {
    this.group.visible = false;
  }

  /**
   * Draw one ring per occupied principal shell.
   * Radii use the Bohr formula r_n = n^2 / Z_eff (in Bohr radii).
   */
  setShells(shells: Array<{ n: number; zEff: number }>) {
    this.clear();

    const seen = new Set<number>();
    for (const { n, zEff } of shells) {
      if (seen.has(n)) continue;
      seen.add(n);

      const radius = (n * n) / zEff;
      const segments = 256;
      const positions = new Float32Array((segments + 1) * 3);
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        positions[i * 3] = Math.cos(theta) * radius;
        positions[i * 3 + 1] = Math.sin(theta) * radius;
        positions[i * 3 + 2] = 0;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.LineDashedMaterial({
        color: new THREE.Color('#7d8794'),
        dashSize: radius * 0.04,
        gapSize: radius * 0.04,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      });

      const line = new THREE.Line(geometry, material);
      line.computeLineDistances();
      // Tilt each shell so they do not all stack into one flat disc.
      line.rotation.x = Math.PI / 2;
      line.rotation.y = (n - 1) * 0.35;

      this.group.add(line);
      this.disposables.push(geometry, material);
    }
  }

  setVisible(visible: boolean) {
    this.group.visible = visible;
  }

  private clear() {
    this.group.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  dispose() {
    this.clear();
  }
}
