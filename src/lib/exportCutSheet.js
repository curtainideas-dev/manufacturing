/**
 * exportCutSheetPDF
 *
 * One row per window, carrying only what someone standing at the saw or the
 * cutting table needs: what to cut, how long, and out of which fabric. Not a
 * costing document — no prices, no part numbers, nothing to read past.
 *
 * The figures here are FINAL CUT dimensions, already through every deduction
 * and allowance, so nobody has to redo that arithmetic by hand:
 *
 *   cut length   the bar line's own quantity — window width less whatever
 *                deduction its recipe line carries (a tube is cut shorter
 *                than the window it goes in).
 *   cut width    window width less the product's fabric width deduction.
 *   cut drop     window drop PLUS the drop allowance and drop wastage
 *                allowance — the length actually pulled off the roll, which
 *                is longer than the finished blind.
 *
 * Behind the table come the CUT CHARTS — one per fabric, colour and roll
 * width, showing how the job's blinds nest side by side across the roll. A
 * blind can't be railroaded, so the drop always runs down the roll, but the
 * width beside it is not lost: the chart is what tells the cutting table which
 * blinds share a length and where the reusable strip is left. Its nesting is
 * the same `nestPieces` the costing uses, so what's drawn is what was charged.
 *
 * Landscape so eight columns stay legible, and routed through printPDF so it
 * goes straight to the print dialog — the sheet is meant to come off an iPad
 * onto paper, not into a downloads folder.
 */

import { printPDF } from './printPDF'
import { nestPieces, nestSummary } from './fabricEngine'

const ACCENT_DARK = [28, 46, 15]
const WARM_100    = [241, 245, 249]
const WARM_200    = [226, 232, 240]
const WARM_300    = [148, 163, 184]
const INK         = [15, 23, 42]
const WHITE       = [255, 255, 255]

const loadJsPDF = () => new Promise((resolve, reject) => {
  if (window.jspdf) return resolve(window.jspdf.jsPDF)
  const s = document.createElement('script')
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  s.onload = () => resolve(window.jspdf.jsPDF)
  s.onerror = reject
  document.head.appendChild(s)
})

const DASH = '—'

/** A bar line's cut length in mm, however its recipe measures it. */
const cutLengthMm = (line) => {
  const unit = line.component?.unit || 'each'
  const qty  = Number(line.qty) || 0
  return unit === 'metres' ? Math.round(qty * 1000) : Math.round(qty)
}

/**
 * The cut-sheet row for one window. Exported separately from the rendering so
 * the numbers can be checked without generating a PDF.
 */
export function cutSheetRow(win, products = []) {
  const product = products.find(p => p.id === win.product_id)
  const bom     = win.bom || []

  // Tracks and tubes — the things that get sawn. Usually one; joined rather
  // than split across rows so a window stays one line on the sheet.
  const bars = bom.filter(l => l.component?.order_type === 'bar' && Number(l.qty) > 0)

  // The synthesised fabric line (see bomEngine.fabricLineFor), present only
  // on a blind whose window has actually picked a fabric.
  const fabric = bom.find(l => l.product_component_id === 'fabric-slot')

  // Read off the line's own cut, not back-calculated from its quantity: the
  // fabric line is costed as a strip of the roll, so its qty is the drop
  // scaled by the share of the roll's width the cut occupies — a number the
  // cutting table must never be handed as a length.
  const cut        = fabric?.fabric_cut || null
  const cutWidthMm = cut ? cut.cutWidthMm : null
  const cutDropMm  = cut ? cut.cutDropMm  : null

  return {
    window:      win.label || DASH,
    product:     product?.name || DASH,
    tube:        bars.length ? bars.map(l => l.component?.name || DASH).join(' / ') : DASH,
    cutLength:   bars.length ? bars.map(cutLengthMm).map(n => n.toLocaleString()).join(' / ') : DASH,
    fabric:      fabric
      ? `${fabric.component?.name || DASH}${fabric.colour_variant?.name ? ` · ${fabric.colour_variant.name}` : ''}`
      : DASH,
    cutWidth:    cutWidthMm != null ? cutWidthMm.toLocaleString() : DASH,
    cutDrop:     cutDropMm  != null ? cutDropMm.toLocaleString()  : DASH,
    // Shown alongside so the cut can be sanity-checked against the order
    // without opening the job — the finished size, not the cut size.
    orderedSize: `${win.width_mm} × ${win.drop_mm}`,
  }
}

