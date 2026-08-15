/**
 * Radial probability distribution P(r) = r^2 |R_nl(r)|^2, one curve per subshell.
 *
 * This plot answers a question the 3D view cannot: how far from the nucleus is
 * the electron actually likely to be? It also makes two things visible that are
 * routinely glossed over:
 *
 *   - P(0) = 0 for every orbital, including 1s, even though R(0) is at its
 *     maximum there. There is simply less space in a thin shell near r = 0.
 *   - The curve never reaches zero on the right. It decays exponentially and
 *     goes on forever. The atom has no edge; any boundary drawn is a choice.
 *
 * TWO SCALING DECISIONS, both forced by the physics:
 *
 * 1. LOGARITHMIC radius axis. In copper the 1s shell peaks near 2.8 pm and the
 *    4s shell near 343 pm, a factor of over a hundred. On a linear axis every
 *    inner shell collapses into the leftmost pixel and the plot shows one spike
 *    and nothing else. A log axis gives each shell comparable room, which is
 *    what makes the shell structure legible at all.
 *
 * 2. Each curve is normalised to ITS OWN peak. Sharing one vertical scale would
 *    again let 1s (which is enormously more concentrated) flatten everything
 *    else to the axis. The trade-off is explicit: this plot compares WHERE the
 *    shells are, not how much density each holds. Relative occupancy is shown
 *    by the orbital bars instead.
 */

import { useEffect, useRef } from 'react';
import { radialProbabilityDensity } from '../physics/radial';
import { BOHR_IN_PM } from '../physics/constants';
import type { Orbital } from '../physics/wavefunction';

const CURVE_COLOURS = [
  '#4fc3f7', '#ffa63d', '#7ee787', '#f778ba',
  '#a78bfa', '#fbbf24', '#34d399', '#fb7185',
];

/** Innermost radius plotted, in pm. Below this nothing is ever occupied. */
const R_MIN_PM = 0.2;

interface Props {
  orbitals: Orbital[];
  extent: number;
  covalentRadiusPm: number | null;
}

export function RadialPlot({ orbitals, extent, covalentRadiusPm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const subshells: Array<{ label: string; n: number; l: number; zEff: number }> = [];
  const seen = new Set<string>();
  for (const o of orbitals) {
    if (seen.has(o.subshell)) continue;
    seen.add(o.subshell);
    subshells.push({ label: o.subshell, n: o.n, l: o.l, zEff: o.zEff });
  }

  const signature = subshells.map((s) => `${s.label}:${s.zEff.toFixed(3)}`).join(',');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const pad = { left: 6, right: 6, top: 8, bottom: 15 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const rMaxPm = extent * BOHR_IN_PM;
    const logMin = Math.log10(R_MIN_PM);
    const logMax = Math.log10(rMaxPm);
    const xOf = (rPm: number) =>
      pad.left + ((Math.log10(Math.max(rPm, R_MIN_PM)) - logMin) / (logMax - logMin)) * plotW;

    // Decade gridlines.
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    for (let d = Math.ceil(logMin); d <= Math.floor(logMax); d++) {
      const x = Math.round(xOf(Math.pow(10, d))) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotH);
      ctx.stroke();
    }

    // Baseline.
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + plotH + 0.5);
    ctx.lineTo(pad.left + plotW, pad.top + plotH + 0.5);
    ctx.stroke();

    // Measured covalent radius reference.
    if (covalentRadiusPm != null && covalentRadiusPm < rMaxPm) {
      const x = xOf(covalentRadiusPm);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText('r_cov', x + 3, pad.top + 8);
    }

    // One curve per subshell, each normalised to its own peak.
    const samples = 500;
    subshells.forEach((s, index) => {
      const values: Array<[number, number]> = [];
      let peak = 0;
      for (let i = 0; i <= samples; i++) {
        // Step uniformly in log r so the curve is smooth on a log axis.
        const rPm = Math.pow(10, logMin + ((logMax - logMin) * i) / samples);
        const p = radialProbabilityDensity(s.n, s.l, rPm / BOHR_IN_PM, s.zEff);
        values.push([rPm, p]);
        if (p > peak) peak = p;
      }
      if (peak <= 0) return;

      ctx.strokeStyle = CURVE_COLOURS[index % CURVE_COLOURS.length];
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      values.forEach(([rPm, p], i) => {
        const x = xOf(rPm);
        const y = pad.top + plotH - (p / peak) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // Axis labels at the decade ticks.
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.font = '9px ui-monospace, monospace';
    for (let d = Math.ceil(logMin); d <= Math.floor(logMax); d++) {
      const v = Math.pow(10, d);
      const label = v >= 100 ? `${v / 100} A` : `${v} pm`;
      const x = xOf(v);
      const w = ctx.measureText(label).width;
      if (x - w / 2 > 0 && x + w / 2 < width) {
        ctx.fillText(label, x - w / 2, height - 3);
      }
    }
  }, [signature, extent, covalentRadiusPm]);

  return (
    <>
      <canvas ref={canvasRef} className="radial-plot" />
      <div className="plot-legend">
        {subshells.map((s, i) => (
          <span key={s.label}>
            <i
              className="swatch"
              style={{ background: CURVE_COLOURS[i % CURVE_COLOURS.length] }}
            />
            {s.label}
          </span>
        ))}
      </div>
      <div className="plot-caption">
        Log radius. Each curve normalised to its own peak, so this compares where
        the shells sit, not how much density each holds.
      </div>
    </>
  );
}
