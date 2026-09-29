/**
 * exportRomanBlindSheet
 *
 * The roman blind worked out, on one sheet of paper, for the cutting table.
 *
 * One blind per sheet rather than a row per blind, because this document is not
 * a list to work down — it is a drawing to work ON. The marks get read off it
 * with a tape in one hand, and the diagram has to be big enough to check a
 * pocket against before it is sewn.
 *
 * Portrait, because the thing being drawn is taller than it is wide. Every other
 * sheet in the app is landscape for its columns; this one has a length of
 * fabric to show.
 *
 * Routed through printPDF like the other cut sheets, so it goes to the print
 * dialog rather than a downloads folder.
 *
 * Nothing is recomputed here. Every figure comes off the one result from
 * calcRomanBlind, including the bands the diagram is drawn from, so the sheet
 * cannot disagree with the screen it was printed from.
 *
 * jsPDF's built-in Helvetica is WinAnsi encoded: no arrows. · – — × and ½ are
 * all safe; anything else needs checking before it goes on the sheet.
 */

import { printPDF } from './printPDF'
import {
  ACCENT_DARK, ACCENT, ACCENT_TINT, WARM_100, WARM_200, WARM_300, INK, WHITE, GREEN_BG,
  loadJsPDF,
} from './pdfKit'
import { cm } from './romanBlind'

/* A4 portrait, in millimetres of paper. */
const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 12
const RIGHT  = PAGE_W - MARGIN

/* ==========================================================================
 * Header — pdfKit's headerDrawer is built around a job record; this page has
 * no job behind it. Same dark bar, with whatever reference was typed.
 * ========================================================================== */
function drawHeader(doc, meta) {
  doc.setFillColor(...ACCENT_DARK)
  doc.rect(0, 0, PAGE_W, 16, 'F')

  doc.setTextColor(...WHITE)
  doc.setFontSize(12); doc.setFont('helvetica', 'bold')
  doc.text('Roman Blind', MARGIN, 10.5)

  if (meta.reference) {
    const titleW = doc.getTextWidth('Roman Blind')
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.setTextColor(...ACCENT_TINT)
    doc.text(String(meta.reference), MARGIN + titleW + 5, 10.5)
  }

  doc.setTextColor(...WHITE); doc.setFontSize(8); doc.setFont('helvetica', 'normal')
  doc.text(
    new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
    RIGHT, 10.5, { align: 'right' },
  )
  return 24
}

/* ==========================================================================
 * The headline figures, in the order they are used: the size ordered, the
 * size to cut, then how it divides. The finished size leads so the sheet can
 * be checked against the order before anything is cut from it.
 * ========================================================================== */
function drawSummary(doc, r, y) {
  const a = r.assumptions
  const tiles = [
    { label: 'FINISHED WIDTH',  value: cm(r.widthMm) },
    { label: 'FINISHED DROP',   value: cm(r.dropMm),     sub: 'from top of headboard' },
    { label: 'CUT WIDTH',       value: cm(r.cutWidthMm), sub: `sides ${cm(a.sideAllowanceMm)} each` },
    { label: 'CUT DROP',        value: cm(r.cutDropMm) },
    { label: 'MAIN PANELS',     value: String(r.mainPanels), sub: 'excl. first & bottom' },
    { label: 'MAIN PANEL DROP', value: cm(r.panelMm),    sub: `first ${cm(r.firstPanelMm)} · bottom ${cm(r.bottomPanelMm)}` },
  ]

  const gap = 3
  const w   = (RIGHT - MARGIN - gap * (tiles.length - 1)) / tiles.length
  const h   = 20

  /* Six tiles to a row leaves little room for the small line under each
   * figure, so it steps down in size until it fits rather than running into the
   * next tile. */
  const fitSub = (text) => {
    let size = 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size)
    while (size > 4.4 && doc.getTextWidth(text) > w - 2) { size -= 0.2; doc.setFontSize(size) }
  }

  tiles.forEach((t, i) => {
    const x = MARGIN + i * (w + gap)
    // The finished size in white, the rest warm: the ordered size is the one
    // thing on the sheet that came from someone else.
    doc.setFillColor(...(i < 2 ? WHITE : WARM_100)); doc.setDrawColor(...WARM_200)
    doc.roundedRect(x, y, w, h, 1.6, 1.6, 'FD')

    doc.setTextColor(...WARM_300); doc.setFontSize(5.6); doc.setFont('helvetica', 'bold')
    doc.text(t.label, x + w / 2, y + 5, { align: 'center' })

    doc.setTextColor(...INK); doc.setFontSize(14)
    doc.text(t.value, x + w / 2, y + 12.5, { align: 'center' })

    if (t.sub) {
      doc.setTextColor(...WARM_300)
      fitSub(t.sub)
      doc.text(t.sub, x + w / 2, y + 17, { align: 'center' })
    }
  })

  return y + h + 5
}