/**
 * The job's fabric cuts, grouped into the rolls they'll actually be nested on,
 * each group already laid out.
 *
 * Grouped by fabric, colour, roll width AND cut allowance: two blinds only
 * share a length of roll if they're the same fabric and colour, and the
 * nesting only means anything against one roll width. Allowance joins the key
 * because two products on the same fabric can carry different blade margins,
 * and mixing them would draw a layout neither was costed at.
 *
 * Exported separately from the rendering so a layout can be checked without
 * generating a PDF.
 */
export function fabricCutGroups(windowsWithBOM = []) {
  const groups = new Map()

  windowsWithBOM.forEach((win, i) => {
    const line = (win.bom || []).find(l => l.fabric_cut)
    if (!line) return
    const cut    = line.fabric_cut
    const suffix = line.colour_variant?.suffix || ''
    const key    = `${line.component_id}__${suffix}__${cut.rollWidthMm}__${cut.widthAllowanceMm}`

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        component:        line.component,
        colour_variant:   line.colour_variant || null,
        rollWidthMm:      cut.rollWidthMm,
        widthAllowanceMm: cut.widthAllowanceMm,
        pieces:           [],
      })
    }
    groups.get(key).pieces.push({
      label:      cut.label || win.label || `Window ${i + 1}`,
      cutWidthMm: cut.cutWidthMm,
      cutDropMm:  cut.cutDropMm,
    })
  })

  return [...groups.values()]
    .map(g => {
      const bands = nestPieces(g.pieces, g.rollWidthMm, g.widthAllowanceMm)
      return { ...g, bands, summary: nestSummary(bands, g.rollWidthMm) }
    })
    .sort((a, b) => String(a.component?.name || '').localeCompare(String(b.component?.name || '')))
}

/* ==========================================================================
 * Fabric summary
 *
 * The charts say how to cut; this says what to pull off the shelf or put on an
 * order. One row per roll the job needs, so nobody has to add up bands by eye.
 *
 * Built once, here, and rendered three ways — into the PDF, into HTML, and
 * into tab-separated text — so a sheet that came off the printer and a table
 * pasted into an email can never carry different numbers.
 * ========================================================================== */

// Shared by the PDF table and the clipboard renderers. `w` is millimetres of
// paper for the PDF; the text and HTML versions only use `title` and `key`.
export const SUMMARY_COLS = [
  { key: 'fabric',  title: 'Fabric',          w: 74 },
  { key: 'company', title: 'Company',         w: 46 },
  { key: 'length',  title: 'Length required', w: 36, align: 'right' },
  { key: 'width',   title: 'Width required',  w: 36, align: 'right' },
  { key: 'layout',  title: 'Layout',          w: 60 },
]

/**
 * One row per roll the job needs.
 *
 * `width` is the ROLL WIDTH the layout assumes — the width to order or pull,
 * and the width the nesting and the costing were both computed against. The
 * narrowest roll that would physically take the layout is smaller (no band
 * uses the whole width), so it rides along in `layout` as the widest band
 * rather than replacing the figure someone would put on a purchase order.
 */
export function fabricSummary(windowsWithBOM = [], suppliers = []) {
  const groups = fabricCutGroups(windowsWithBOM)

  const supplierName = (componentId) => {
    const comp = windowsWithBOM
      .flatMap(w => w.bom || [])
      .find(l => l.component_id === componentId)?.component
    return suppliers.find(x => x.id === comp?.supplier_id)?.name || DASH
  }

  const rows = groups.map(g => {
    const widestBandMm = Math.max(0, ...g.bands.map(b => b.usedWidthMm))
    return {
      fabric: `${g.component?.fabric_code ? `${g.component.fabric_code} · ` : ''}${g.component?.name || DASH}`
        + (g.colour_variant?.name ? ` · ${g.colour_variant.name}` : ''),
      company: supplierName(g.component?.id),
      length:  `${(g.summary.totalLengthMm / 1000).toFixed(2)} m`,
      width:   `${g.rollWidthMm.toLocaleString()} mm`,
      layout:  `${g.bands.length} band${g.bands.length !== 1 ? 's' : ''} · widest ${Math.round(widestBandMm).toLocaleString()}mm`,
      // Raw figures, for anything that needs to compute rather than display.
      lengthMm: g.summary.totalLengthMm,
      rollWidthMm: g.rollWidthMm,
      widestBandMm,
    }
  })

  return {
    rows,
    rollCount:    rows.length,
    totalLengthM: rows.reduce((s, r) => s + r.lengthMm, 0) / 1000,
  }
}

