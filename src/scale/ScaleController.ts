/**
 * Scale handling. This is the part that makes the render honest.
 *
 * A hydrogen atom's electron cloud is about 1 Bohr radius across, which is
 * 52,918 fm. Its nucleus is a single proton, about 1.7 fm across. The nucleus
 * occupies roughly one part in 30,000 by length, and one part in 2.6e13 by
 * volume. If an atom were scaled up until it spanned a football pitch, the
 * nucleus would be a grain of rice on the centre spot.
 *
 * Essentially every image ever drawn of an atom inflates the nucleus by four or
 * five orders of magnitude, silently. This controller does the same thing when
 * asked, because you cannot see a sub-pixel dot, but it always reports the
 * multiplier it is using. If the picture is lying, the number on screen says
 * by how much.
 */

import { BOHR_IN_FM, BOHR_IN_PM } from '../physics/constants';

export interface ScaleState {
  /** Multiplier applied to nucleus size. 1 means physically true scale. */
  nucleusExaggeration: number;
  /** Camera distance from the origin, in Bohr radii. */
  cameraDistance: number;
}

export class ScaleController {
  /** Nucleus size multiplier. 1 = true scale. */
  nucleusExaggeration = 1;

  /** World units are Bohr radii throughout the renderer. */
  static readonly WORLD_UNIT = 'Bohr radius';

  /** Convert a femtometre length into world units (Bohr radii). */
  static fmToWorld(fm: number): number {
    return fm / BOHR_IN_FM;
  }

  /** Convert a world-unit length into picometres. */
  static worldToPm(world: number): number {
    return world * BOHR_IN_PM;
  }

  /** Convert a world-unit length into femtometres. */
  static worldToFm(world: number): number {
    return world * BOHR_IN_FM;
  }

  /** Radius to draw the nucleus at, in world units, including exaggeration. */
  nucleusWorldRadius(radiusFm: number): number {
    return ScaleController.fmToWorld(radiusFm) * this.nucleusExaggeration;
  }

  /** True when the nucleus is being drawn at its real relative size. */
  get isTrueScale(): boolean {
    return Math.abs(this.nucleusExaggeration - 1) < 1e-9;
  }

  /**
   * Human-readable statement of how much the nucleus is being inflated.
   * Shown on screen at all times so the exaggeration is never invisible.
   */
  exaggerationLabel(): string {
    if (this.isTrueScale) return 'true scale';
    const factor = this.nucleusExaggeration;
    const formatted =
      factor >= 1000
        ? `${Math.round(factor / 1000)},000`
        : factor >= 10
          ? Math.round(factor).toString()
          : factor.toFixed(1);
    return `nucleus shown ${formatted}x too large`;
  }

  /**
   * Pick a "nice" scale-bar length: the largest 1/2/5 x 10^n that fits within
   * the requested span, returned with an appropriate unit.
   */
  static scaleBar(spanWorld: number): { length: number; label: string } {
    const spanPm = ScaleController.worldToPm(spanWorld);
    const target = spanPm * 0.3;

    const exponent = Math.floor(Math.log10(target));
    const base = Math.pow(10, exponent);
    const candidates = [1, 2, 5, 10].map((m) => m * base);
    let chosen = candidates[0];
    for (const c of candidates) if (c <= target) chosen = c;

    const lengthWorld = chosen / BOHR_IN_PM;

    let label: string;
    if (chosen >= 100) label = `${(chosen / 100).toPrecision(3).replace(/\.?0+$/, '')} A`;
    else if (chosen >= 1) label = `${chosen} pm`;
    else label = `${(chosen * 1000).toPrecision(3).replace(/\.?0+$/, '')} fm`;

    return { length: lengthWorld, label };
  }

  /**
   * Map a normalised slider position (0 = whole atom, 1 = individual nucleons)
   * onto a camera distance, logarithmically.
   *
   * Linear zoom is useless across this range: getting from the electron cloud
   * to the nucleus means covering five orders of magnitude, so 99.999% of a
   * linear slider would be spent inside the cloud with nothing visible.
   */
  static zoomToDistance(t: number, atomExtent: number, nucleusRadiusFm: number): number {
    const far = atomExtent * 2.5;
    const near = Math.max(ScaleController.fmToWorld(nucleusRadiusFm) * 4, 1e-9);
    const logFar = Math.log(far);
    const logNear = Math.log(near);
    return Math.exp(logFar + (logNear - logFar) * Math.min(Math.max(t, 0), 1));
  }

  /** Inverse of zoomToDistance, for syncing the slider to camera state. */
  static distanceToZoom(distance: number, atomExtent: number, nucleusRadiusFm: number): number {
    const far = atomExtent * 2.5;
    const near = Math.max(ScaleController.fmToWorld(nucleusRadiusFm) * 4, 1e-9);
    const logFar = Math.log(far);
    const logNear = Math.log(near);
    const t = (Math.log(distance) - logFar) / (logNear - logFar);
    return Math.min(Math.max(t, 0), 1);
  }

  /**
   * The exaggeration needed to make the nucleus a given fraction of the atom's
   * apparent size. Used by the "make the nucleus visible" preset, which is
   * honest about being a lie.
   */
  static exaggerationForVisibility(
    nucleusRadiusFm: number,
    atomExtent: number,
    targetFraction = 0.04,
  ): number {
    const trueWorld = ScaleController.fmToWorld(nucleusRadiusFm);
    if (trueWorld <= 0) return 1;
    return (atomExtent * targetFraction) / trueWorld;
  }

  /** Format a world-unit length for display, choosing a sensible unit. */
  static formatLength(world: number): string {
    const pm = ScaleController.worldToPm(world);
    if (pm >= 100) return `${(pm / 100).toFixed(2)} A`;
    if (pm >= 0.1) return `${pm.toFixed(2)} pm`;
    return `${ScaleController.worldToFm(world).toFixed(2)} fm`;
  }
}
