/**
 * RomanBlindDiagram
 *
 * The cut fabric, drawn flat, with the marks on it.
 *
 * Drawn in FLAT coordinates — the fabric as it lies on the table before
 * anything is sewn — because that is the state it gets marked in. The one thing
 * that makes this honest rather than a decoration: in flat coordinates the clear
 * gaps between the pocket bands ARE the finished panels. Each pocket uses only
 * its own width of fabric, so what lies between two green bands is exactly what
 * will hang between two dowels, and the panel labels sit against fabric that
 * really is that long.
 *
 * For the same reason there is deliberately no bracket for the finished drop.
 * It has no honest extent on this drawing — the fabric between the top of the
 * headboard and the hem line is the drop PLUS every pocket — so the drop is a
 * figure in the summary instead.
 *
 * Drawn to scale down the length, which is the axis every mark is measured
 * along; not across it, where the real proportions would make a wide blind a
 * letterbox and a narrow one a ribbon. Sized by viewBox so it shrinks onto a
 * phone.
 */

import { cm } from '../lib/romanBlind'

/* Geometry, in viewBox units. The box is only as wide as the three columns
 * need — panel brackets, fabric, mark positions — because a viewBox wider than
 * its contents is a scale factor, not empty space: the figure is drawn to the
 * card's width, and every unused unit shrinks the fabric and the type. */
const VB_W    = 470
const FAB_X   = 120
const FAB_W   = 188
const FAB_TOP = 72
const FAB_H   = 560
const VB_H    = FAB_TOP + FAB_H + 40

const INK    = '#1F1B16'
const WARM   = '#8C8279'
const LINE   = '#E7E2DB'
const FILL   = '#F5F3F0'
const ACCENT = '#8DC73F'
const ACC_BG = '#F2F9E7'
const ACC_DK = '#1C2E0F'

/** A dimension line with a tick at each end. Vertical or horizontal. */
function Dim({ x1, y1, x2, y2, colour = WARM }) {
  const t = 3
  const vertical = x1 === x2
  return (
    <g stroke={colour} strokeWidth="0.8">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      {vertical ? (
        <>
          <line x1={x1 - t} y1={y1} x2={x1 + t} y2={y1} />
          <line x1={x2 - t} y1={y2} x2={x2 + t} y2={y2} />
        </>
      ) : (
        <>
          <line x1={x1} y1={y1 - t} x2={x1} y2={y1 + t} />
          <line x1={x2} y1={y2 - t} x2={x2} y2={y2 + t} />
        </>
      )}
    </g>
  )
}

