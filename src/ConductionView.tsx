/**
 * The conduction view: a block of real crystal, its ion cores and its electron
 * sea, answering how a metal carries current and why an insulator does not.
 *
 * The formatting helpers below carry more weight than they look. This module
 * spans about forty orders of magnitude in the quantities it displays, from
 * attoseconds (light crossing a few nanometres) to 1e12 cubic kilometres (the
 * volume of diamond needed to contain one free electron). Every one of those
 * numbers has to stay readable, and several bugs here were purely presentational:
 * "0.0 fs" for a time that was really 14 attoseconds, and "3.96e+24 x10^6 m/s"
 * for a drift velocity the model should have refused to print at all.
 *
 * The interface is also careful to distinguish metals from everything else.
 * Metals are driven by current density, which people have intuitions about;
 * non-metals are driven by field directly, because a current density that is
 * ordinary in copper is physically impossible in silicon and asking for it
 * produces faster-than-light nonsense.
 */

import { useEffect, useRef, useState } from 'react';
import {
  ConductionScene,
  DEFAULT_CONDUCTION,
  type ConductionSettings,
  type ConductionState,
} from './render/ConductionScene';
import {
  CONDUCTION_MATERIALS,
  carrierDensity,
  conductivityAt,
  materialBySymbol,
} from './physics/conduction';
import type { QualityProfile } from './ui/device';
import './ui/styles.css';

/** Format a number in scientific notation with a superscript-free exponent. */
function sci(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return 'infinite';
  if (value === 0) return '0';
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const mantissa = value / Math.pow(10, exponent);
  return `${mantissa.toFixed(digits)}e${exponent}`;
}

/** Human-friendly duration from seconds. */
function duration(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'never';
  // Light crosses a few nanometres in tens of attoseconds, so the small end has
  // to reach well below femtoseconds or the most striking comparison in the
  // whole module reads as "0.0 fs".
  if (seconds < 1e-18) return `${(seconds * 1e21).toFixed(2)} zs`;
  if (seconds < 1e-15) return `${(seconds * 1e18).toFixed(1)} as`;
  if (seconds < 1e-12) return `${(seconds * 1e15).toFixed(2)} fs`;
  if (seconds < 1e-9) return `${(seconds * 1e12).toFixed(1)} ps`;
  if (seconds < 1e-6) return `${(seconds * 1e9).toFixed(1)} ns`;
  if (seconds < 1) return `${(seconds * 1e3).toFixed(1)} ms`;
  if (seconds < 90) return `${seconds.toFixed(1)} s`;
  if (seconds < 5400) return `${(seconds / 60).toFixed(1)} min`;
  if (seconds < 86400 * 2) return `${(seconds / 3600).toFixed(1)} hours`;
  if (seconds < 86400 * 800) return `${(seconds / 86400).toFixed(1)} days`;
  return `${(seconds / (86400 * 365.25)).toExponential(1)} years`;
}

/** A volume, expressed in whatever unit keeps the number human. */
function volumeLabel(m3: number): string {
  if (!Number.isFinite(m3)) return 'never';
  if (m3 < 1e-27) return `${sci(m3 * 1e27, 1)} nm³`;
  if (m3 < 1e-18) return `${(m3 * 1e27).toFixed(1)} nm³`;
  if (m3 < 1e-9) return `${(m3 * 1e18).toFixed(1)} µm³`;
  if (m3 < 1) return `${(m3 * 1e9).toFixed(1)} mm³`;
  if (m3 < 1e9) return `${m3.toFixed(1)} m³`;
  return `${sci(m3 / 1e9, 1)} km³`;
}

