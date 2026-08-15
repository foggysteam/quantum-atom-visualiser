/**
 * Application shell: mode switching, HUD scale, responsive breakpoints and the
 * mobile control sheet.
 *
 * Almost everything here exists because the interface is scaled with CSS
 * `zoom`, which has two behaviours that are easy to get backwards and produce
 * baffling symptoms:
 *
 *  - Percentages inside a zoomed element need NO compensation; they already
 *    resolve against the containing block in the zoomed coordinate system.
 *    Dividing them by the scale makes panels shrink and centred bars drift.
 *  - Absolute lengths and viewport units (px, vh) DO get scaled, so anything
 *    that must stay a constant size on screen has to be divided by the scale.
 *
 * Media queries are also unusable here, because they see the raw viewport width
 * while the layout is zoomed: at 1.75x on a 1274px window the panels occupy
 * 1084px and the layout is effectively narrow, but a 1100px media query never
 * fires. Breakpoints are therefore computed from `innerWidth / uiScale` and
 * published as data attributes, and both floating bars are measured with a
 * ResizeObserver rather than estimated.
 */

import { useEffect, useState } from 'react';
import AtomView from './AtomView';
import ConductionView from './ConductionView';
import { detectQuality, QUALITY_PROFILES, type Quality } from './ui/device';
import './ui/styles.css';

export type Mode = 'atom' | 'conduction';
type MobileTab = 'element' | 'render';

/** HUD scale options. Applied as `zoom` on the panels; see styles.css. */
const UI_SCALES = [
  { label: 'S', value: 1 },
  { label: 'M', value: 1.2 },
  { label: 'L', value: 1.45 },
  { label: 'XL', value: 1.75 },
] as const;

const SCALE_STORAGE_KEY = 'atom-visualiser:ui-scale';
const NOTICE_STORAGE_KEY = 'atom-visualiser:mobile-notice-seen';

/** Below this effective width the side-by-side panels cannot work at all. */
const MOBILE_BREAKPOINT = 700;

function loadScale(): number {
  const stored = Number(localStorage.getItem(SCALE_STORAGE_KEY));
  return UI_SCALES.some((s) => s.value === stored) ? stored : 1;
}

/**
 * Mode switcher and shared chrome.
 *
 * The two views deliberately mount as separate components with separate canvas
 * elements, and only the active one exists at a time. A canvas hands out
 * exactly one WebGL context for its lifetime, so sharing a single canvas
 * between the two renderers would leave the second one attached to a context
 * the first had already disposed. Unmounting gives the incoming view a genuinely
 * fresh canvas.
 */
