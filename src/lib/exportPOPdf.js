/**
 * exportPurchaseOrderPDF
 *
 * The purchase order as a document to send, rather than a spreadsheet to read.
 *
 * This is the first thing the app produces for someone OUTSIDE the business,
 * which changes what it has to carry: who we are, where to deliver, and an
 * order number they can quote back. Everything else in the app is printed for
 * the bench, where all of that is assumed.
 *
 * A4 PORTRAIT, unlike the cut sheets — those are landscape because eight
 * columns of cut data need the width. An order is a short table with a lot of
 * white space around it, and portrait is what a supplier expects to receive.
 *
 * QUANTITIES-ONLY MODE (purchase_orders.hide_pricing) drops every money column
 * and the total. It is a property of the order rather than a choice made here,
 * so what was sent and what is on screen cannot disagree.
 */

import {
  ACCENT_DARK, WARM_100, WARM_200, WARM_300, INK, WHITE,
  loadJsPDF, downloadPDF, clip, wrap,
} from './pdfKit'
import {
  displayPN, poDisplayNumber, poLineTotal, poGrandTotal, priceBreakdown,
  lineDescription, lineOrderUnit, lineColour,
} from './poEngine'

const money = n => Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MX = 16, PW = 210, MXR = PW - MX, CW = MXR - MX
const MB = 272                                  // start a new page before this

/** Columns, priced and unpriced. The unpriced order is not the priced one
 *  with blanks — the description takes back the width the money used. */
// Widths must sum to CW (178mm). They did not, and the Total column ran
// off the right edge of the page — invisible on screen, wrong on the sheet a
// supplier receives.
// Colour gets real width at the money columns' expense. "Anodised Silver" is
// 15 characters and was clipping to "Anodised Si…" — a truncated colour on a
// sheet going to a supplier is how the wrong thing turns up. The price columns
// hold at most "1234.56" and were carrying several millimetres of slack.
const COLS_PRICED = [
  { key: 'pn',     title: 'Part No.',    w: 24 },
  { key: 'desc',   title: 'Description', w: 44 },
  { key: 'colour', title: 'Colour',      w: 28 },
  { key: 'unit',   title: 'Order unit',  w: 18 },
  { key: 'qty',    title: 'Qty',         w: 10, align: 'right' },
  { key: 'list',   title: 'List',        w: 13, align: 'right' },
  { key: 'disc',   title: 'Disc',        w: 9,  align: 'right' },
  { key: 'net',    title: 'Unit',        w: 13, align: 'right' },
  { key: 'total',  title: 'Total',       w: 19, align: 'right' },
]
const COLS_PLAIN = [
  { key: 'pn',     title: 'Part No.',    w: 36 },
  { key: 'desc',   title: 'Description', w: 62 },
  { key: 'colour', title: 'Colour',      w: 34 },
  { key: 'unit',   title: 'Order unit',  w: 28 },
  { key: 'qty',    title: 'Qty',         w: 18, align: 'right' },
]

export function poRows(lines = [], supplier = null, showPricing = true) {
  return lines.map(l => {
    // Whatever the line says, which is the component's wording unless someone
    // has typed over it — so the sheet the supplier receives is the sheet that
    // was on screen.
    const row = {
      pn:     displayPN(l.component, l.colour_variant) || '—',
      desc:   lineDescription(l),
      colour: lineColour(l) || '—',
      unit:   lineOrderUnit(l, supplier) || '—',
      qty:    String(Number(l.qty_ordered) || 0),
    }
    if (!showPricing) return row

    const b = priceBreakdown(l, l.component, supplier)
    return {
      ...row,
      // A discount of nothing is left blank rather than printed as "0%",
      // which reads as a negotiated rate of zero.
      list:  b.list > 0 && b.discount > 0 ? money(b.list) : '',
      disc:  b.discount > 0 ? `${b.discount}%` : '',
      net:   money(b.net),
      total: money(poLineTotal(l)),
    }
  })
}

