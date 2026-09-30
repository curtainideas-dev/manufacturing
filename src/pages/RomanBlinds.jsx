/**
 * RomanBlinds — /romanblinds
 *
 * A calculator, not a record. Type a finished size, get the fabric to cut and
 * the marks to put on it, print it, make the blind.
 *
 * Standalone on purpose, and outside App entirely. Nothing here touches
 * Supabase: there is no job, window or BOM behind a roman blind yet, and wiring
 * one in before the arithmetic has been trusted on the bench would mean
 * migrating a table to find out a rule was wrong. The maths lives in
 * romanBlind.js; this page only asks and shows.
 *
 * Centimetres on the page, because that is how the workroom measures a roman
 * blind. The engine works in millimetres like the rest of the app; the
 * conversion happens at the boxes and nowhere else.
 *
 * The ASSUMPTIONS are the workroom's standing numbers. They sit on the page,
 * editable, and they stick — saved in the browser — because a bench that has to
 * re-enter its own standards every morning stops using the page. They are also
 * printed on every sheet: an answer whose assumptions are editable and
 * invisible is an answer nobody can check later.
 */

import { useState, useEffect, useMemo } from 'react'
import {
  calcRomanBlind, DEFAULT_ASSUMPTIONS, DOWEL_TYPES, cm, cmToMm,
} from '../lib/romanBlind'
import { printRomanBlindSheet } from '../lib/exportRomanBlind'
import RomanBlindDiagram from '../components/RomanBlindDiagram'
import { useToast, ToastContainer } from '../hooks/useToast.jsx'
import { ChevronLeftIcon, InfoIcon } from '../components/Icons'

/* --------------------------------------------------------------------------
 * The assumptions, as fields — one list for the order, the labels and the
 * descriptions. `count` fields are a number of things, not centimetres.
 * ------------------------------------------------------------------------ */
const ASSUMPTION_FIELDS = [
  {
    key: 'headboardFaceMm', label: 'Headboard face',
    hint: 'Depth of the front face of the headboard, covered by the fabric. Part of the finished drop.',
  },
  {
    key: 'headboardFoldMm', label: 'Headboard fold allowance',
    hint: 'Fabric folded over the top of the headboard and fixed down. Not part of the finished drop.',
  },
  {
    key: 'topPanelExtraMm', label: 'Top panel allowance',
    hint: 'How much longer the first panel is than a main panel, to clear the mechanisms under the headboard.',
  },
  {
    key: 'bottomPanelExtraMm', label: 'Bottom panel allowance',
    hint: 'Added to half a main panel to give the bottom panel.',
  },
  {
    key: 'hemMm', label: 'Bottom hem allowance',
    hint: 'Fabric turned up to hem the bottom edge.',
  },
  {
    key: 'sideAllowanceMm', label: 'Side allowance, each side',
    hint: 'Added to each side of the finished width, so the cut width adds it twice.',
  },
  {
    key: 'dowelDeductionMm', label: 'Dowel deduction',
    hint: 'Dowels are cut this much shorter than the finished width.',
  },
  {
    key: 'timberPocketMm', label: 'Timber pocket width',
    hint: 'Total fabric one timber dowel pocket uses.',
  },
  {
    key: 'aluminiumPocketMm', label: 'Aluminium pocket width',
    hint: 'Total fabric one aluminium rod pocket uses.',
  },
  {
    key: 'panelMinMm', label: 'Main panel drop, min',
    hint: 'The smallest a main panel may be. Main panels exclude the first and bottom panels.',
  },
  {
    key: 'panelMaxMm', label: 'Main panel drop, max',
    hint: 'The largest a main panel may be.',
  },
  {
    key: 'minMainPanels', label: 'Minimum main panels', count: true,
    hint: 'The fewest main panels a blind can have, not counting the first and bottom panels.',
  },
]

// v2: the assumptions changed shape when the calculation was confirmed against
// the workroom's own rules, and the v1 keys mean different things.
const STORAGE_KEY = 'curtainideas.romanblind.assumptions.v2'

/** A default as it should appear in its box: 100mm -> "10", 32mm -> "3.2". */
const displayDefault = (f) =>
  f.count ? String(DEFAULT_ASSUMPTIONS[f.key]) : String(DEFAULT_ASSUMPTIONS[f.key] / 10)