const totalLabel = (n) => `Total across ${n} roll${n !== 1 ? 's' : ''}`

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The summary as an HTML table, for pasting into an email body.
 *
 * Styling is inline and the markup is plain — no classes, no flexbox, no CSS
 * variables — because mail clients strip stylesheets and Outlook renders a
 * subset of HTML from a decade ago. What survives that is a `<table>` with
 * inline `style` on every cell, which is what this emits.
 */
export function fabricSummaryHTML({ rows, rollCount, totalLengthM }, job = null) {
  const th = 'padding:6px 10px;border:1px solid #cbd5e1;background:#1c2e0f;color:#ffffff;'
    + 'font:600 13px Arial,Helvetica,sans-serif;text-align:left;'
  const td = 'padding:6px 10px;border:1px solid #cbd5e1;font:400 13px Arial,Helvetica,sans-serif;'
  const tdNum = td + 'text-align:right;font-weight:700;'
  const caption = [job?.job_number ? `Job #${job.job_number}` : null, job?.customer_name || null]
    .filter(Boolean).join(' · ')

  const head = SUMMARY_COLS.map(c =>
    `<th style="${th}${c.align === 'right' ? 'text-align:right;' : ''}">${esc(c.title)}</th>`).join('')

  const body = rows.map(r => '<tr>' + SUMMARY_COLS.map(c =>
    `<td style="${c.align === 'right' ? tdNum : td}">${esc(r[c.key])}</td>`).join('') + '</tr>').join('')

  const total = `<tr>`
    + `<td style="${td}font-weight:700;background:#e2e8f0;" colspan="2">${esc(totalLabel(rollCount))}</td>`
    + `<td style="${tdNum}background:#e2e8f0;">${totalLengthM.toFixed(2)} m</td>`
    + `<td style="${td}background:#e2e8f0;"></td><td style="${td}background:#e2e8f0;"></td>`
    + `</tr>`

  return (caption ? `<p style="font:600 13px Arial,Helvetica,sans-serif;margin:0 0 6px;">Fabric Summary — ${esc(caption)}</p>` : '')
    + `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;">`
    + `<thead><tr>${head}</tr></thead><tbody>${body}${total}</tbody></table>`
}

/**
 * The same table as tab-separated text.
 *
 * Tabs rather than aligned spaces: pasted into Outlook, Gmail or a spreadsheet
 * this lands as a real table with the columns split, which spaces would not
 * do. It's also the fallback whenever the clipboard won't take HTML.
 */
export function fabricSummaryText({ rows, rollCount, totalLengthM }, job = null) {
  const caption = [job?.job_number ? `Job #${job.job_number}` : null, job?.customer_name || null]
    .filter(Boolean).join(' · ')
  const lines = [
    ...(caption ? [`Fabric Summary — ${caption}`, ''] : []),
    SUMMARY_COLS.map(c => c.title).join('\t'),
    ...rows.map(r => SUMMARY_COLS.map(c => r[c.key]).join('\t')),
    [totalLabel(rollCount), '', `${totalLengthM.toFixed(2)} m`, '', ''].join('\t'),
  ]
  return lines.join('\n')
}

/**
 * Put the summary on the clipboard in both flavours at once.
 *
 * Writing text/html AND text/plain together lets the paste target choose: a
 * mail composer takes the HTML and renders a table, a plain-text field takes
 * the tabbed version and still lines up. Falls back to text alone on browsers
 * without ClipboardItem, and reports which happened so the caller can say so.
 */