/* ==========================================================================
 * The assumptions, always printed. They are the whole reason two sheets for
 * the same finished size can differ, and they are editable on the page, so "the
 * usual" is not a safe thing to infer six weeks later.
 * ========================================================================== */
function drawAssumptions(doc, r, y) {
  const a = r.assumptions
  const parts = [
    `${r.dowelLabel.toLowerCase()}, pocket ${cm(r.pocketMm)}`,
    `headboard face ${cm(a.headboardFaceMm)}, fold ${cm(a.headboardFoldMm)}`,
    `first panel = main + ${cm(a.topPanelExtraMm)}`,
    `bottom panel = ½ main + ${cm(a.bottomPanelExtraMm)}`,
    `hem ${cm(a.hemMm)}`,
    `sides ${cm(a.sideAllowanceMm)} each`,
    `main panels ${cm(a.panelMinMm)}–${cm(a.panelMaxMm)}, min ${a.minMainPanels}`,
    `dowels ${cm(a.dowelDeductionMm)} short`,
  ]

  /* Wrapped, and the box sized to the lines. Drawn as one unwrapped line it ran
   * off the right of the page as soon as the headboard became two assumptions,
   * and jsPDF draws past the edge without a word. */
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2)
  const lines = doc.splitTextToSize(parts.join('  ·  '), RIGHT - MARGIN - 4)
  const boxH  = 5.6 + lines.length * 2.8

  doc.setFillColor(...WARM_100)
  doc.rect(MARGIN, y, RIGHT - MARGIN, boxH, 'F')

  doc.setTextColor(...WARM_300); doc.setFontSize(6); doc.setFont('helvetica', 'bold')
  doc.text('ASSUMPTIONS (CM)', MARGIN + 2, y + 3.6)

  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2); doc.setTextColor(...INK)
  lines.forEach((l, i) => doc.text(l, MARGIN + 2, y + 7.2 + i * 2.8))

  return y + boxH + 6
}

/* ==========================================================================
 * The drawing — the same figure as the screen, in flat fabric coordinates, so
 * the gaps between the pocket bands are the finished panels. See
 * RomanBlindDiagram for the full argument.
 * ========================================================================== */