export default function RomanBlindDiagram({ result }) {
  if (!result?.ok) return null

  const { cutDropMm, cutWidthMm, widthMm, pockets, folds, bands, assumptions: a } = result

  const sy = FAB_H / cutDropMm
  const sx = FAB_W / cutWidthMm
  const y  = (v) => FAB_TOP + v * sy

  const FAB_R   = FAB_X + FAB_W
  const FAB_BOT = FAB_TOP + FAB_H
  const TEXT_X  = FAB_R + 18
  const sideX   = a.sideAllowanceMm * sx

  const foldband = bands.find(b => b.kind === 'headboardFold')
  const faceband = bands.find(b => b.kind === 'headboardFace')
  const hemband  = bands.find(b => b.kind === 'hem')

  /* The fabric that isn't hanging panel, each with the line that bounds it.
   * The top of the headboard matters most of the three: it is where the drop
   * is measured from. */
  const turns = [
    // The fold starts at the cut edge, so its line's position IS its depth —
    // repeating the figure beside it would only crowd the column.
    { band: foldband, lineMm: foldband.toMm, line: 'top of headboard', implied: true },
    { band: faceband, lineMm: faceband.toMm, line: 'underside of headboard' },
    { band: hemband,  lineMm: hemband.fromMm, line: 'hem line' },
  ]

  /* The panels: the clear runs of fabric between the bands. Walked from the
   * bands, so the figure can only ever label what is actually drawn. */
  const panels = []
  let cursor = faceband.toMm
  pockets.forEach((p, i) => {
    panels.push({ label: i === 0 ? 'first panel' : `main ${i}`, fromMm: cursor, toMm: p.topMm, sizeMm: p.panelAboveMm, first: i === 0 })
    cursor = p.bottomMm
  })
  panels.push({ label: 'bottom panel', fromMm: cursor, toMm: hemband.fromMm, sizeMm: result.bottomPanelMm, bottom: true })

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width="100%"
      style={{ display: 'block', height: 'auto', maxHeight: '80vh', margin: '0 auto' }}
      role="img"
      aria-label={`Cut fabric ${cm(cutWidthMm)} by ${cm(cutDropMm)} centimetres with ${pockets.length} dowel pockets`}
    >
      {/* ---- Width, above the fabric ---- */}
      <Dim x1={FAB_X} y1={20} x2={FAB_R} y2={20} />
      <text x={(FAB_X + FAB_R) / 2} y={14} textAnchor="middle" fontSize="10" fontWeight="700" fill={INK}>
        CUT {cm(cutWidthMm)}
      </text>
      <Dim x1={FAB_X + sideX} y1={42} x2={FAB_R - sideX} y2={42} colour={ACCENT} />
      <text x={(FAB_X + FAB_R) / 2} y={36} textAnchor="middle" fontSize="9" fill={WARM}>
        finished {cm(widthMm)}
      </text>

      {/* Side allowances, chained either side of the finished width so the row
        * adds up to the cut width above it. One label, not two: both sides are
        * the same allowance, and the print sheet has no room for a second one
        * beside the mark column. Extension lines carry the finished edges down
        * to the dashed side lines on the fabric. */}
      {a.sideAllowanceMm > 0 && (
        <>
          <Dim x1={FAB_X} y1={42} x2={FAB_X + sideX} y2={42} />
          <Dim x1={FAB_R - sideX} y1={42} x2={FAB_R} y2={42} />
          <g stroke={LINE} strokeWidth="0.6">
            <line x1={FAB_X + sideX} y1={42} x2={FAB_X + sideX} y2={FAB_TOP} />
            <line x1={FAB_R - sideX} y1={42} x2={FAB_R - sideX} y2={FAB_TOP} />
          </g>
          <text x={FAB_X - 6} y={45} textAnchor="end" fontSize="8.5" fill={WARM}>
            side <tspan fontWeight="700" fill={INK}>{cm(a.sideAllowanceMm)}</tspan> each
          </text>
        </>
      )}

      {/* Heading for the mark column */}
      <text x={TEXT_X} y={FAB_TOP - 8} fontSize="7.5" fontWeight="700" fill={WARM} letterSpacing="0.6">
        TOP · FOLD · BOTTOM
      </text>

      {/* ---- The fabric ---- */}
      <rect x={FAB_X} y={FAB_TOP} width={FAB_W} height={FAB_H} fill="#fff" stroke={LINE} strokeWidth="1" />

      {/* Side allowance lines — pressed in, not cut. */}
      {sideX > 0.6 && (
        <g stroke={LINE} strokeWidth="0.8" strokeDasharray="3 3">
          <line x1={FAB_X + sideX} y1={FAB_TOP} x2={FAB_X + sideX} y2={FAB_BOT} />
          <line x1={FAB_R - sideX} y1={FAB_TOP} x2={FAB_R - sideX} y2={FAB_BOT} />
        </g>
      )}

      {/* ---- Headboard fold, headboard face and hem ---- */}
      {turns.map(({ band: b, lineMm, line, implied }) => {
        const h     = Math.max((b.toMm - b.fromMm) * sy, 1.2)
        const lineY = y(lineMm)
        const text  = `${b.label} ${cm(b.toMm - b.fromMm)}`
        return (
          <g key={b.kind}>
            <rect x={FAB_X} y={y(b.fromMm)} width={FAB_W} height={h} fill={FILL} />
            <line x1={FAB_X} y1={lineY} x2={FAB_R} y2={lineY} stroke={WARM} strokeWidth="0.9" strokeDasharray="4 3" />
            {h > 11 && (
              <text x={(FAB_X + FAB_R) / 2} y={y(b.fromMm) + h / 2 + 3} textAnchor="middle" fontSize="8" fill={WARM}>
                {text}
              </text>
            )}
            {/* The line's own position, out in the mark column */}
            <line x1={FAB_R} y1={lineY} x2={FAB_R + 14} y2={lineY} stroke={LINE} strokeWidth="0.7" />
            <text x={TEXT_X} y={lineY + 3} fontSize="9" fill={WARM}>
              {cm(lineMm)}
              <tspan fontSize="8">{`  ${line}`}{h > 11 || implied ? '' : ` · ${text.toLowerCase()}`}</tspan>
            </text>
          </g>
        )
      })}

      {/* ---- Half-panel folds: not marked, drawn so the stack can be pictured ---- */}
      {folds.map(f => (
        <g key={`fold-${f.afterPocket}`}>
          <line
            x1={FAB_X} y1={y(f.atMm)} x2={FAB_R} y2={y(f.atMm)}
            stroke={WARM} strokeWidth="0.6" strokeDasharray="1 2.5" opacity="0.8"
          />
          <text x={FAB_R - 4} y={y(f.atMm) - 2.5} textAnchor="end" fontSize="7" fill={WARM} opacity="0.9">
            folds here
          </text>
        </g>
      ))}

      {/* ---- Dowel pockets: top, fold, bottom ---- */}
      {pockets.map(p => {
        const yTop = y(p.topMm)
        const yBot = y(p.bottomMm)
        const yFold = y(p.foldMm)
        const h = Math.max(yBot - yTop, 1.2)
        return (
          <g key={`pocket-${p.n}`}>
            <rect x={FAB_X} y={yTop} width={FAB_W} height={h} fill={ACC_BG} />
            {/* Top and bottom dashed — they are brought together and stitched.
              * The fold solid — where the fabric turns and the dowel sits. */}
            {h > 2.5 && (
              <g stroke={ACCENT} strokeWidth="0.8" strokeDasharray="2.5 2">
                <line x1={FAB_X} y1={yTop} x2={FAB_R} y2={yTop} />
                <line x1={FAB_X} y1={yBot} x2={FAB_R} y2={yBot} />
              </g>
            )}
            <line x1={FAB_X} y1={yFold} x2={FAB_R} y2={yFold} stroke={ACCENT} strokeWidth="1.4" />

            <text x={FAB_X + 5} y={yTop - 2.5} fontSize="8" fontWeight="700" fill={ACC_DK}>
              P{p.n}
            </text>

            <line x1={FAB_R} y1={yFold} x2={FAB_R + 14} y2={yFold} stroke={LINE} strokeWidth="0.7" />
            <text x={TEXT_X} y={yFold + 3} fontSize="9" fill={WARM}>
              {cm(p.topMm)}
              <tspan fill={INK} fontWeight="700"> · {cm(p.foldMm)} · </tspan>
              {cm(p.bottomMm)}
            </text>
          </g>
        )
      })}

      {/* ---- Panels, bracketed down the left ---- */}
      {panels.map((p, i) => {
        const top = y(p.fromMm)
        const bot = y(p.toMm)
        if (bot - top < 7) return null
        const colour = p.first || p.bottom ? ACCENT : LINE
        return (
          <g key={`panel-${i}`}>
            <Dim x1={FAB_X - 20} y1={top} x2={FAB_X - 20} y2={bot} colour={colour} />
            <line x1={FAB_X - 20} y1={top} x2={FAB_X} y2={top} stroke={LINE} strokeWidth="0.5" />
            <line x1={FAB_X - 20} y1={bot} x2={FAB_X} y2={bot} stroke={LINE} strokeWidth="0.5" />
            <text x={FAB_X - 26} y={(top + bot) / 2} textAnchor="end" fontSize="9.5" fontWeight="700" fill={INK}>
              {cm(p.sizeMm)}
            </text>
            <text x={FAB_X - 26} y={(top + bot) / 2 + 10} textAnchor="end" fontSize="7.5" fill={WARM}>
              {p.label}
            </text>
          </g>
        )
      })}

      {/* ---- Cut drop, far right ---- */}
      <Dim x1={VB_W - 10} y1={FAB_TOP} x2={VB_W - 10} y2={FAB_BOT} colour={INK} />
      <text
        x={VB_W - 18} y={FAB_TOP + FAB_H / 2}
        textAnchor="middle" fontSize="10" fontWeight="700" fill={INK}
        transform={`rotate(-90 ${VB_W - 18} ${FAB_TOP + FAB_H / 2})`}
      >
        CUT DROP {cm(cutDropMm)}
      </text>

      {/* ---- Legend ---- */}
      <g fontSize="8" fill={WARM}>
        <rect x={FAB_X} y={FAB_BOT + 12} width={13} height={6} fill={ACC_BG} stroke={ACCENT} strokeWidth="0.8" />
        <text x={FAB_X + 18} y={FAB_BOT + 17.5}>pocket — fold on the solid line, bring the dashed lines together, stitch</text>
        <text x={FAB_X} y={FAB_BOT + 31}>all figures in cm, measured from the top cut edge</text>
      </g>
    </svg>
  )
}