export async function copyFabricSummary(windowsWithBOM = [], suppliers = [], job = null) {
  const summary = fabricSummary(windowsWithBOM, suppliers)
  if (summary.rows.length === 0) return { ok: false, reason: 'no_fabric' }

  const text = fabricSummaryText(summary, job)
  const html = fabricSummaryHTML(summary, job)

  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html':  new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })])
      return { ok: true, format: 'html', rollCount: summary.rollCount }
    }
    await navigator.clipboard.writeText(text)
    return { ok: true, format: 'text', rollCount: summary.rollCount }
  } catch {
    try {
      await navigator.clipboard.writeText(text)
      return { ok: true, format: 'text', rollCount: summary.rollCount }
    } catch {
      return { ok: false, reason: 'clipboard_blocked' }
    }
  }
}

// x, width and alignment per column. Widths are tuned so the two things that
// actually get measured — cut length and cut drop — never wrap or clip.
const COLS = [
  { key: 'window',      title: 'Window',        x: 12,  w: 40 },
  { key: 'product',     title: 'Product',       x: 52,  w: 28 },
  { key: 'tube',        title: 'Track / Tube',  x: 80,  w: 42 },
  { key: 'cutLength',   title: 'Cut length',    x: 122, w: 26, align: 'right' },
  { key: 'fabric',      title: 'Fabric',        x: 148, w: 55 },
  { key: 'cutWidth',    title: 'Cut width',     x: 203, w: 26, align: 'right' },
  { key: 'cutDrop',     title: 'Cut drop',      x: 229, w: 26, align: 'right' },
  { key: 'orderedSize', title: 'Ordered W × D', x: 255, w: 30, align: 'right' },
]

/**
 * Build the document without sending it anywhere. Split out from the export
 * so the rendered sheet can be inspected — or previewed — without a print
 * dialog being the only way to see it.
 */