const defaultStrings = () =>
  Object.fromEntries(ASSUMPTION_FIELDS.map(f => [f.key, displayDefault(f)]))

/**
 * The saved assumptions, as typed, or the defaults. Every field starts from its
 * default and is only then overwritten, so an assumption added after someone
 * last used the page appears at its default rather than as an empty box.
 */
function loadAssumptions() {
  const out = defaultStrings()
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    ASSUMPTION_FIELDS.forEach(f => {
      if (typeof saved[f.key] === 'string' && saved[f.key] !== '') out[f.key] = saved[f.key]
    })
  } catch {
    // Private windows, cleared site data, blocked storage: the page works, it
    // just won't remember.
  }
  return out
}

/* A number box. Holds the raw string, so a half-typed "3." on the way to "3.2"
 * isn't fought with; converted only when the blind is worked out. */
function NumField({ label, hint, value, onChange, suffix = 'cm' }) {
  return (
    <div className="field" style={{ marginBottom: 12 }}>
      <label className="field-label">{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          className="field-input"
          type="number"
          inputMode="decimal"
          step="0.1"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ paddingRight: 42 }}
        />
        {suffix && (
          <span style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: 12, color: 'var(--warm-300)', pointerEvents: 'none',
          }}>
            {suffix}
          </span>
        )}
      </div>
      {hint && (
        <div style={{ fontSize: 11.5, color: 'var(--warm-300)', lineHeight: 1.4, marginTop: 5 }}>
          {hint}
        </div>
      )}
    </div>
  )
}

const Sub = ({ children }) => (
  <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>{children}</div>
)

const B = ({ children }) => <b style={{ color: 'var(--ink)' }}>{children}</b>

const optionLabel = (o) => `${o.mainPanels} main panels · ${cm(o.panelMm)}`