function drawDiagram(doc, r, y, availH) {
  const a    = r.assumptions
  const fabW = 88
  const fabX = MARGIN + 30
  const fabH = availH
  const fabR = fabX + fabW
  const txtX = fabR + 4.5
  const sy   = fabH / r.cutDropMm
  const sx   = fabW / r.cutWidthMm
  const Y    = (v) => y + v * sy

  const foldband = r.bands.find(b => b.kind === 'headboardFold')
  const faceband = r.bands.find(b => b.kind === 'headboardFace')
  const hemband  = r.bands.find(b => b.kind === 'hem')

  const dashed = (on, off) => doc.setLineDashPattern([on, off], 0)
  const solid  = () => doc.setLineDashPattern([], 0)
  const tick   = (x, yy) => doc.line(x, yy - 1, x, yy + 1)

  /* ---- Width, above the fabric ---- */
  doc.setDrawColor(...WARM_300); doc.setLineWidth(0.2)
  doc.line(fabX, y - 9, fabR, y - 9); tick(fabX, y - 9); tick(fabR, y - 9)
  doc.setTextColor(...INK); doc.setFontSize(7); doc.setFont('helvetica', 'bold')
  doc.text(`CUT ${cm(r.cutWidthMm)}`, (fabX + fabR) / 2, y - 10.8, { align: 'center' })

  const sideX = a.sideAllowanceMm * sx
  doc.setDrawColor(...ACCENT)
  doc.line(fabX + sideX, y - 4, fabR - sideX, y - 4)
  tick(fabX + sideX, y - 4); tick(fabR - sideX, y - 4)
  doc.setTextColor(...WARM_300); doc.setFontSize(6); doc.setFont('helvetica', 'normal')
  doc.text(`finished ${cm(r.widthMm)}`, (fabX + fabR) / 2, y - 5.6, { align: 'center' })

  /* Side allowances, chained either side of the finished width so the row adds
   * up to the cut width above it. One label, on the left: a second on the right
   * would sit on the mark column's heading. */
  if (a.sideAllowanceMm > 0) {
    doc.setDrawColor(...WARM_300); doc.setLineWidth(0.2)
    doc.line(fabX, y - 4, fabX + sideX, y - 4); tick(fabX, y - 4)
    doc.line(fabR - sideX, y - 4, fabR, y - 4); tick(fabR, y - 4)
    doc.setDrawColor(...WARM_200); doc.setLineWidth(0.15)
    doc.line(fabX + sideX, y - 4, fabX + sideX, y)
    doc.line(fabR - sideX, y - 4, fabR - sideX, y)

    const each = ' each'
    const val  = cm(a.sideAllowanceMm)
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(...WARM_300)
    const eachW = doc.getTextWidth(each)
    doc.text(each, fabX - 1.5, y - 3.3, { align: 'right' })
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK)
    const valW = doc.getTextWidth(val)
    doc.text(val, fabX - 1.5 - eachW, y - 3.3, { align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...WARM_300)
    doc.text('side ', fabX - 1.5 - eachW - valW, y - 3.3, { align: 'right' })
  }

  // Heading for the mark column
  doc.setTextColor(...WARM_300); doc.setFontSize(5.5); doc.setFont('helvetica', 'bold')
  doc.text('TOP  ·  FOLD  ·  BOTTOM', txtX, y - 2)

  /* ---- The fabric ---- */
  doc.setFillColor(...WHITE); doc.setDrawColor(...WARM_200); doc.setLineWidth(0.3)
  doc.rect(fabX, y, fabW, fabH, 'FD')

  if (sideX > 0.4) {
    doc.setDrawColor(...WARM_200); doc.setLineWidth(0.2); dashed(0.8, 0.8)
    doc.line(fabX + sideX, y, fabX + sideX, y + fabH)
    doc.line(fabR - sideX, y, fabR - sideX, y + fabH)
    solid()
  }

  /* ---- Headboard fold, headboard face and hem: each with its bounding line.
   * The fold's line position is its own depth, so it never repeats it. ---- */
  const turns = [
    { band: foldband, lineMm: foldband.toMm, line: 'top of headboard', implied: true },
    { band: faceband, lineMm: faceband.toMm, line: 'underside of headboard' },
    { band: hemband,  lineMm: hemband.fromMm, line: 'hem line' },
  ]
  turns.forEach(({ band: b, lineMm, line, implied }) => {
    const h     = Math.max((b.toMm - b.fromMm) * sy, 0.4)
    const lineY = Y(lineMm)
    const name  = b.label

    doc.setFillColor(...WARM_100)
    doc.rect(fabX, Y(b.fromMm), fabW, h, 'F')

    doc.setDrawColor(...WARM_300); doc.setLineWidth(0.25); dashed(1, 0.8)
    doc.line(fabX, lineY, fabR, lineY)
    solid()

    if (h > 3) {
      doc.setTextColor(...WARM_300); doc.setFontSize(5.5); doc.setFont('helvetica', 'normal')
      doc.text(`${name} ${cm(b.toMm - b.fromMm)}`, (fabX + fabR) / 2, Y(b.fromMm) + h / 2 + 0.9, { align: 'center' })
    }

    doc.setDrawColor(...WARM_200); doc.setLineWidth(0.2)
    doc.line(fabR, lineY, fabR + 3, lineY)
    doc.setTextColor(...INK); doc.setFontSize(6.6); doc.setFont('helvetica', 'bold')
    const value = cm(lineMm)
    doc.text(value, txtX, lineY + 1)
    const vw = doc.getTextWidth(value)
    doc.setTextColor(...WARM_300); doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8)
    doc.text(
      `  ${line}${h > 3 || implied ? '' : `  ·  ${name.toLowerCase()} ${cm(b.toMm - b.fromMm)}`}`,
      txtX + vw, lineY + 1,
    )
  })

  /* ---- Half-panel folds: drawn, not marked ---- */
  r.folds.forEach(f => {
    doc.setDrawColor(...WARM_300); doc.setLineWidth(0.15); dashed(0.3, 0.9)
    doc.line(fabX, Y(f.atMm), fabR, Y(f.atMm))
    solid()
    doc.setTextColor(...WARM_300); doc.setFontSize(4.8); doc.setFont('helvetica', 'normal')
    doc.text('folds here', fabR - 1.2, Y(f.atMm) - 0.8, { align: 'right' })
  })

  /* ---- Pockets: top and bottom dashed (brought together, stitched), the fold
   * solid (where the fabric turns and the dowel sits) ---- */
  r.pockets.forEach(p => {
    const yTop  = Y(p.topMm)
    const yBot  = Y(p.bottomMm)
    const yFold = Y(p.foldMm)
    const h     = Math.max(yBot - yTop, 0.4)

    doc.setFillColor(...GREEN_BG)
    doc.rect(fabX, yTop, fabW, h, 'F')

    if (h > 0.9) {
      doc.setDrawColor(...ACCENT); doc.setLineWidth(0.25); dashed(0.7, 0.6)
      doc.line(fabX, yTop, fabR, yTop)
      doc.line(fabX, yBot, fabR, yBot)
      solid()
    }
    doc.setDrawColor(...ACCENT); doc.setLineWidth(0.5)
    doc.line(fabX, yFold, fabR, yFold)

    doc.setTextColor(...ACCENT_DARK); doc.setFontSize(5.5); doc.setFont('helvetica', 'bold')
    doc.text(`P${p.n}`, fabX + 1.2, yTop - 0.8)

    doc.setDrawColor(...WARM_200); doc.setLineWidth(0.2)
    doc.line(fabR, yFold, fabR + 3, yFold)

    // top · FOLD · bottom, the fold in bold — the one line the fabric turns on.
    // Each part measured in its own face before the next is placed.
    let x = txtX
    const part = (text, bold, colour) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(...colour)
      doc.text(text, x, yFold + 1)
      x += doc.getTextWidth(text)
    }
    doc.setFontSize(6.6)
    part(cm(p.topMm), false, WARM_300)
    part('  ·  ', false, WARM_300)
    part(cm(p.foldMm), true, INK)
    part('  ·  ', false, WARM_300)
    part(cm(p.bottomMm), false, WARM_300)
  })

  /* ---- Panels, bracketed down the left ---- */
  let cursor = faceband.toMm
  const panels = r.pockets.map((p, i) => {
    const seg = { fromMm: cursor, toMm: p.topMm, sizeMm: p.panelAboveMm, label: i === 0 ? 'first panel' : `main ${i}`, accent: i === 0 }
    cursor = p.bottomMm
    return seg
  })
  panels.push({ fromMm: cursor, toMm: hemband.fromMm, sizeMm: r.bottomPanelMm, label: 'bottom panel', accent: true })

  panels.forEach(p => {
    const top = Y(p.fromMm)
    const bot = Y(p.toMm)
    if (bot - top < 2.6) return
    const bx = fabX - 5
    doc.setDrawColor(...(p.accent ? ACCENT : WARM_200)); doc.setLineWidth(0.25)
    doc.line(bx, top, bx, bot)
    doc.line(bx - 1, top, bx + 1, top)
    doc.line(bx - 1, bot, bx + 1, bot)
    doc.setDrawColor(...WARM_200); doc.setLineWidth(0.15)
    doc.line(bx, top, fabX, top)
    doc.line(bx, bot, fabX, bot)

    doc.setTextColor(...INK); doc.setFontSize(6.8); doc.setFont('helvetica', 'bold')
    doc.text(cm(p.sizeMm), bx - 2, (top + bot) / 2 + 0.4, { align: 'right' })
    if (bot - top > 6) {
      doc.setTextColor(...WARM_300); doc.setFontSize(5); doc.setFont('helvetica', 'normal')
      doc.text(p.label, bx - 2, (top + bot) / 2 + 3.2, { align: 'right' })
    }
  })

  /* ---- Cut drop, far right ---- */
  const cx = RIGHT - 2
  doc.setDrawColor(...INK); doc.setLineWidth(0.3)
  doc.line(cx, y, cx, y + fabH)
  doc.line(cx - 1.2, y, cx + 1.2, y)
  doc.line(cx - 1.2, y + fabH, cx + 1.2, y + fabH)
  doc.setTextColor(...INK); doc.setFontSize(7); doc.setFont('helvetica', 'bold')
  doc.text(`CUT DROP ${cm(r.cutDropMm)}`, cx - 2.2, y + fabH / 2, { align: 'center', angle: 90 })

  return y + fabH
}