export default function App() {
  const [mode, setMode] = useState<Mode>('atom');
  const [uiScale, setUiScale] = useState<number>(loadScale);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('render');
  const [sheetOpen, setSheetOpen] = useState(false);

  // Quality is fixed at mount: the volume resolution is baked into the render
  // target's size, so changing it means rebuilding the whole scene.
  const [quality] = useState<Quality>(detectQuality);
  const profile = QUALITY_PROFILES[quality];

  const [noticeDismissed, setNoticeDismissed] = useState(
    () => localStorage.getItem(NOTICE_STORAGE_KEY) === '1',
  );

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
    localStorage.setItem(SCALE_STORAGE_KEY, String(uiScale));
  }, [uiScale]);

  /*
   * Responsive breakpoints have to be driven from JS rather than CSS media
   * queries, because media queries see the RAW viewport width while the HUD is
   * zoomed. At XL on a 1274px window the panels occupy 1084px and the layout is
   * effectively narrow, but `@media (max-width: 1100px)` never fires because
   * 1274 > 1100. Dividing by the scale gives the width the layout actually has.
   */
  useEffect(() => {
    const apply = () => {
      const effective = window.innerWidth / uiScale;
      const root = document.documentElement;
      const mobile = effective < MOBILE_BREAKPOINT;
      root.toggleAttribute('data-narrow', effective < 1100 && !mobile);
      root.toggleAttribute('data-tight', effective < 820 && !mobile);
      root.toggleAttribute('data-mobile', mobile);
      setIsMobile(mobile);
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [uiScale]);

  useEffect(() => {
    document.documentElement.setAttribute('data-mobile-tab', mobileTab);
    document.documentElement.setAttribute('data-sheet', sheetOpen ? 'open' : 'closed');
  }, [mobileTab, sheetOpen]);

  /*
   * Publish the bars' real heights so the panels can sit clear of them.
   *
   * Measured rather than assumed: a bar's height depends on the HUD scale AND on
   * whether its buttons wrap, which they do on a narrow window. A hardcoded
   * estimate was right at wide widths and overlapped the panels at narrow ones.
   */
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      for (const [selector, variable] of [
        ['.top-bar', '--top-bar-height'],
        ['.bottom-bar', '--bottom-bar-height'],
        ['.mobile-sheet-bar', '--sheet-bar-height'],
      ] as const) {
        const el = document.querySelector(selector);
        if (el) {
          document.documentElement.style.setProperty(
            variable,
            `${el.getBoundingClientRect().height}px`,
          );
        }
      }
    });

    for (const selector of ['.top-bar', '.bottom-bar', '.mobile-sheet-bar']) {
      const el = document.querySelector(selector);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [mode, uiScale, isMobile]);

  const dismissNotice = () => {
    localStorage.setItem(NOTICE_STORAGE_KEY, '1');
    setNoticeDismissed(true);
  };

  const modeSwitch = (
    <>
      <div className="mode-switch">
        <button
          className={mode === 'atom' ? 'active' : ''}
          onClick={() => setMode('atom')}
        >
          Single atom
        </button>
        <button
          className={mode === 'conduction' ? 'active' : ''}
          onClick={() => setMode('conduction')}
        >
          Conduction
        </button>
      </div>

      <div className="mode-switch size-switch" title="Control and text size">
        {UI_SCALES.map((s) => (
          <button
            key={s.label}
            className={uiScale === s.value ? 'active' : ''}
            onClick={() => setUiScale(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </>
  );

  const showNotice = isMobile && !noticeDismissed;

  return (
    <>
      {mode === 'atom' ? (
        <AtomView modeSwitch={modeSwitch} profile={profile} />
      ) : (
        <ConductionView modeSwitch={modeSwitch} profile={profile} />
      )}

      {isMobile && (
        <div className="mobile-sheet-bar">
          <button
            className={sheetOpen && mobileTab === 'element' ? 'active' : ''}
            onClick={() => {
              setMobileTab('element');
              setSheetOpen(true);
            }}
          >
            {mode === 'atom' ? 'Element' : 'Material'}
          </button>
          <button
            className={sheetOpen && mobileTab === 'render' ? 'active' : ''}
            onClick={() => {
              setMobileTab('render');
              setSheetOpen(true);
            }}
          >
            Controls
          </button>
          <button
            className="sheet-toggle"
            onClick={() => setSheetOpen((o) => !o)}
            title={sheetOpen ? 'Collapse' : 'Expand'}
          >
            {sheetOpen ? 'close' : 'open'}
          </button>
        </div>
      )}

      {showNotice && (
        <>
          <div className="mobile-scrim" onClick={dismissNotice} />
          <div className="mobile-notice">
            <h3>Built for a desktop</h3>
            <p>
              This renders atoms by raymarching a volumetric probability cloud on
              the GPU, which is genuinely demanding. It will run here, but a
              desktop with a dedicated graphics card gives a far sharper image
              and a much smoother frame rate.
            </p>
            <p>
              Quality has been reduced automatically: a smaller density volume,
              fewer rays per pixel and a lower resolution. The physics is
              unchanged, only the sharpness of the picture.
            </p>
            <button onClick={dismissNotice}>Continue anyway</button>
          </div>
        </>
      )}
    </>
  );
}
