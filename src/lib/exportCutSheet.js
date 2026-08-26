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
 * Landscape so eight columns stay legible, and routed through printPDF so it
 * goes straight to the print dialog — the sheet is meant to come off an iPad
 * onto paper, not into a downloads folder.
 */

import { printPDF } from './printPDF'

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

  const widthDeduction = Number(product?.fabric_width_deduction_mm) || 0
  const cutWidthMm     = fabric ? Math.round(Number(win.width_mm) - widthDeduction) : null
  // The fabric line is costed in linear metres, so its qty IS the cut drop.
  const cutDropMm      = fabric ? Math.round((Number(fabric.qty) || 0) * 1000) : null

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
export async function buildCutSheetDoc(job, windowsWithBOM = [], products = []) {
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

  const drawPageHeader = () => {
    setFill(ACCENT_DARK)
    doc.rect(0, 0, PW, 16, 'F')
    setColor(WHITE)
    doc.setFontSize(12); doc.setFont('helvetica', 'bold')
    doc.text('Cut Sheet', MX, 10.5)

    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    setColor([180, 210, 120])
    doc.text(job.customer_name || 'Untitled Job', MX + 30, 10.5)

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

  return doc
}

export async function exportCutSheetPDF(job, windowsWithBOM = [], products = []) {
  const doc      = await buildCutSheetDoc(job, windowsWithBOM, products)
  const customer = (job.customer_name || 'job').replace(/[^a-zA-Z0-9]+/g, '_')
  const jobNo    = job.job_number ? `_${job.job_number}` : ''
  printPDF(doc, `CutSheet_${customer}${jobNo}.pdf`)
  return { rowCount: windowsWithBOM.length }
}