export default function RomanBlinds() {
  const [reference, setReference] = useState('')
  const [width, setWidth]         = useState('')
  const [drop, setDrop]           = useState('')
  const [type, setType]           = useState('timber')
  const [mainPanels, setMainPanels] = useState('')   // '' = solve for it
  const [assumptions, setAssumptions] = useState(loadAssumptions)
  const [showAssumptions, setShowAssumptions] = useState(false)
  const [printing, setPrinting]   = useState(false)
  const { toasts, showToast } = useToast()

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(assumptions)) } catch { /* not fatal */ }
  }, [assumptions])

  // The assumptions in engine units. A box left empty or mid-edit calculates at
  // its default rather than as zero.
  const a = useMemo(() => {
    const out = {}
    ASSUMPTION_FIELDS.forEach(f => {
      const v = f.count ? Math.round(Number(assumptions[f.key])) : cmToMm(assumptions[f.key])
      out[f.key] = Number.isFinite(v) && assumptions[f.key] !== '' ? v : DEFAULT_ASSUMPTIONS[f.key]
    })
    return out
  }, [assumptions])

  const result = useMemo(
    () => calcRomanBlind({
      widthMm:    cmToMm(width),
      dropMm:     cmToMm(drop),
      dowelType:  type,
      mainPanels: mainPanels || undefined,
    }, a),
    [width, drop, type, mainPanels, a],
  )

  const setA = (key, value) => setAssumptions(s => ({ ...s, [key]: value }))

  const resetAssumptions = () => {
    setAssumptions(defaultStrings())
    showToast('Assumptions back to the defaults')
  }

  const print = async () => {
    setPrinting(true)
    try {
      await printRomanBlindSheet(result, { reference: reference.trim() })
    } catch (err) {
      showToast(String(err?.message || err), 'error')
    } finally {
      setPrinting(false)
    }
  }

  const started = width !== '' || drop !== ''
  const pocketMm = type === 'aluminium' ? a.aluminiumPocketMm : a.timberPocketMm

  return (
    <div className="app">
      <div className="header">
        <button className="header-back" onClick={() => { window.location.href = '/' }}>
          <ChevronLeftIcon size={18} />
          Home
        </button>
        <div className="header-title">Roman Blinds</div>
        <div className="header-actions">
          <button
            className="btn btn-primary btn-sm"
            disabled={!result.ok || printing}
            onClick={print}
            style={!result.ok ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          >
            {printing ? 'Printing…' : 'Print'}
          </button>
        </div>
      </div>

      <div className="scroll-area">
        <div style={{ padding: 16 }}>

          {/* ---------------- The blind ---------------- */}
          <div className="card">
            <div className="card-body">
              <div className="grid-2">
                <NumField
                  label="Finished width" value={width} onChange={setWidth}
                  hint="Width of the blind as it hangs."
                />
                <NumField
                  label="Finished drop" value={drop} onChange={setDrop}
                  hint="From the top of the headboard to the hemmed bottom edge."
                />
              </div>

              <div className="field">
                <label className="field-label">Dowel type</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {DOWEL_TYPES.map(t => (
                    <button
                      key={t.code}
                      className={`cost-type-btn${type === t.code ? ' selected' : ''}`}
                      onClick={() => setType(t.code)}
                      style={{ flex: 1, padding: '10px 6px', fontSize: 12 }}
                    >
                      {t.label}
                      <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                        {cm(a[t.pocketKey])}cm pocket
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-label">Reference (optional)</label>
                <input
                  className="field-input"
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  placeholder="Job number, room, customer — printed on the sheet"
                />
              </div>
            </div>
          </div>

          {/* ---------------- Assumptions ---------------- */}
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1 }}>Assumptions</span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowAssumptions(s => !s)}
              style={{ textTransform: 'none', letterSpacing: 0 }}
            >
              {showAssumptions ? 'Hide' : 'Change'}
            </button>
          </div>

          <div className="card">
            <div className="card-body">
              {/* Always visible, open or closed: folding them away entirely would
                * hide why two blinds of the same size came out different. */}
              <div style={{ fontSize: 12, color: 'var(--warm-300)', lineHeight: 1.6 }}>
                Headboard face <B>{cm(a.headboardFaceMm)}</B>, fold <B>{cm(a.headboardFoldMm)}</B>
                {' · '}top panel <B>+{cm(a.topPanelExtraMm)}</B>
                {' · '}bottom panel <B>½ + {cm(a.bottomPanelExtraMm)}</B>
                {' · '}hem <B>{cm(a.hemMm)}</B>
                {' · '}sides <B>{cm(a.sideAllowanceMm)}</B> each
                {' · '}main panels <B>{cm(a.panelMinMm)}–{cm(a.panelMaxMm)}</B>, at least <B>{a.minMainPanels}</B>
                {' · '}pockets <B>{cm(a.timberPocketMm)}</B> timber, <B>{cm(a.aluminiumPocketMm)}</B> aluminium
                {' · '}dowels <B>−{cm(a.dowelDeductionMm)}</B>
              </div>

              {showAssumptions && (
                <>
                  <div className="divider" />
                  <div className="grid-2">
                    {ASSUMPTION_FIELDS.map(f => (
                      <NumField
                        key={f.key}
                        label={f.label}
                        hint={f.hint}
                        value={assumptions[f.key]}
                        onChange={v => setA(f.key, v)}
                        suffix={f.count ? '' : 'cm'}
                      />
                    ))}
                  </div>
                  <button className="btn btn-secondary btn-block btn-sm" onClick={resetAssumptions}>
                    Reset to the defaults
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ---------------- No answer yet ---------------- */}
          {!result.ok && started && (
            <>
              <div className="section-title">Cannot work it out yet</div>
              <div className="card">
                <div className="card-body">
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: 14, color: 'var(--ink)', marginBottom: 8 }}>{e}</div>
                  ))}
                  {!!result.options?.length && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {result.options.map(o => (
                        <button
                          key={o.mainPanels}
                          className="pill pill-orange"
                          onClick={() => setMainPanels(String(o.mainPanels))}
                          style={{ border: 'none', cursor: 'pointer', fontSize: 12, padding: '5px 12px' }}
                        >
                          {optionLabel(o)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {result.ok && (
            <>
              {/* ---------------- Cut ---------------- */}
              <div className="section-title">Cut</div>
              <div className="card">
                <div className="summary-grid" style={{ padding: 14 }}>
                  <div className="summary-card">
                    <div className="summary-val">{cm(result.cutWidthMm)}</div>
                    <div className="summary-lbl">Cut width (cm)</div>
                  </div>
                  <div className="summary-card">
                    <div className="summary-val">{cm(result.cutDropMm)}</div>
                    <div className="summary-lbl">Cut drop (cm)</div>
                  </div>
                </div>

                {/* Both cut figures spelled out as sums. They are the numbers
                  * that ruin fabric when they're wrong, and the only way to check
                  * one at the table is to see what went into it. */}
                <div style={{ padding: '0 14px 14px' }}>
                  <div style={{
                    background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
                    padding: '10px 12px', fontSize: 12.5, lineHeight: 1.7, color: 'var(--warm-300)',
                  }}>
                    <div>
                      <B>{cm(result.cutWidthMm)}</B> = {cm(result.widthMm)} width + 2 × {cm(a.sideAllowanceMm)} sides
                    </div>
                    <div>
                      {/* No face here: the drop is measured from the top of the
                        * headboard, so the face is already inside it. */}
                      <B>{cm(result.cutDropMm)}</B> = {cm(a.headboardFoldMm)} headboard fold
                      {' + '}{cm(result.dropMm)} drop
                      {' + '}{result.dowels} × {cm(result.pocketMm)} pockets
                      {' + '}{cm(a.hemMm)} hem
                    </div>
                  </div>
                </div>
              </div>

              {/* ---------------- Panels ---------------- */}
              <div className="section-title">Panels</div>
              <div className="card">
                <div className="summary-grid" style={{ padding: 14 }}>
                  <div className="summary-card">
                    <div className="summary-val">{result.mainPanels}</div>
                    <div className="summary-lbl">Main panels</div>
                    <Sub>excludes the first and bottom panels</Sub>
                  </div>
                  <div className="summary-card">
                    <div className="summary-val">{cm(result.panelMm)}</div>
                    <div className="summary-lbl">Main panel drop (cm)</div>
                  </div>
                  <div className="summary-card">
                    <div className="summary-val">{cm(result.firstPanelMm)}</div>
                    <div className="summary-lbl">First panel (cm)</div>
                    {/* The real difference, not the allowance: the first panel
                      * takes the rounding so every main panel can be identical,
                      * and a label claiming +10.0 over a panel that is +9.8
                      * would be a wrong number on a workshop screen. */}
                    <Sub>
                      main panel + {cm(result.firstPanelMm - result.panelMm)}
                      {result.firstPanelMm - result.panelMm !== a.topPanelExtraMm && ' (takes the rounding)'}
                    </Sub>
                  </div>
                  <div className="summary-card">
                    <div className="summary-val">{cm(result.bottomPanelMm)}</div>
                    <div className="summary-lbl">Bottom panel (cm)</div>
                    <Sub>½ main panel + {cm(a.bottomPanelExtraMm)}</Sub>
                  </div>
                </div>

                <div style={{ padding: '0 14px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--warm-300)', marginBottom: 8 }}>
                    Main panel options
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {result.options.map(o => {
                      const active = o.mainPanels === result.mainPanels
                      return (
                        <button
                          key={o.mainPanels}
                          onClick={() => setMainPanels(active && !result.forced ? '' : String(o.mainPanels))}
                          className={`pill ${active ? 'pill-green' : 'pill-blue'}`}
                          style={{
                            border: active ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                            cursor: 'pointer', fontSize: 12, padding: '5px 12px',
                          }}
                        >
                          {optionLabel(o)}{!o.inRange && ' ⚠'}
                        </button>
                      )
                    })}
                    {result.forced && (
                      <button
                        className="pill"
                        onClick={() => setMainPanels('')}
                        style={{ background: 'var(--warm-100)', color: 'var(--warm-300)', border: 'none', cursor: 'pointer', fontSize: 12, padding: '5px 12px' }}
                      >
                        back to automatic
                      </button>
                    )}
                  </div>
                  {result.forced && (
                    <div style={{ fontSize: 11.5, color: 'var(--warning)', marginTop: 8 }}>
                      {result.mainPanels} main panels chosen by hand — not the closest to the middle of the range.
                    </div>
                  )}
                </div>
              </div>

              {!!result.warnings.length && (
                <div className="card" style={{ marginTop: 12, background: 'var(--warning-bg)', borderColor: '#f5d0a9' }}>
                  <div className="card-body" style={{ display: 'flex', gap: 10 }}>
                    <InfoIcon size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: 13, color: 'var(--warning)', lineHeight: 1.5 }}>
                      {result.warnings.map((w, i) => <div key={i} style={{ marginBottom: 4 }}>{w}</div>)}
                    </div>
                  </div>
                </div>
              )}

              {/* ---------------- Diagram ---------------- */}
              <div className="section-title">The cut fabric, marked</div>
              <div className="card">
                <div className="card-body">
                  <RomanBlindDiagram result={result} />
                </div>
              </div>

              {/* ---------------- Marks ---------------- */}
              <div className="section-title">Marks, from the top cut edge (cm)</div>
              <div className="card">
                {/* Scrolls sideways rather than dropping a column on a phone —
                  * the card clips what overflows it. */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 460, borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--accent-dark)' }}>
                        {['', 'Top', 'Fold', 'Bottom', 'Panel above'].map((h, i) => (
                          <th key={i} style={{
                            padding: '9px 10px', textAlign: i === 0 ? 'left' : 'right',
                            fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
                            letterSpacing: '0.06em', color: '#fff', whiteSpace: 'nowrap',
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <RefRow label="Top of headboard" value={result.headboardTopMm} note={`${cm(a.headboardFoldMm)} fold above · drop starts`} />
                      <RefRow label="Underside of headboard" value={result.headboardLineMm} note={`${cm(a.headboardFaceMm)} face above`} />
                      {result.pockets.map(p => (
                        <tr key={p.n} style={{ borderTop: '1px solid var(--warm-200)' }}>
                          <td style={td({ bold: true, left: true })}>Pocket {p.n}</td>
                          <td style={td()}>{cm(p.topMm)}</td>
                          <td style={td({ bold: true })}>{cm(p.foldMm)}</td>
                          <td style={td()}>{cm(p.bottomMm)}</td>
                          <td style={td({ grey: true })}>
                            {cm(p.panelAboveMm)} <span style={{ fontSize: 11 }}>{p.panelAboveLabel.toLowerCase()}</span>
                          </td>
                        </tr>
                      ))}
                      <RefRow
                        label="Hem line" value={result.hemLineMm}
                        note={`${cm(result.bottomPanelMm)} bottom panel above`}
                      />
                      <RefRow label="Cut edge" value={result.cutDropMm} note={`${cm(a.hemMm)} hem above`} />
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '12px 14px', fontSize: 11.5, color: 'var(--warm-300)', lineHeight: 1.5, background: '#fff' }}>
                  Every figure is measured from the top cut edge of the flat fabric. For each
                  pocket, fold on the <b>fold</b> line, bring the <b>top</b> and <b>bottom</b> lines
                  together and stitch. Each pocket uses {cm(pocketMm)}cm of fabric, which is why the
                  pockets sit further down the cloth than the panel sizes alone.
                </div>
              </div>

              {/* ---------------- Dowels ---------------- */}
              <div className="section-title">Cut to length</div>
              <div className="card">
                <div className="component-item">
                  <div className="component-info">
                    <div className="component-name">{result.dowels} × {result.dowelLabel}</div>
                    <div className="component-sub">{cm(a.dowelDeductionMm)}cm under the finished width</div>
                  </div>
                  <div className="component-right">
                    <div className="component-cost">{cm(result.dowelLengthMm)}</div>
                    <div className="component-unit">cm each</div>
                  </div>
                </div>
              </div>

              <button
                className="btn btn-primary btn-block btn-lg"
                style={{ marginTop: 20 }}
                disabled={printing}
                onClick={print}
              >
                {printing ? 'Printing…' : 'Print the cut sheet'}
              </button>
            </>
          )}

          {!started && (
            <div className="empty-state">
              <div className="empty-icon">📐</div>
              <div className="empty-title">Enter a finished size</div>
              <div className="empty-desc">
                The width and drop of the blind as it will hang, in centimetres. The cut
                size, the panels and where to mark each pocket come from the assumptions above.
              </div>
            </div>
          )}
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  )
}

/* Table cell style. */
function td({ bold = false, grey = false, left = false } = {}) {
  return {
    padding: '9px 10px',
    textAlign: left ? 'left' : 'right',
    fontWeight: bold ? 700 : 400,
    color: grey ? 'var(--warm-300)' : 'var(--ink)',
    whiteSpace: 'nowrap',
  }
}

/* A reference line on the fabric — not a pocket, one position. */
function RefRow({ label, value, note }) {
  return (
    <tr style={{ borderTop: '1px solid var(--warm-200)', background: 'var(--warm-100)' }}>
      <td style={td({ bold: true, left: true })}>{label}</td>
      <td style={td({ bold: true })} colSpan={3}>{cm(value)}</td>
      <td style={td({ grey: true })}><span style={{ fontSize: 11 }}>{note}</span></td>
    </tr>
  )
}