/* ==========================================================================
 * Warnings — printed only when there are any. Not the explanatory notes (the
 * workroom asked for those off the sheet), but a blind made with hand-picked
 * panels outside the range must not reach the bench looking like any other.
 *
 * Wrapped and MEASURED before the diagram is drawn, because the diagram gets
 * whatever height is left, and jsPDF draws past the bottom of the page without
 * a word.
 * ========================================================================== */
const WARN_W    = RIGHT - MARGIN - 3
const WARN_LEAD = 2.9

function warningBlock(doc, r) {
  if (!r.warnings.length) return { lines: [], height: 0 }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.4)
  const lines = r.warnings.flatMap(w => doc.splitTextToSize(`! ${w}`, WARN_W))
  return { lines, height: 3 + lines.length * WARN_LEAD }
}

function drawWarnings(doc, block, y) {
  y += 3
  doc.setTextColor(194, 65, 12); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.4)
  block.lines.forEach(l => { doc.text(l, MARGIN + 2, y); y += WARN_LEAD })
  return y
}

/* ==========================================================================
 * Entry points
 * ========================================================================== */

/**
 * Build the sheet for one worked-out blind and hand back the document —
 * separate from printing it, so the document can be checked without a print
 * dialog in the way.
 */
export async function buildRomanBlindSheet(result, meta = {}) {
  if (!result?.ok) throw new Error('Nothing to print — the blind has not been worked out yet.')

  const jsPDF = await loadJsPDF()
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  let y = drawHeader(doc, meta)
  y = drawSummary(doc, result, y)
  y = drawAssumptions(doc, result, y)

  /* Any warnings are measured first; the diagram gets the height that remains,
   * so the sheet is always exactly one page. 14 above the drawing is headroom
   * for the width dimensions. */
  const warnings   = warningBlock(doc, result)
  const diagramTop = y + 14
  const availH     = PAGE_H - MARGIN - warnings.height - diagramTop

  y = drawDiagram(doc, result, diagramTop, availH)
  if (warnings.lines.length) drawWarnings(doc, warnings, y)

  return doc
}

/** `<reference>_<width>x<drop>cm_RomanBlind.pdf` — plain digits, no commas. */
export function romanBlindFilename(result, meta = {}) {
  const size = `${cm(result.widthMm)}x${cm(result.dropMm)}cm`.replace(/\.0(?=x|cm)/g, '')
  const name = String(meta.reference || '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')
  return [name, size, 'RomanBlind'].filter(Boolean).join('_') + '.pdf'
}

/** Build the sheet and send it to the print dialog. */
export async function printRomanBlindSheet(result, meta = {}) {
  const doc = await buildRomanBlindSheet(result, meta)
  printPDF(doc, romanBlindFilename(result, meta))
}
