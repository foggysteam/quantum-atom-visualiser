/**
 * Where the model tracks reality, and where it does not.
 *
 * Plots the computed mean radius of each element's outermost orbital against
 * its measured covalent radius, across the whole periodic table.
 *
 * WHY THIS EXISTS. Every number this tool draws comes out of Slater's rules,
 * which are a 1930 approximation to a problem with no closed-form solution.
 * They are good for light elements and progressively worse for heavy ones. A
 * visualisation that hid that would be presenting an approximation as if it
 * were a measurement. This plot puts the disagreement on screen.
 *
 * WHAT IT DOES NOT SAY. The two curves are different physical quantities. The
 * mean radius <r> of an orbital is where an electron typically is; the covalent
 * radius is half the distance between two bonded nuclei. They are related but
 * not equal, so a constant offset between them is expected and means nothing.
 * What matters is the SHAPE: does the computed curve reproduce the periodic
 * sawtooth, the contraction across each period, the jump at each new shell? And
 * where does it stop doing so?
 */

import { useEffect, useMemo, useRef } from 'react';
import { ELEMENTS } from '../physics/elements';
import { buildOrbitals, outerShellRadius } from '../physics/wavefunction';
import { BOHR_IN_PM } from '../physics/constants';

interface Props {
  selectedZ: number;
  relativistic: boolean;
}

export function ModelAccuracyPlot({ selectedZ, relativistic }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Computing 118 orbital sets is not free, so only redo it when it can change.
  const computed = useMemo(
    () =>
      ELEMENTS.map((e) => ({
        z: e.z,
        symbol: e.symbol,
        measured: e.covalentRadiusPm,
        model: outerShellRadius(buildOrbitals(e.z, 'spherical', relativistic)) * BOHR_IN_PM,
      })),
    [relativistic],
  );

  const current = computed[selectedZ - 1];
  const ratio =
    current && current.measured ? current.model / current.measured : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const pad = { left: 4, right: 4, top: 8, bottom: 14 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    // Log y: the computed radii span far more range than the measured ones,
    // especially once Slater starts overshooting in the heavy elements.
    const values = computed.flatMap((d) =>
      [d.model, d.measured].filter((v): v is number => v != null && v > 0),
    );
    const yMin = Math.min(...values) * 0.8;
    const yMax = Math.max(...values) * 1.2;
    const logMin = Math.log10(yMin);
    const logMax = Math.log10(yMax);

    const xOf = (z: number) => pad.left + ((z - 1) / 117) * plotW;
    const yOf = (v: number) =>
      pad.top + plotH - ((Math.log10(v) - logMin) / (logMax - logMin)) * plotH;

    // Decade gridlines.
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    for (let d = Math.ceil(logMin); d <= Math.floor(logMax); d++) {
      const y = Math.round(yOf(Math.pow(10, d))) + 0.5;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '8px ui-monospace, monospace';
      ctx.fillText(`${Math.pow(10, d)} pm`, pad.left + 2, y - 2);
    }

    // Highlight the selected element.
    const xSel = xOf(selectedZ);
    ctx.strokeStyle = 'rgba(79,195,247,0.5)';
    ctx.beginPath();
    ctx.moveTo(xSel, pad.top);
    ctx.lineTo(xSel, pad.top + plotH);
    ctx.stroke();

    // Measured covalent radii. Drawn with gaps where no value exists rather
    // than interpolated across, since the superheavies have never been measured.
    ctx.strokeStyle = '#7ee787';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    let drawing = false;
    for (const d of computed) {
      if (d.measured == null) {
        drawing = false;
        continue;
      }
      const x = xOf(d.z);
      const y = yOf(d.measured);
      if (!drawing) {
        ctx.moveTo(x, y);
        drawing = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Computed model radii.
    ctx.strokeStyle = '#ffa63d';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    computed.forEach((d, i) => {
      const x = xOf(d.z);
      const y = yOf(d.model);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // x-axis ticks at each new period.
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.font = '8px ui-monospace, monospace';
    for (const z of [1, 20, 40, 60, 80, 100, 118]) {
      const label = String(z);
      const x = xOf(z);
      const w = ctx.measureText(label).width;
      ctx.fillText(label, Math.min(Math.max(x - w / 2, 0), width - w), height - 3);
    }
  }, [computed, selectedZ]);

  return (
    <>
      <canvas ref={canvasRef} className="radial-plot" style={{ height: 96 }} />
      <div className="plot-legend">
        <span>
          <i className="swatch" style={{ background: '#7ee787' }} />
          measured covalent radius
        </span>
        <span>
          <i className="swatch" style={{ background: '#ffa63d' }} />
          computed &lt;r&gt; of outer orbital
        </span>
      </div>
      {ratio != null && (
        <div className="readout" style={{ marginTop: 4 }}>
          <span>Model vs measured, here</span>
          <span style={{ color: ratio > 3 || ratio < 0.4 ? '#ff8a6b' : undefined }}>
            {ratio.toFixed(1)}x
          </span>
        </div>
      )}
      <div className="plot-caption">
        These are different quantities, so an offset is expected and is not
        error. Hydrogen proves it: the model there is the <em>exact</em> analytic
        solution, and it still reads 2.6x, because &lt;r&gt; = 1.5 a&#8320; is
        simply not the same thing as a bonding radius.
        <br />
        <br />
        What matters is the shape, and the computed curve reproduces the
        sawtooth faithfully: contracting across each period, jumping at each new
        shell. Where it fails is specific rather than general. Main-group
        elements stay near 1.1-1.7x, but anything sitting on top of a filled d
        shell blows out, reaching 2.6x at copper, 3.7x at silver and 5.7x at
        gold. That is Slater&apos;s weakest assumption showing: d electrons
        barely penetrate the core, so they screen far worse than the flat 0.85
        and 1.00 constants assume, and the real valence orbital is much tighter
        than this predicts.
      </div>
    </>
  );
}
