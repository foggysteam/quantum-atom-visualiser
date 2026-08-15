/**
 * Device capability detection, used to pick render quality.
 *
 * This is a GPU-heavy tool. The desktop path bakes a 4096x4096 half-float
 * density atlas (about 134 MB of texture memory) and raymarches it at 256 steps
 * per pixel. Plenty of phones report a MAX_TEXTURE_SIZE of exactly 4096, so
 * that allocation nominally fits while being far more than the device should be
 * asked to hold, and the fill rate alone would make it unusable.
 *
 * So on a small or touch-first device the atlas drops to 2048x2048 (about
 * 34 MB), the step count roughly halves, and the pixel ratio is capped. The
 * physics is untouched: every wavefunction, energy and node count is identical.
 * Only the sampling resolution of the picture changes.
 *
 * Detection is heuristic by necessity. There is no reliable way to ask a browser
 * how fast its GPU is, so this uses proxies (coarse pointer, screen size,
 * reported memory and core count) and lets the user override the result.
 */

export type Quality = 'low' | 'high';

export interface QualityProfile {
  /** Voxels per axis in the density volume. Atlas is ceil(sqrt(res)) * res square. */
  volumeResolution: number;
  /** Upper bound on devicePixelRatio for the render buffer. */
  maxPixelRatio: number;
  /** Default raymarch steps. */
  steps: number;
  /** Default Monte Carlo sample count. */
  pointCount: number;
}

export const QUALITY_PROFILES: Record<Quality, QualityProfile> = {
  high: {
    volumeResolution: 256,
    maxPixelRatio: 2,
    steps: 256,
    pointCount: 250000,
  },
  low: {
    volumeResolution: 128,
    maxPixelRatio: 1.25,
    steps: 112,
    pointCount: 80000,
  },
};

/** True when the device looks like a phone or tablet rather than a desktop. */
export function isTouchFirstDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const smallScreen = Math.min(window.screen.width, window.screen.height) < 820;
  return coarse && smallScreen;
}

/**
 * Pick a quality level. Errs toward 'low' when the signals are ambiguous: a
 * desktop user who gets the reduced profile sees a slightly softer image and
 * can raise it, whereas a phone user who gets the full profile may just watch
 * the tab die.
 */
export function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'high';
  if (isTouchFirstDevice()) return 'low';

  // Non-standard but widely available on Chromium; absent elsewhere.
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (memory !== undefined && memory <= 4) return 'low';
  if ((navigator.hardwareConcurrency ?? 8) <= 4) return 'low';

  return 'high';
}