/** Side length of a cube of the given volume, in human units. */
function cubeSideLabel(m3: number): string {
  if (!Number.isFinite(m3)) return 'infinite';
  const side = Math.cbrt(m3);
  if (side < 1e-9) return `${(side * 1e12).toFixed(1)} pm`;
  if (side < 1e-6) return `${(side * 1e9).toFixed(1)} nm`;
  if (side < 1e-3) return `${(side * 1e6).toFixed(1)} µm`;
  if (side < 1) return `${(side * 1e3).toFixed(1)} mm`;
  if (side < 1e3) return `${side.toFixed(1)} m`;
  return `${(side / 1e3).toLocaleString(undefined, { maximumFractionDigits: 0 })} km`;
}

function speed(v: number): string {
  const a = Math.abs(v);
  // Past light speed the value is meaningless anyway, but it must not render as
  // "3.96e+24 x10⁶ m/s", which is both wrong-looking and unreadable.
  if (a >= 1e9) return `${sci(v)} m/s`;
  if (a >= 1e5) return `${(v / 1e6).toFixed(3)} x10⁶ m/s`;
  if (a >= 1) return `${v.toFixed(2)} m/s`;
  if (a >= 1e-3) return `${(v * 1e3).toFixed(3)} mm/s`;
  if (a >= 1e-6) return `${(v * 1e6).toFixed(2)} µm/s`;
  return `${sci(v)} m/s`;
}