export async function buildCutSheetDoc(job, windowsWithBOM = [], products = [], suppliers = []) {
  const jsPDF = await loadJsPDF()
  const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  const PW = 297, MX = 12, MXR = 285, CW = MXR - MX
  const MB = 196            // start a new page before this
  const ROW_H = 8
  let y = 0, pageNum = 1

  const setColor = rgb => doc.setTextColor(...rgb)
  const setFill  = rgb => doc.setFillColor(...rgb)

  // Trim a cell to its column so a long fabric name can't run into the next.
  const clip = (text, maxW) => {
    let t = String(text ?? DASH)
    if (doc.getTextWidth(t) <= maxW) return t
    while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1)
    return t + '…'
  }

  const drawPageHeader = (title = 'Cut Sheet') => {
    setFill(ACCENT_DARK)
    doc.rect(0, 0, PW, 16, 'F')
    setColor(WHITE)
    doc.setFontSize(12); doc.setFont('helvetica', 'bold')
    doc.text(title, MX, 10.5)
    const titleW = doc.getTextWidth(title)

    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    setColor([180, 210, 120])
    doc.text(job.customer_name || 'Untitled Job', MX + titleW + 6, 10.5)

    setColor(WHITE); doc.setFontSize(8)
    const dateStr = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    const meta = [
      job.job_number ? `Job #${job.job_number}` : null,
      `${windowsWithBOM.length} window${windowsWithBOM.length !== 1 ? 's' : ''}`,
      dateStr,
      `Page ${pageNum}`,
    ].filter(Boolean).join('   ·   ')
    doc.text(meta, MXR, 10.5, { align: 'right' })

    return 22
  }

  const drawTableHeader = () => {
    setFill(ACCENT_DARK)
    doc.rect(MX, y, CW, 7, 'F')
    setColor(WHITE)
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
    COLS.forEach(c => {
      const tx = c.align === 'right' ? c.x + c.w - 2 : c.x + 2
      doc.text(c.title, tx, y + 4.8, { align: c.align || 'left' })
    })
    y += 7
  }

  y = drawPageHeader()
  drawTableHeader()

  windowsWithBOM.forEach((win, i) => {
    if (y + ROW_H > MB) {
      doc.addPage(); pageNum++
      y = drawPageHeader()
      drawTableHeader()
    }

    const r = cutSheetRow(win, products)

    setFill(i % 2 === 0 ? WARM_100 : WHITE)
    doc.rect(MX, y, CW, ROW_H, 'F')

    COLS.forEach(c => {
      // The measured figures carry the weight — window name and the two cut
      // dimensions bold, the rest supporting.
      const strong = c.key === 'window' || c.key === 'cutLength' || c.key === 'cutDrop' || c.key === 'cutWidth'
      setColor(c.key === 'orderedSize' ? WARM_300 : INK)
      doc.setFontSize(strong ? 9 : 8)
      doc.setFont('helvetica', strong ? 'bold' : 'normal')
      const tx = c.align === 'right' ? c.x + c.w - 2 : c.x + 2
      doc.text(clip(r[c.key], c.w - 4), tx, y + ROW_H / 2 + 1.4, { align: c.align || 'left' })
    })

    // Hairline between rows, so a finger tracking across a wide row stays put.
    doc.setDrawColor(...WARM_200); doc.setLineWidth(0.1)
    doc.line(MX, y + ROW_H, MXR, y + ROW_H)

    y += ROW_H
  })

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  setColor(WARM_300)
  doc.text(
    'Cut length, cut width and cut drop are final — every deduction and allowance is already applied.',
    MX, y + 5,
  )

  /* ======================================================================
   * Cut charts
   *
   * One roll per group, drawn as it lies on the table: the roll's WIDTH runs
   * left to right and is strictly to scale, because that axis is the whole
   * point — it's what decides how many blinds share a length and how wide the
   * strip left over is. Length runs down the page, to scale within a band but
   * clamped so a 300mm band still has room for its label; every band carries
   * its real length in text, so nothing depends on reading the drawing.
   * ====================================================================== */

  const groups = fabricCutGroups(windowsWithBOM)

  if (groups.length > 0) {
    const CHART_W   = 200                    // mm of paper the roll's width maps to
    const CHART_X   = MX + 4
    const BAND_MIN  = 13, BAND_MAX = 46      // keeps a short band readable, a long one on the page
    const LEGEND_X  = CHART_X + CHART_W + 8

    doc.addPage(); pageNum++
    y = drawPageHeader('Fabric Cut Charts')

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    setColor(WARM_300)
    doc.text(
      'Each roll is drawn to scale across its width. Blinds on one band are cut from a single length pulled off the roll — '
      + 'the drop always runs down the roll, never across it. The shaded strip at the end of a band is reusable offcut.',
      CHART_X, y,
    )
    y += 7

    groups.forEach((g, gi) => {
      const { rollWidthMm, widthAllowanceMm, bands, summary } = g
      const scaleX = rollWidthMm > 0 ? CHART_W / rollWidthMm : 0

      // Group heading — keep it with at least one band, never orphaned.
      const firstBandH = Math.min(BAND_MAX, Math.max(BAND_MIN, (bands[0]?.lengthMm || 0) * 0.012))
      if (y + 16 + firstBandH > MB) { doc.addPage(); pageNum++; y = drawPageHeader('Fabric Cut Charts') }
      if (gi > 0) y += 4

      const name = `${g.component?.name || DASH}${g.colour_variant?.name ? ` · ${g.colour_variant.name}` : ''}`
      setFill(ACCENT_DARK)
      doc.rect(CHART_X, y, CHART_W + 60, 8, 'F')
      setColor(WHITE); doc.setFontSize(9); doc.setFont('helvetica', 'bold')
      doc.text(clip(name, 110), CHART_X + 3, y + 5.5)
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal')
      doc.text(
        [
          `${rollWidthMm.toLocaleString()}mm roll`,
          `${summary.pieceCount} blind${summary.pieceCount !== 1 ? 's' : ''}`,
          `${bands.length} band${bands.length !== 1 ? 's' : ''}`,
          `${(summary.totalLengthMm / 1000).toFixed(2)}m off the roll`,
          `${summary.wastePct.toFixed(0)}% waste`,
          widthAllowanceMm ? `${widthAllowanceMm}mm cut allowance` : 'no cut allowance set',
        ].join('   ·   '),
        CHART_X + CHART_W + 57, y + 5.5, { align: 'right' },
      )
      y += 11

      bands.forEach((band, bi) => {
        const bandH = Math.min(BAND_MAX, Math.max(BAND_MIN, band.lengthMm * 0.012))
        if (y + bandH + 3 > MB) { doc.addPage(); pageNum++; y = drawPageHeader('Fabric Cut Charts') }

        // The roll's full width, as the ground everything sits on.
        setFill(WARM_100)
        doc.rect(CHART_X, y, CHART_W, bandH, 'F')

        band.pieces.forEach(p => {
          const px = CHART_X + p.offsetMm * scaleX
          const pw = p.cutWidthMm * scaleX        // the blind itself, not its blade margin
          const tooWide = band.oversized

          setFill(tooWide ? [254, 226, 226] : [222, 236, 198])
          doc.rect(px, y, pw, bandH, 'F')
          doc.setDrawColor(...(tooWide ? [185, 28, 28] : ACCENT_DARK)); doc.setLineWidth(0.35)
          doc.rect(px, y, pw, bandH, 'S')

          const dims = `${p.cutWidthMm.toLocaleString()} × ${p.lengthMm.toLocaleString()}`
          setColor(tooWide ? [185, 28, 28] : ACCENT_DARK)
          if (pw >= 26) {
            doc.setFontSize(8); doc.setFont('helvetica', 'bold')
            doc.text(clip(p.label || DASH, pw - 3), px + 1.8, y + bandH / 2 - 0.4)
            doc.setFontSize(6.8); doc.setFont('helvetica', 'normal')
            doc.text(clip(dims, pw - 3), px + 1.8, y + bandH / 2 + 3.6)
          } else if (pw >= 5) {
            // Too narrow to read across — stand the label up instead of
            // clipping it away to nothing.
            doc.setFontSize(6.2); doc.setFont('helvetica', 'bold')
            doc.text(clip(`${p.label || DASH}  ${dims}`, bandH - 2),
              px + pw / 2 + 2, y + bandH - 1, { angle: 90 })
          }
        })

        // The strip left across the roll — the fabric this whole change exists
        // to stop throwing away.
        if (!band.oversized && band.remainingWidthMm > 0) {
          const ox = CHART_X + band.usedWidthMm * scaleX
          const ow = band.remainingWidthMm * scaleX
          setFill([248, 250, 245])
          doc.rect(ox, y, ow, bandH, 'F')
          doc.setDrawColor(...WARM_300); doc.setLineWidth(0.25)
          doc.setLineDashPattern([1, 1], 0)
          doc.rect(ox, y, ow, bandH, 'S')
          doc.setLineDashPattern([], 0)
          if (ow >= 22) {
            setColor(WARM_300); doc.setFontSize(6.8); doc.setFont('helvetica', 'normal')
            doc.text(clip(`offcut ${Math.round(band.remainingWidthMm).toLocaleString()}mm`, ow - 3),
              ox + 1.8, y + bandH / 2 + 1.2)
          }
        }

        // Band caption to the right — the length to pull off, and what it holds.
        setColor(INK); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
        doc.text(`Band ${bi + 1}`, LEGEND_X, y + bandH / 2 - 0.6)
        setColor(WARM_300); doc.setFontSize(7); doc.setFont('helvetica', 'normal')
        doc.text(
          band.oversized
            ? 'TOO WIDE FOR ROLL'
            : `pull ${band.lengthMm.toLocaleString()}mm · ${band.pieces.length} up`,
          LEGEND_X, y + bandH / 2 + 3.4,
        )

        y += bandH + 2.5
      })

      y += 3
    })

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
    setColor(WARM_300)
    doc.text(
      'Widths are to scale; band depths are not — always cut to the figures, not the drawing. '
      + 'Each blind occupies its cut width plus one cut allowance, which is how it was costed.',
      CHART_X, Math.min(y + 4, MB + 6),
    )
    y = Math.min(y + 4, MB + 6) + 8

    /* --------------------------------------------------------------------
     * Fabric summary — see fabricSummary(), which builds the same rows for
     * the clipboard so the printed sheet and a pasted email can't disagree.
     * ------------------------------------------------------------------ */
    const SUM = SUMMARY_COLS.map((c, i) => ({
      ...c,
      x: CHART_X + SUMMARY_COLS.slice(0, i).reduce((s, p) => s + p.w, 0),
    }))
    const SUM_W = SUMMARY_COLS.reduce((s, c) => s + c.w, 0)

    const { rows: sumRows, totalLengthM } = fabricSummary(windowsWithBOM, suppliers)

    const SUM_ROW_H = 8

    const drawSumHeader = () => {
      setFill(ACCENT_DARK)
      doc.rect(CHART_X, y, SUM_W, 7, 'F')
      setColor(WHITE); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
      SUM.forEach(c => {
        const tx = c.align === 'right' ? c.x + c.w - 2 : c.x + 2
        doc.text(c.title, tx, y + 4.8, { align: c.align || 'left' })
      })
      y += 7
    }

    // Keep the title with at least its header and first row rather than
    // stranding it at the foot of a page.
    if (y + 6 + 7 + SUM_ROW_H > MB) { doc.addPage(); pageNum++; y = drawPageHeader('Fabric Cut Charts') }

    setColor(INK); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
    doc.text('Fabric Summary', CHART_X, y)
    y += 4
    drawSumHeader()

    sumRows.forEach((r, i) => {
      // A long fabric list carries its own header onto the next page, so a
      // continued table is still readable on its own.
      if (y + SUM_ROW_H > MB) {
        doc.addPage(); pageNum++
        y = drawPageHeader('Fabric Cut Charts')
        drawSumHeader()
      }
      setFill(i % 2 === 0 ? WARM_100 : WHITE)
      doc.rect(CHART_X, y, SUM_W, SUM_ROW_H, 'F')
      SUM.forEach(c => {
        // The two ordering figures carry the weight; the rest is context.
        const strong = c.key === 'length' || c.key === 'width'
        setColor(c.key === 'layout' ? WARM_300 : INK)
        doc.setFontSize(strong ? 9 : 8)
        doc.setFont('helvetica', strong ? 'bold' : 'normal')
        const tx = c.align === 'right' ? c.x + c.w - 2 : c.x + 2
        doc.text(clip(r[c.key], c.w - 4), tx, y + SUM_ROW_H / 2 + 1.4, { align: c.align || 'left' })
      })
      doc.setDrawColor(...WARM_200); doc.setLineWidth(0.1)
      doc.line(CHART_X, y + SUM_ROW_H, CHART_X + SUM_W, y + SUM_ROW_H)
      y += SUM_ROW_H
    })

    // Total metres — the one number that goes onto a purchase order.
    if (y + SUM_ROW_H + 8 > MB) { doc.addPage(); pageNum++; y = drawPageHeader('Fabric Cut Charts') }
    setFill(WARM_200)
    doc.rect(CHART_X, y, SUM_W, SUM_ROW_H, 'F')
    setColor(INK); doc.setFontSize(8); doc.setFont('helvetica', 'bold')
    doc.text(totalLabel(sumRows.length), CHART_X + 2, y + SUM_ROW_H / 2 + 1.4)
    doc.setFontSize(9)
    doc.text(`${totalLengthM.toFixed(2)} m`, SUM[2].x + SUM[2].w - 2, y + SUM_ROW_H / 2 + 1.4, { align: 'right' })
    y += SUM_ROW_H + 4

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
    setColor(WARM_300)
    doc.text(
      'Length required is what comes off the roll, offcut included — order this, not the sum of the blinds. '
      + 'Width required is the roll width the layout assumes; no band fills it, so the widest band is shown alongside.',
      CHART_X, y,
    )
  }

  return doc
}