export async function exportPurchaseOrderPDF(po, supplier, lines, company = {}) {
  const jsPDF = await loadJsPDF()
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const showPricing = !po?.hide_pricing
  const COLS = (showPricing ? COLS_PRICED : COLS_PLAIN).map((c, i, arr) => ({
    ...c, x: MX + arr.slice(0, i).reduce((s, p) => s + p.w, 0),
  }))

  const setColor = rgb => doc.setTextColor(...rgb)
  const setFill  = rgb => doc.setFillColor(...rgb)
  const fit      = (t, w) => clip(doc, t, w)

  let y = 0
  let page = 0

  const drawHeader = () => {
    page++
    if (page > 1) doc.addPage()
    y = 16

    // Letterhead
    setColor(ACCENT_DARK); doc.setFont('helvetica', 'bold'); doc.setFontSize(17)
    doc.text(company.name || 'Curtain Ideas', MX, y)

    setColor(WARM_300); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    let ly = y + 5
    const idLines = [
      company.abn ? `ABN ${company.abn}` : null,
      ...String(company.address || '').split('\n').map(s => s.trim()).filter(Boolean),
      [company.phone, company.email].filter(Boolean).join('  ·  ') || null,
      company.website || null,
    ].filter(Boolean)
    idLines.forEach(t => { doc.text(fit(t, 90), MX, ly); ly += 3.6 })

    // Document title + number, right
    setColor(INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
    doc.text('PURCHASE ORDER', MXR, y, { align: 'right' })
    setColor(WARM_300); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    doc.text(poDisplayNumber(po), MXR, y + 5.5, { align: 'right' })
    doc.text(new Date(po?.created_at || Date.now()).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'long', year: 'numeric',
    }), MXR, y + 10, { align: 'right' })

    y = Math.max(ly, y + 14) + 4
    doc.setDrawColor(...ACCENT_DARK); doc.setLineWidth(0.5)
    doc.line(MX, y, MXR, y)
    y += 7
  }

  const drawTableHead = () => {
    setFill(ACCENT_DARK)
    doc.rect(MX, y, CW, 8, 'F')
    setColor(WHITE); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
    COLS.forEach(c => {
      doc.text(c.title.toUpperCase(),
        c.align === 'right' ? c.x + c.w - 2 : c.x + 2, y + 5.3,
        { align: c.align === 'right' ? 'right' : 'left' })
    })
    y += 8
  }

  drawHeader()

  /* ---- Supplier and delivery, side by side ---- */
  const boxW = (CW - 6) / 2
  const block = (x, title, body) => {
    setColor(WARM_300); doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
    doc.text(title.toUpperCase(), x, y)
    setColor(INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    let by = y + 5
    body.filter(Boolean).forEach(t => {
      wrap(doc, String(t), boxW).forEach(line => { doc.text(line, x, by); by += 4.2 })
    })
    return by
  }

  const sy = y
  const supBottom = block(MX, 'Supplier', [
    supplier?.name || '—', supplier?.contact_name, supplier?.email, supplier?.phone,
  ])
  y = sy
  const delBottom = block(MX + boxW + 6, 'Deliver to', [
    company.name || 'Curtain Ideas',
    company.delivery_address || company.address,
    company.delivery_note,
  ])
  y = Math.max(supBottom, delBottom) + 6

  if (po?.notes) {
    setFill(WARM_100); doc.rect(MX, y, CW, 9, 'F')
    setColor(INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    doc.text(fit(po.notes, CW - 6), MX + 3, y + 5.8)
    y += 13
  }

  /* ---- Lines ---- */
  drawTableHead()

  const rows = poRows(lines, supplier, showPricing)
  const ROW_H = 9
  rows.forEach((r, i) => {
    if (y + ROW_H > MB) { drawHeader(); drawTableHead() }
    setFill(i % 2 === 0 ? WHITE : WARM_100)
    doc.rect(MX, y, CW, ROW_H, 'F')
    COLS.forEach(c => {
      const isDesc = c.key === 'desc'
      setColor(isDesc ? INK : WARM_300)
      doc.setFont('helvetica', isDesc ? 'bold' : 'normal')
      doc.setFontSize(isDesc ? 8.5 : 8)
      if (c.key === 'qty') { setColor(INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(9) }
      if (c.key === 'total') { setColor(INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5) }
      doc.text(fit(String(r[c.key] ?? ''), c.w - 4),
        c.align === 'right' ? c.x + c.w - 2 : c.x + 2, y + 5.9,
        { align: c.align === 'right' ? 'right' : 'left' })
    })
    doc.setDrawColor(...WARM_200); doc.setLineWidth(0.1)
    doc.line(MX, y + ROW_H, MXR, y + ROW_H)
    y += ROW_H
  })

  /* ---- Total ---- */
  if (showPricing) {
    if (y + 12 > MB) { drawHeader(); }
    setFill(ACCENT_DARK)
    doc.rect(MX, y, CW, 11, 'F')
    setColor(WHITE); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    doc.text('ESTIMATED TOTAL', MX + 3, y + 7.2)
    doc.setFontSize(12)
    doc.text(`$${money(poGrandTotal(lines))}`, MXR - 3, y + 7.4, { align: 'right' })
    y += 15

    setColor(WARM_300); doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
    doc.text('Prices are our records and exclude GST unless stated. Please confirm on acknowledgement.', MX, y)
  } else {
    y += 4
    setColor(WARM_300); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.text('Quantities only — please quote and confirm pricing on acknowledgement.', MX, y)
  }

  const safeSupplier = (supplier?.name || 'Supplier').replace(/[^a-zA-Z0-9]+/g, '_')
  downloadPDF(doc, `PO_${safeSupplier}_${poDisplayNumber(po)}.pdf`)
  return { lineCount: lines.length, priced: showPricing }
}