export default function ConductionView({ modeSwitch, profile }: { modeSwitch: React.ReactNode; profile: QualityProfile }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ConductionScene | null>(null);

  const [settings, setSettings] = useState<ConductionSettings>({ ...DEFAULT_CONDUCTION });
  const [state, setState] = useState<ConductionState | null>(null);
  const [panelsHidden, setPanelsHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    let scene: ConductionScene;
    try {
      scene = new ConductionScene(canvasRef.current, profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a WebGL context.');
      return;
    }
    sceneRef.current = scene;
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__conduction = scene;
    }
    scene.setStateListener(setState);
    scene.update(settings);
    scene.rebuild();
    scene.start();

    const resize = () => {
      const canvas = canvasRef.current;
      if (canvas) scene.setSize(canvas.clientWidth, canvas.clientHeight);
    };
    resize();
    // See AtomView: the canvas resizes with the mobile sheet, which does not
    // fire a window resize event.
    const canvasObserver = new ResizeObserver(resize);
    canvasObserver.observe(canvasRef.current);
    window.addEventListener('resize', resize);
    return () => {
      canvasObserver.disconnect();
      window.removeEventListener('resize', resize);
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.update(settings);
  }, [settings]);

  const update = (patch: Partial<ConductionSettings>) =>
    setSettings((s) => ({ ...s, ...patch }));

  const material = materialBySymbol(settings.materialSymbol);
  const amplification = Math.pow(10, settings.fieldAmplificationDecades);
  const isMetal = material.conductionClass === 'metal';

  // The ratio at the heart of the whole module.
  const velocityRatio =
    state && state.driftVelocity !== 0 ? state.fermiVelocity / Math.abs(state.driftVelocity) : 0;

  return (
    <div className={`app ${panelsHidden ? 'panels-hidden' : ''}`}>
      <canvas ref={canvasRef} className="viewport" />

      <div className="top-bar">
        {modeSwitch}
        <button className="panel-toggle" onClick={() => setPanelsHidden((h) => !h)}>
          {panelsHidden ? 'show controls' : 'hide controls'}
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <strong>WebGL is required.</strong>
          <p style={{ marginBottom: 0 }}>{error}</p>
        </div>
      )}

      {/* ---------------- left: what is happening ---------------- */}
      <div className="panel panel-left">
        <div className="element-header">
          <div className="element-symbol" style={{ color: '#e08a4a' }}>
            {material.symbol}
          </div>
          <div className="element-meta">
            <div>
              <strong>{material.name}</strong>
            </div>
            <div>
              {material.structure === 'fcc' ? 'Face-centred cubic' : 'Diamond cubic'}, a ={' '}
              {material.latticeConstantA} A
            </div>
            <div style={{ textTransform: 'capitalize' }}>{material.conductionClass}</div>
          </div>
        </div>

        <div className="note accent" style={{ marginTop: 12 }}>
          {material.valenceNote}
        </div>

        <h3>Material</h3>
        <div className="material-grid">
          {CONDUCTION_MATERIALS.map((m) => (
            <button
              key={m.symbol}
              className={`material-cell ${m.symbol === settings.materialSymbol ? 'selected' : ''}`}
              onClick={() => update({ materialSymbol: m.symbol })}
            >
              <span className="material-symbol">{m.symbol}</span>
              <span className="material-class">{m.conductionClass.slice(0, 5)}</span>
            </button>
          ))}
        </div>

        <h3>The number nobody expects</h3>
        {state && isMetal && (
          <>
            <div className="readout big">
              <span>Electron speed (Fermi)</span>
              <span>{speed(state.fermiVelocity)}</span>
            </div>
            <div className="readout big">
              <span>Current speed (drift)</span>
              <span>{speed(state.driftVelocity)}</span>
            </div>
            <div className="readout big">
              <span>Signal speed (field)</span>
              <span>~{(0.66).toFixed(2)}c</span>
            </div>
            <div className="note">
              The electrons are already moving at over a million metres per
              second, in random directions, before any field is applied. Switching
              the field on biases that chaos by about one part in{' '}
              {velocityRatio > 0 ? sci(velocityRatio, 0) : '10 billion'}. An
              individual electron takes{' '}
              <strong>{duration(state.secondsToDriftOneMetre)}</strong> to travel
              one metre of wire.
              <br />
              <br />
              Yet the lamp lights instantly, because what actually travels is the
              electromagnetic field, at a good fraction of the speed of light.
              The electrons are water already filling the pipe, not water being
              pushed into an empty one.
            </div>
          </>
        )}

        {state && !isMetal && (
          <>
            <div className="note">
              {material.name} has no free electrons to speak of. Every valence
              electron is locked into a covalent bond, and reaching a conducting
              state means crossing a band gap of{' '}
              <strong>{material.bandGapEv} eV</strong>. At this temperature that
              leaves about <strong>{sci(state.carrierDensity)}</strong> carriers
              per cubic metre, against copper&apos;s 8.5e28. Conduction does not
              fail here because the electrons are slow. It fails because there
              are essentially none available.
            </div>
            <div className="readout big">
              <span>One carrier per</span>
              <span>{volumeLabel(state.volumePerCarrierM3)}</span>
            </div>
            <div className="note">
              Put concretely: to expect a single free electron you would need a
              cube of {material.name} about{' '}
              <strong>{cubeSideLabel(state.volumePerCarrierM3)}</strong> on a
              side. This box holds{' '}
              <strong>{sci(state.exactCarriersInBox, 1)}</strong> of one.
              {material.symbol === 'C' &&
                ' A block of diamond larger than the Earth would contain, on average, one conduction electron.'}
              <br />
              <br />
              The points drawn here are a token handful so the view is not empty.
              The real number is the one above.
            </div>
          </>
        )}

        <h3>Measured properties</h3>
        <div className="readout">
          <span>Carrier density</span>
          <span>{state ? `${sci(state.carrierDensity)} /m³` : '-'}</span>
        </div>
        <div className="readout">
          <span>Resistivity</span>
          <span>{state ? `${sci(state.resistivity)} Ωm` : '-'}</span>
        </div>
        {isMetal && (
          <>
            <div className="readout">
              <span>Time between collisions</span>
              <span>{state ? duration(state.relaxationTimeS) : '-'}</span>
            </div>
            <div className="readout">
              <span>Mean free path</span>
              <span>{state ? `${(state.meanFreePathM * 1e9).toFixed(1)} nm` : '-'}</span>
            </div>
            <div className="readout">
              <span>Ions passed between collisions</span>
              <span>
                {state
                  ? Math.round(state.meanFreePathM / (material.latticeConstantA * 1e-10))
                  : '-'}
              </span>
            </div>
          </>
        )}
        <div className="readout">
          <span>Band gap</span>
          <span>{material.bandGapEv > 0 ? `${material.bandGapEv} eV` : 'none (metal)'}</span>
        </div>

        <h3>Compared</h3>
        <div className="compare-table">
          <div className="compare-row compare-head">
            <span>Material</span>
            <span>Carriers /m&sup3;</span>
            <span>Conductivity</span>
          </div>
          {CONDUCTION_MATERIALS.map((m) => {
            const n = carrierDensity(m, settings.temperatureK);
            const sigma = conductivityAt(m, settings.temperatureK);
            const best = conductivityAt(CONDUCTION_MATERIALS[1], settings.temperatureK);
            return (
              <div
                key={m.symbol}
                className={`compare-row ${m.symbol === settings.materialSymbol ? 'active' : ''}`}
              >
                <span>{m.symbol}</span>
                <span>{sci(n, 1)}</span>
                <span className="compare-bar-cell">
                  <i
                    className="compare-bar"
                    style={{
                      width: `${Math.max(1, (Math.log10(Math.max(sigma, 1e-20)) + 20) / (Math.log10(best) + 20) * 100)}%`,
                    }}
                  />
                </span>
              </div>
            );
          })}
        </div>
        <div className="plot-caption">
          Bars are logarithmic. Silver to diamond spans about twenty-two orders of
          magnitude, which no linear bar chart could show.
        </div>
      </div>

      {/* ---------------- right: controls ---------------- */}
      <div className="panel panel-right">
        <h2>Conduction</h2>
        <p className="subtitle">
          A block of real crystal, drawn to scale. The spheres are ion cores: each
          atom&apos;s nucleus plus the electrons that stayed put. The moving points
          are the valence electrons the lattice gave up, which belong to no atom
          and roam the whole crystal.
        </p>

        <h3>Temperature</h3>
        <Slider
          label="Temperature"
          value={settings.temperatureK}
          min={20}
          max={800}
          step={1}
          format={(v) => `${v.toFixed(0)} K  (${(v - 273.15).toFixed(0)} C)`}
          onChange={(temperatureK) => update({ temperatureK })}
        />
        <div className="note">
          {isMetal
            ? 'Heating a metal makes it MORE resistive: hotter ions vibrate further, scatter electrons more often, and shorten the mean free path. A perfectly rigid lattice would not scatter electrons at all.'
            : 'Heating a semiconductor makes it LESS resistive, the opposite of a metal, because heat is what creates the carriers in the first place by lifting electrons across the gap.'}
        </div>

        <h3>Applied field</h3>
        {isMetal ? (
          <Slider
            label="Current density"
            value={Math.log10(settings.currentDensityAm2)}
            min={4}
            max={8}
            step={0.05}
            format={(v) => `${sci(Math.pow(10, v), 1)} A/m²`}
            onChange={(v) => update({ currentDensityAm2: Math.pow(10, v) })}
          />
        ) : (
          <>
            <Slider
              label="Electric field"
              value={Math.log10(settings.fieldVoltsPerMetre)}
              min={0}
              max={9}
              step={0.05}
              format={(v) => `${sci(Math.pow(10, v), 1)} V/m`}
              onChange={(v) => update({ fieldVoltsPerMetre: Math.pow(10, v) })}
            />
            <div className="note accent">
              Non-metals are driven by field rather than by current density.
              Asking for a household current density here would demand a field
              tens of times past dielectric breakdown, and the model would
              cheerfully report a drift velocity faster than light.
            </div>
          </>
        )}
        <div className="readout">
          <span>Applied field</span>
          <span>{state ? `${sci(state.realField)} V/m` : '-'}</span>
        </div>
        <div className="readout">
          <span>Current density</span>
          <span>{state ? `${sci(state.currentDensity)} A/m²` : '-'}</span>
        </div>
        <div className="readout">
          <span>Drift velocity</span>
          <span>
            {/* Printing a number here when the model has broken down would give
                it a credibility it has not earned. */}
            {!state
              ? '-'
              : state.validity.relativisticDrift
                ? 'not meaningful'
                : speed(state.driftVelocity)}
          </span>
        </div>
        <div className="readout">
          <span>Carrier speed {isMetal ? '(Fermi)' : '(thermal)'}</span>
          <span>{state ? speed(state.carrierSpeed) : '-'}</span>
        </div>

        {state && !state.validity.ok && (
          <div className="note warn">
            <strong>Outside the model&apos;s range.</strong> {state.validity.message}
            {material.conductionClass === 'insulator' && (
              <>
                <br />
                <br />
                For an insulator this is unavoidable rather than a bad choice of
                field. The Drude relations are inverted from bulk resistivity and
                carrier density, and with essentially no carriers they return a
                time between collisions of millions of years. The meaningful
                numbers for diamond are the carrier density and the band gap, not
                anything derived from a drift model.
              </>
            )}
          </div>
        )}

        <Slider
          label="Field amplification"
          value={settings.fieldAmplificationDecades}
          min={0}
          max={12}
          step={0.2}
          format={(v) => (v < 0.05 ? 'none (honest)' : `x${sci(Math.pow(10, v), 0)}`)}
          onChange={(fieldAmplificationDecades) => update({ fieldAmplificationDecades })}
        />
        {state && settings.fieldAmplificationDecades > 0.05 && (
          <>
            <div className="readout">
              <span>Simulated carrier speed</span>
              <span>{speed(state.simulatedMeanSpeed)}</span>
            </div>
            <div className="readout">
              <span>...against the real Fermi speed</span>
              <span>
                {state.carrierSpeed > 0
                  ? `${(state.simulatedMeanSpeed / state.carrierSpeed).toFixed(1)}x too fast`
                  : '-'}
              </span>
            </div>
          </>
        )}

        {state && (
          <div className="note accent">
            <strong>Changing this does not take effect instantly.</strong> Switch
            the field off and the electrons do not stop: each one keeps whatever
            velocity it has picked up until it happens to collide. The drift
            decays exponentially with the relaxation time, which is{' '}
            {duration(state.relaxationTimeS)} of simulated time, and at the
            current slow motion that is{' '}
            <strong>about {state.driftDecayRealSeconds.toFixed(0)} seconds</strong>{' '}
            of real time to fall to a third, and two or three times that to
            settle completely.
            <br />
            <br />
            That lag is not a rendering delay. It is the relaxation time itself,
            the one quantity the whole Drude model is built on, made watchable.
            It is also precisely why a metal has resistance: collisions keep
            wiping out the drift the field has built up.
          </div>
        )}

        {settings.fieldAmplificationDecades > 0.05 ? (
          <div className="note">
            The field is being exaggerated <strong>{sci(amplification, 0)} times</strong>.
            Real drift is about one ten-billionth of the Fermi velocity, so no
            honest simulation can show it: the mean velocity of{' '}
            {state?.electronCount ?? 0} electrons has statistical noise around{' '}
            {state ? speed(state.driftNoiseFloor) : '-'}, which is far larger than
            the real drift of {state ? speed(state.driftVelocity) : '-'}. To make
            drift visible at all you have to lie about the field, so the factor
            stays on screen while you do.
          </div>
        ) : (
          <div className="note accent">
            No exaggeration. The drift is real and therefore invisible: you are
            watching pure thermal chaos, which is exactly what a current in copper
            looks like up close. Raise the amplification to force the drift into
            view, and the factor required will tell you how small it really is.
          </div>
        )}

        <h3>Time</h3>
        <Slider
          label="Slow motion"
          value={Math.log10(settings.timeScale)}
          min={-16.5}
          max={-13.5}
          step={0.05}
          format={(v) => `${sci(1 / Math.pow(10, v), 0)}x slower`}
          onChange={(v) => update({ timeScale: Math.pow(10, v) })}
        />
        {state && (
          <>
            <div className="readout">
              <span>Simulated time elapsed</span>
              <span>{duration(state.simulatedElapsedS)}</span>
            </div>
            <div className="readout">
              <span>Light would cross this box in</span>
              <span>{duration(state.lightCrossingTimeS)}</span>
            </div>
            <div className="readout">
              <span>Collisions so far</span>
              <span>{state.scatterEvents.toLocaleString()}</span>
            </div>
          </>
        )}

        <h3>Sample</h3>
        <Slider
          label="Crystal length"
          value={settings.cellsX}
          min={6}
          max={20}
          step={1}
          format={(v) => `${v} unit cells`}
          onChange={(cellsX) => update({ cellsX: Math.round(cellsX) })}
        />
        {state && (
          <>
            <div className="readout">
              <span>Box</span>
              <span>
                {state.boxNm.x.toFixed(2)} x {state.boxNm.y.toFixed(2)} x{' '}
                {state.boxNm.z.toFixed(2)} nm
              </span>
            </div>
            <div className="readout">
              <span>Ion cores drawn</span>
              <span>{state.atomCount.toLocaleString()}</span>
            </div>
            <div className="readout">
              <span>Free electrons</span>
              <span>{state.electronCount.toLocaleString()}</span>
            </div>
            {isMetal && state.meanFreePathM * 1e9 > state.boxNm.x && (
              <div className="note">
                The mean free path ({(state.meanFreePathM * 1e9).toFixed(0)} nm) is
                longer than this whole box ({state.boxNm.x.toFixed(1)} nm), so a
                typical electron crosses the entire visible sample{' '}
                {Math.round((state.meanFreePathM * 1e9) / state.boxNm.x)} times
                before it scatters even once. Metals are far emptier than they look.
              </div>
            )}
          </>
        )}

        <h3>Show</h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.showLattice}
            onChange={(e) => update({ showLattice: e.target.checked })}
          />
          <span>
            Ion cores
            <div className="hint">Nuclei plus the bound electrons</div>
          </span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.showElectrons}
            onChange={(e) => update({ showElectrons: e.target.checked })}
          />
          <span>
            Free electrons
            <div className="hint">Flash white when they scatter</div>
          </span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.trackOneElectron}
            onChange={(e) => update({ trackOneElectron: e.target.checked })}
          />
          <span>
            Track one electron
            <div className="hint">Straight flights, abrupt collisions</div>
          </span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.showField}
            onChange={(e) => update({ showField: e.target.checked })}
          />
          <span>
            Field direction
            <div className="hint">Electrons drift against it</div>
          </span>
        </label>
      </div>

      <div className="bottom-bar">
        <div className="convergence" style={{ minWidth: 0 }}>
          {state ? `${sci(state.slowdownFactor, 0)}x slow motion` : ''}
        </div>
        <div className="exaggeration-badge true-scale">
          {state ? `${state.boxNm.x.toFixed(2)} nm of ${material.name}` : ''}
        </div>
        <div
          className={`exaggeration-badge ${
            settings.fieldAmplificationDecades > 0.05 ? 'exaggerated' : 'true-scale'
          }`}
        >
          {settings.fieldAmplificationDecades > 0.05
            ? `field exaggerated ${sci(amplification, 0)}x`
            : 'real field, drift invisible'}
        </div>
        <div className="convergence" style={{ minWidth: 0 }}>
          {state ? `light crosses in ${duration(state.lightCrossingTimeS)}` : ''}
        </div>
      </div>
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <div className="control">
      <div className="control-label">
        <span>{label}</span>
        <span className="control-value">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