/**
 * The customer's last name, for the filename.
 *
 * The last whitespace-separated word — which is the surname for a name typed
 * "Tracy Thomas", and simply the whole thing for a one-word account like
 * "Maloney". A name entered surname-first ("Dimond Karen") therefore files
 * under the given name; that's a data-entry inconsistency rather than
 * something a rule can tell apart, and guessing either way would be wrong
 * half the time. Punctuation is dropped so the result is safe on any
 * filesystem, but spaces in the rest of the name are left alone.
 */
export function customerLastName(customerName) {
  const cleaned = String(customerName || '')
    .replace(/[^\p{L}\p{N}\s'-]+/gu, ' ')   // keep letters, digits, apostrophes, hyphens
    .trim()
  if (!cleaned) return 'Customer'
  return cleaned.split(/\s+/).pop()
}

/** `<order number>_<last name>_Cut Sheet.pdf` */
export function cutSheetFilename(job) {
  const orderNo = String(job?.job_number || '').replace(/[^\w.-]+/g, '_') || 'NoOrderNo'
  return `${orderNo}_${customerLastName(job?.customer_name)}_Cut Sheet.pdf`
}

export async function exportCutSheetPDF(job, windowsWithBOM = [], products = [], suppliers = []) {
  const doc = await buildCutSheetDoc(job, windowsWithBOM, products, suppliers)
  printPDF(doc, cutSheetFilename(job))
  return { rowCount: windowsWithBOM.length }
}
