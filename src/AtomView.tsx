/**
 * The single-atom view: canvas, element picker and every control panel.
 *
 * STRUCTURE. React owns the interface state and the renderer owns the GPU. They
 * meet in exactly two places: effects push settings down into the scene with
 * `scene.setX(...)`, and the scene pushes derived numbers back up through a
 * single state listener. The 3D scene is never re-created by React; it is built
 * once on mount and mutated thereafter.
 *
 * That one-way flow matters. An earlier version had a panel reading orbitals
 * from renderer state while reading the element from React state, and the two
 * could disagree, showing one element's node structure beside another's radius.
 * Anything derived purely from the selected element should be derived from the
 * element, not fetched back out of the renderer.
 *
 * PANEL LAYOUT. Left panel is the atom: what it is, what has been measured, and
 * how far the model is from reality. Right panel is the render: how it is being
 * drawn, and every display choice made on the way. Keeping "facts about the
 * atom" and "choices about the picture" on opposite sides is deliberate, since
 * the distinction is the whole point of the project.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AtomScene, DEFAULT_VIEW, type AtomState, type ViewSettings } from './render/AtomScene';
import { DEFAULT_TRANSFER, type TransferSettings } from './render/RaymarchPass';
import { ScaleController } from './scale/ScaleController';
import { RadialPlot } from './ui/RadialPlot';
import { ModelAccuracyPlot } from './ui/ModelAccuracyPlot';
import { RealityCheck } from './ui/RealityCheck';
import {
  ELEMENTS,
  CATEGORY_COLOURS,
  elementByZ,
  neutronCount,
  tablePosition,
} from './physics/elements';
import { relativisticSummary, RELATIVISTIC_NOTES } from './physics/relativity';
import {
  electronConfiguration,
  formatConfiguration,
  isMadelungAnomaly,
} from './physics/aufbau';
import { groupBySubshell, type Orbital } from './physics/wavefunction';
import { nuclearRadiusFm } from './physics/nucleus';
import { BOHR_IN_FM, BOHR_IN_PM } from './physics/constants';
import type { QualityProfile } from './ui/device';
import './ui/styles.css';

export default function AtomView({ modeSwitch, profile }: { modeSwitch: React.ReactNode; profile: QualityProfile }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<AtomScene | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [z, setZ] = useState(29); // copper, the element this was built for
  const [view, setView] = useState<ViewSettings>({
    ...DEFAULT_VIEW,
    pointCount: profile.pointCount,
    hiddenSubshells: new Set<string>(),
  });
  // Seeded from the quality profile, not from the raw defaults. The scene sets
  // its own copy in its constructor, but this state is pushed back down through
  // an effect on mount and would otherwise overwrite it with the desktop values.
  const [transfer, setTransfer] = useState<TransferSettings>({
    ...DEFAULT_TRANSFER,
    steps: profile.steps,
  });
  const [exaggeration, setExaggeration] = useState(1);
  const [zoom, setZoom] = useState(0);
  const [state, setState] = useState<AtomState | null>(null);
  const [panelsHidden, setPanelsHidden] = useState(false);
  const [whitePoint, setWhitePoint] = useState(0);

  // ---- set up the renderer once ----
  useEffect(() => {
    if (!canvasRef.current) return;
    let scene: AtomScene;
    try {
      scene = new AtomScene(canvasRef.current, profile);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not create a WebGL2 context on this machine.',
      );
      return;
    }
    sceneRef.current = scene;
    // Dev-only handle for poking at the renderer from the console.
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__atom = scene;
    scene.setStateListener(setState);
    scene.setElement(z);
    scene.start();

    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      scene.setSize(canvas.clientWidth, canvas.clientHeight);
    };
    resize();
    // Observe the canvas rather than the window: on mobile the canvas shrinks
    // when the control sheet opens, which is a CSS change that never fires a
    // window resize event. Without this the atom stays centred behind the sheet.
    const canvasObserver = new ResizeObserver(resize);
    canvasObserver.observe(canvasRef.current);
    window.addEventListener('resize', resize);

    return () => {
      canvasObserver.disconnect();
      window.removeEventListener('resize', resize);
      scene.dispose();
      sceneRef.current = null;
    };
    // Intentionally runs once; element changes go through their own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setElement(z);
    setZoom(0);
  }, [z]);

  useEffect(() => {
    sceneRef.current?.setView(view);
  }, [view]);

  useEffect(() => {
    sceneRef.current?.setTransfer(transfer);
  }, [transfer]);

  useEffect(() => {
    sceneRef.current?.setNucleusExaggeration(exaggeration);
  }, [exaggeration]);

  const element = elementByZ(z);
  const relativity = relativisticSummary(z);
  const config = electronConfiguration(z);
  const neutrons = neutronCount(element);
  const nucleusFm = nuclearRadiusFm(element.massNumber);
  const extent = state?.extent ?? 10;
  const radius99 = state?.radius99 ?? 10;

  // Declared before the callbacks below, which list it as a dependency. A const
  // referenced in a dependency array is evaluated during render, so defining it
  // further down would hit the temporal dead zone and throw on first paint.
  const subshellGroups: Map<string, Orbital[]> = state
    ? groupBySubshell(state.orbitals)
    : new Map();
  const currentSubshells = [...subshellGroups.keys()];

  const updateView = useCallback((patch: Partial<ViewSettings>) => {
    setView((v) => ({ ...v, ...patch }));
  }, []);

  const toggleSubshell = useCallback((label: string) => {
    setView((v) => {
      const next = new Set(v.hiddenSubshells);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return { ...v, hiddenSubshells: next };
    });
  }, []);

  const showAllSubshells = useCallback(() => {
    setView((v) => ({ ...v, hiddenSubshells: new Set<string>() }));
  }, []);

  /**
   * Hide every subshell of the CURRENT element. Uses the live orbital list
   * rather than a fixed label set, since which subshells exist depends on the
   * element and hiding labels that are not present would silently persist into
   * the next element the user picks.
   */
  const hideAllSubshells = useCallback(() => {
    setView((v) => ({
      ...v,
      hiddenSubshells: new Set(currentSubshells),
    }));
  }, [currentSubshells]);

  const soloSubshell = useCallback(
    (label: string) => {
      setView((v) => ({
        ...v,
        hiddenSubshells: new Set(currentSubshells.filter((s) => s !== label)),
      }));
    },
    [currentSubshells],
  );

  const applyZoom = useCallback((t: number) => {
    setZoom(t);
    sceneRef.current?.setZoom(t);
  }, []);

  // How much bigger than reality the nucleus is currently drawn.
  const scaleBar = ScaleController.scaleBar(extent * 2);
  const trueScale = Math.abs(exaggeration - 1) < 1e-9;

  // Ratio of atom size to nucleus size, the number this whole tool exists to convey.
  const atomToNucleusRatio = (radius99 * BOHR_IN_FM) / nucleusFm;


  const voxelPm = ((2 * extent) / (state?.volumeResolution ?? 256)) * BOHR_IN_PM;
  // Mean radius of the innermost occupied orbital, to flag when it is unresolved.
  const innermost = state?.orbitals.length
    ? Math.min(...state.orbitals.map((o) => (3 * o.n * o.n - o.l * (o.l + 1)) / (2 * o.zEff)))
    : Infinity;
  const innerShellUnresolved = innermost * BOHR_IN_PM < voxelPm;

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
          <strong>WebGL2 is required.</strong>
          <p style={{ marginBottom: 0 }}>{error}</p>
        </div>
      )}

      {/* ---------------- left panel: the element ---------------- */}
      <div className="panel panel-left">
        <div className="element-header">
          <div
            className="element-symbol"
            style={{ color: CATEGORY_COLOURS[element.category] }}
          >
            {element.symbol}
          </div>
          <div className="element-meta">
            <div>
              <strong>{element.name}</strong>
            </div>
            <div>
              Z = {element.z} &middot; {element.symbol}-{element.massNumber}
            </div>
            <div>
              {element.z} protons &middot; {neutrons} neutrons &middot; {element.z} electrons
            </div>
          </div>
        </div>

        <h3>Element</h3>
        <div className="element-grid">
          {ELEMENTS.map((e) => {
            const { row, col, fBlock } = tablePosition(e.z);
            return (
              <button
                key={e.z}
                className={`element-cell ${e.z === z ? 'selected' : ''} ${fBlock ? 'f-block' : ''}`}
                style={{
                  gridRow: row,
                  gridColumn: col,
                  // Category colour as a left edge, so the blocks are readable
                  // without drowning the grid in colour.
                  boxShadow: `inset 2px 0 0 ${CATEGORY_COLOURS[e.category]}`,
                }}
                title={`${e.name} (Z=${e.z}) - ${e.category}`}
                onClick={() => setZ(e.z)}
              >
                {e.symbol}
              </button>
            );
          })}
          {/* Marker in the main table showing where the f-block was lifted from. */}
          <span className="f-block-marker" style={{ gridRow: 6, gridColumn: 3 }}>
            57-71
          </span>
          <span className="f-block-marker" style={{ gridRow: 7, gridColumn: 3 }}>
            89-103
          </span>
        </div>
        <div className="subtitle" style={{ marginTop: 8 }}>
          All 118 elements. Lanthanides and actinides are pulled out into their
          own rows, as they are in every printed table, because giving them real
          columns would make it fifteen wider.
        </div>

        <h3>Electron configuration</h3>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.7 }}>
          {formatConfiguration(config)}
        </div>
        {isMadelungAnomaly(z) && (
          <div className="note">
            This element breaks the Madelung filling rule. The simple n+l ordering
            predicts a different configuration; the one shown is what is measured.
            {z === 29 && ' That lone 4s electron outside a filled 3d shell is exactly why copper conducts so well.'}
          </div>
        )}

        <h3>Orbitals ({state?.orbitals.length ?? 0} occupied)</h3>
        <div className="orbital-actions">
          <button className="mini-action" onClick={showAllSubshells}>
            show all
          </button>
          <button className="mini-action" onClick={hideAllSubshells}>
            hide all
          </button>
          <span className="subtitle" style={{ margin: 0 }}>
            or click a row
          </span>
        </div>
        {[...subshellGroups.entries()].map(([label, orbs]) => {
          const electrons = orbs.reduce((s, o) => s + o.occupancy, 0);
          const capacity = 2 * (2 * orbs[0].l + 1);
          const hidden = view.hiddenSubshells.has(label);
          return (
            <div
              key={label}
              className={`orbital-row ${hidden ? 'hidden-shell' : ''}`}
              onClick={() => toggleSubshell(label)}
            >
              <span className="orbital-name">{label}</span>
              <span className="orbital-bar">
                <span
                  className="orbital-bar-fill"
                  style={{ width: `${(electrons / capacity) * 100}%` }}
                />
              </span>
              <span className="orbital-count">
                {electrons}/{capacity}
              </span>
              {/* Solo: the common case is wanting exactly one subshell, which
                  otherwise means hide-all then find the row again. */}
              <button
                className="solo-button"
                title={`Show only ${label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  soloSubshell(label);
                }}
              >
                only
              </button>
            </div>
          );
        })}

        <h3>Radial probability P(r)</h3>
        {state && (
          <RadialPlot
            orbitals={state.orbitals}
            extent={radius99 * 1.3}
            covalentRadiusPm={element.covalentRadiusPm}
          />
        )}
        <div className="note accent">
          P(r) is zero at the nucleus even for 1s, where the wavefunction itself
          peaks: a thin shell at small r contains almost no volume. The curve
          also never reaches zero on the right. The atom has no edge.
        </div>

        <h3>Measured properties</h3>
        <div className="readout">
          <span>Atomic weight</span>
          <span>{element.atomicWeight} u</span>
        </div>
        <div className="readout">
          <span>Covalent radius</span>
          <span>{element.covalentRadiusPm ? `${element.covalentRadiusPm} pm` : 'unknown'}</span>
        </div>
        <div className="readout">
          <span>Van der Waals radius</span>
          <span>{element.vdwRadiusPm ? `${element.vdwRadiusPm} pm` : 'unknown'}</span>
        </div>
        <div className="readout">
          <span>1st ionisation energy</span>
          <span>{element.ionisationEnergyEv ? `${element.ionisationEnergyEv} eV` : 'unknown'}</span>
        </div>
        <div className="readout">
          <span>Nuclear radius</span>
          <span>{nucleusFm.toFixed(2)} fm</span>
        </div>
        <div className="readout">
          <span>Radius holding 99%</span>
          <span>{(radius99 * BOHR_IN_PM).toFixed(1)} pm</span>
        </div>
        <div className="readout">
          <span>Render box</span>
          <span>&plusmn;{(extent * BOHR_IN_PM).toFixed(0)} pm</span>
        </div>
        <div className="readout">
          <span>Atom : nucleus</span>
          <span>{Math.round(atomToNucleusRatio).toLocaleString()} : 1</span>
        </div>
        <div className="readout">
          <span>Voxel size</span>
          <span>{voxelPm.toFixed(1)} pm</span>
        </div>
        {innerShellUnresolved && (
          <div className="note">
            The innermost shell of this atom is smaller than one voxel, so the
            core is drawn as an unresolved bright point. That is a limit of a
            uniform grid, not of the physics: no single grid can resolve a 1s
            shell and a valence shell at once when they differ in size by a
            factor of a hundred. The radial plot beside it still shows every
            shell exactly.
          </div>
        )}

        <h3>Checked against reality</h3>
        <RealityCheck element={element} />

        <h3>How well does this model do?</h3>
        <ModelAccuracyPlot selectedZ={z} relativistic={view.relativistic} />

      </div>

      {/* ---------------- right panel: how it is drawn ---------------- */}
      <div className="panel panel-right">
        <h2>Render</h2>
        <p className="subtitle">
          What you are looking at is the probability density |psi|&sup2;, computed
          from the wavefunctions. It is not a photograph, and it could not be:
          an atom is thousands of times smaller than a wavelength of visible light.
        </p>

        <h3>What to draw</h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={view.showVolume}
            onChange={(e) => updateView({ showVolume: e.target.checked })}
          />
          <span>
            Probability cloud
            <div className="hint">Volumetric |psi|&sup2;</div>
          </span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={view.showPoints}
            onChange={(e) => updateView({ showPoints: e.target.checked })}
          />
          <span>
            Sampled positions
            <div className="hint">
              {view.pointCount.toLocaleString()} independent measurements
            </div>
          </span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={view.showNucleons}
            onChange={(e) => updateView({ showNucleons: e.target.checked })}
          />
          <span>
            Nucleons
            <div className="hint">
              {z} protons, {neutrons} neutrons
            </div>
          </span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={view.showNuclearDensity}
            onChange={(e) => updateView({ showNuclearDensity: e.target.checked })}
          />
          <span>
            Nuclear charge surface
            <div className="hint">Woods-Saxon, from scattering data</div>
          </span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={view.showSlice}
            onChange={(e) => updateView({ showSlice: e.target.checked })}
          />
          <span>
            Slice plane
            <div className="hint">Density at a plane, not integrated through</div>
          </span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={view.showBohr}
            onChange={(e) => updateView({ showBohr: e.target.checked })}
          />
          <span>
            Bohr orbits
            <div className="hint">Historical model, known to be wrong</div>
          </span>
        </label>

        {view.showSlice && (
          <>
            <div className="segmented" style={{ marginTop: 8 }}>
              {(['x', 'y', 'z'] as const).map((axis) => (
                <button
                  key={axis}
                  className={view.sliceAxis === axis ? 'active' : ''}
                  onClick={() => updateView({ sliceAxis: axis })}
                >
                  {axis.toUpperCase()} plane
                </button>
              ))}
            </div>
            <Slider
              label="Slice position"
              value={view.sliceOffset}
              min={-1}
              max={1}
              step={0.01}
              format={(v) => `${(v * extent * BOHR_IN_PM).toFixed(0)} pm`}
              onChange={(sliceOffset) => updateView({ sliceOffset })}
            />
            <div className="note accent">
              The cloud view integrates along every ray, which is what makes it
              look solid but also blurs nodal surfaces together. A slice does not
              integrate: each pixel is the density at one point, so nodes show up
              as the sharp zeroes they really are.
            </div>
          </>
        )}

        {view.showBohr && (
          <div className="note">
            Bohr&apos;s 1913 orbits predicted hydrogen&apos;s spectrum correctly and
            earned a Nobel Prize, but electrons do not travel on paths. Compare the
            rings against the cloud: the n=1 ring does land where the 1s probability
            peaks, and everything else about the picture is wrong.
          </div>
        )}

        <h3>Occupancy of partly filled shells</h3>
        <div className="segmented">
          <button
            className={view.occupancyMode === 'hund' ? 'active' : ''}
            onClick={() => updateView({ occupancyMode: 'hund' })}
          >
            Hund (oriented)
          </button>
          <button
            className={view.occupancyMode === 'spherical' ? 'active' : ''}
            onClick={() => updateView({ occupancyMode: 'spherical' })}
          >
            Free atom
          </button>
        </div>
        <div className="note">
          {view.occupancyMode === 'hund'
            ? 'The chemistry-textbook picture: electrons occupy distinct px, py, pz lobes. Useful and intuitive, but it picks an arbitrary axis.'
            : 'A free atom drifting in space has no preferred direction, so its density is the spherical average. Less familiar, more truthful.'}
        </div>

        <h3>Contour surface</h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={transfer.isoMode}
            onChange={(e) => setTransfer((t) => ({ ...t, isoMode: e.target.checked }))}
          />
          <span>
            Draw as a solid surface
            <div className="hint">The orbital shape chemists draw</div>
          </span>
        </label>
        {transfer.isoMode && (
          <>
            <Slider
              label="Encloses"
              value={transfer.isoFraction}
              min={0.3}
              max={0.99}
              step={0.01}
              format={(v) => `${(v * 100).toFixed(0)}% of probability`}
              onChange={(isoFraction) => setTransfer((t) => ({ ...t, isoFraction }))}
            />
            <Slider
              label="Surface opacity"
              value={transfer.isoOpacity}
              min={0.15}
              max={1}
              step={0.05}
              format={(v) => (v >= 1 ? 'solid' : v.toFixed(2))}
              onChange={(isoOpacity) => setTransfer((t) => ({ ...t, isoOpacity }))}
            />
            {state && state.isoDensity > 0 && (
              <div className="readout">
                <span>Contour density</span>
                <span>{state.isoDensity.toExponential(2)} e/a&#8320;&sup3;</span>
              </div>
            )}
            <div className="note">
              The isovalue is <em>solved</em>, not chosen to look right: the
              density grid is integrated and the threshold bisected until the
              surface really does enclose the stated fraction of the electron
              probability. This is the surface meant by &ldquo;the shape of a 2p
              orbital&rdquo;, and it is a convention, not a wall. There is no
              boundary; the electron is simply outside it the remaining{' '}
              {((1 - transfer.isoFraction) * 100).toFixed(0)}% of the time.
            </div>
          </>
        )}

        <h3>Relativity</h3>
        <div className="readout">
          <span>1s electron speed</span>
          <span>{(relativity.innerSpeedFraction * 100).toFixed(1)}% of c</span>
        </div>
        <div className="readout">
          <span>Its mass gain</span>
          <span>+{relativity.massIncreasePercent.toFixed(1)}%</span>
        </div>
        <div className="readout">
          <span>1s contraction</span>
          <span>
            {relativity.innerContraction > 0.9995
              ? 'negligible'
              : `to ${(relativity.innerContraction * 100).toFixed(0)}%`}
          </span>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={view.relativistic}
            onChange={(e) => updateView({ relativistic: e.target.checked })}
          />
          <span>
            Apply contraction
            <div className="hint">Scales each orbital by 1/gamma</div>
          </span>
        </label>
        <div className="note">
          A 1s electron orbits at roughly Z/137 of light speed: 1/137 in
          hydrogen, {(relativity.innerSpeedFraction * 100).toFixed(0)}% here. At
          those speeds its mass rises measurably, and since orbital radius goes
          as 1/mass, the shell contracts.
          {RELATIVISTIC_NOTES[z] && (
            <>
              <br />
              <br />
              {RELATIVISTIC_NOTES[z]}
            </>
          )}
        </div>
        {view.relativistic && (
          <div className="note warn">
            This applies the <strong>direct</strong> effect only, and it is exact:
            given an orbital&apos;s speed, the contraction follows immediately.
            What it does <strong>not</strong> reproduce is the indirect effect. In
            a real heavy atom the contracted inner shells screen the nucleus
            better, so d and f orbitals <em>expand</em>, and the valence s
            contraction is mostly inherited from the core through orthogonality.
            Those are many-body consequences that need a self-consistent
            relativistic calculation. This is a Schrodinger atom with a mass
            correction, not a Dirac atom.
          </div>
        )}

        <h3>Transfer function</h3>
        <Slider
          label="Density floor"
          value={transfer.floor}
          min={0}
          max={0.92}
          step={0.005}
          format={(v) => `${((1 - v) * 10).toFixed(1)} decades`}
          onChange={(floor) => setTransfer((t) => ({ ...t, floor }))}
        />
        <Slider
          label="Curve (gamma)"
          value={transfer.gamma}
          min={0.4}
          max={4}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(gamma) => setTransfer((t) => ({ ...t, gamma }))}
        />
        <Slider
          label="Opacity"
          value={transfer.opacity}
          min={0.2}
          max={30}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(opacity) => setTransfer((t) => ({ ...t, opacity }))}
        />
        <Slider
          label="Exposure"
          value={transfer.exposure}
          min={0.1}
          max={4}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(exposure) => setTransfer((t) => ({ ...t, exposure }))}
        />
        <Slider
          label="White point"
          value={whitePoint}
          min={-1}
          max={9}
          step={0.1}
          format={(v) =>
            Math.abs(v) < 0.05
              ? 'valence shell'
              : v > 0
                ? `+${v.toFixed(1)} dec (core)`
                : `${v.toFixed(1)} dec (tail)`
          }
          onChange={(v) => {
            setWhitePoint(v);
            sceneRef.current?.setWhitePoint(v);
          }}
        />
        <Slider
          label="Ray steps"
          value={transfer.steps}
          min={64}
          max={768}
          step={32}
          format={(v) => v.toFixed(0)}
          onChange={(steps) => setTransfer((t) => ({ ...t, steps }))}
        />
        <div className="note">
          Electron density spans eight to ten orders of magnitude, spiking at the
          nucleus: in copper the core is roughly ten million times denser than
          the 4s cloud. Nothing can display that range at once, so the render
          exposes for the valence shell and lets the core saturate, exactly as a
          camera pointed at a lit window does. Drag the white point down to
          re-expose onto the inner shells. These are display choices, not
          properties of the atom.
        </div>

        <h3>Colour</h3>
        <div className="segmented">
          {['Glow', 'Depth', 'Ember'].map((name, i) => (
            <button
              key={name}
              className={transfer.palette === i ? 'active' : ''}
              onClick={() => setTransfer((t) => ({ ...t, palette: i }))}
            >
              {name}
            </button>
          ))}
        </div>
        <label className="toggle" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={transfer.phaseMode}
            onChange={(e) => setTransfer((t) => ({ ...t, phaseMode: e.target.checked }))}
          />
          <span>
            Colour by phase
            <div className="hint">Sign of psi: amber positive, teal negative</div>
          </span>
        </label>
        {transfer.phaseMode && (
          <div className="note">
            The sign of the wavefunction is invisible in a single atom, because
            density is |psi|&sup2;. It becomes decisive when atoms meet: matching
            signs bond, opposing signs push apart. Hide all but one subshell to
            read the phase cleanly.
          </div>
        )}

        {view.showPoints && (
          <>
            <h3>Sampled positions</h3>
            <Slider
              label="Point count"
              value={view.pointCount}
              min={20000}
              max={1000000}
              step={20000}
              format={(v) => v.toLocaleString()}
              onChange={(pointCount) => updateView({ pointCount })}
            />
            <Slider
              label="Point size"
              value={view.pointSize}
              min={0.5}
              max={5}
              step={0.1}
              format={(v) => v.toFixed(1)}
              onChange={(pointSize) => updateView({ pointSize })}
            />
            <Slider
              label="Brightness"
              value={view.pointOpacity}
              min={0.005}
              max={0.6}
              step={0.005}
              format={(v) => v.toFixed(3)}
              onChange={(pointOpacity) => updateView({ pointOpacity })}
            />
            <div className="note">
              Every dot is one hypothetical answer to &ldquo;where is the
              electron?&rdquo;. They are not a path and have no order. Read them as
              many measurements on many identically prepared atoms.
            </div>
          </>
        )}

        <h3>Nucleus scale</h3>
        <Slider
          label="Exaggeration"
          value={Math.log10(exaggeration)}
          min={0}
          max={5}
          step={0.02}
          format={() => (trueScale ? 'true scale' : `${Math.round(exaggeration).toLocaleString()}x`)}
          onChange={(v) => setExaggeration(Math.pow(10, v))}
        />
        <button
          className="action"
          onClick={() => setExaggeration(1)}
          style={{ marginBottom: 6 }}
        >
          Reset to true scale
        </button>
        <button
          className="action"
          onClick={() =>
            setExaggeration(ScaleController.exaggerationForVisibility(nucleusFm, extent))
          }
        >
          Inflate until visible
        </button>
        <div className="note">
          At true scale the nucleus is about{' '}
          {Math.round(atomToNucleusRatio).toLocaleString()} times smaller than the
          cloud around it, so it occupies less than one pixel and vanishes. That
          absence is the accurate picture. Inflating it is a lie told for
          legibility, so the factor stays on screen whenever it is not 1.
        </div>
      </div>

      {/* ---------------- bottom bar ---------------- */}
      <div className="bottom-bar">
        <div className="scale-bar-wrap">
          <div
            className="scale-bar-line"
            style={{ width: `${Math.min((scaleBar.length / (extent * 2)) * 220, 220)}px` }}
          />
          <div className="scale-bar-label">{scaleBar.label}</div>
        </div>

        <div className="zoom-control">
          <span className="zoom-label">cloud</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
          />
          <span className="zoom-label">nucleus</span>
        </div>

        <div
          className={`exaggeration-badge ${trueScale ? 'true-scale' : 'exaggerated'}`}
          title="How much larger than reality the nucleus is drawn"
        >
          {trueScale ? 'true scale' : `nucleus ${Math.round(exaggeration).toLocaleString()}x too large`}
        </div>

        <div className="convergence">
          {state && state.accumulatedFrames < 240
            ? `converging ${state.accumulatedFrames}`
            : 'converged'}
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
