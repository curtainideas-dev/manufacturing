/**
 * exportJobPack
 *
 * The one document a job goes out on — everything the floor needs, in the
 * order they need it, as a single file:
 *
 *   1. BILL OF MATERIALS   every component the job needs, with a column per
 *                          room and a total at the end.
 *   2. CUT SHEET           whichever sheet the job's product type calls for,
 *                          drawn by exportCutSheet's own code so the section
 *                          and the standalone print can never differ.
 *   3. THE ORIGINAL PO     the customer's own order, merged in as pages.
 *
 * It replaces the old work order, which printed a summary and then repeated
 * the entire BOM once per window. That answered "what does this window need"
 * at the cost of the question actually asked while picking — "how many of
 * these do I take, and which rooms are they for" — and turned a five-window
 * job into six pages of near-identical tables. The matrix answers both at
 * once, and usually on one page.
 *
 * Downloaded rather than printed. The other sheets go straight to the print
 * dialog because they are consumed at the saw; this one is the record that
 * gets filed and emailed, so it wants to be a file.
 */

import { jobBOMMatrix, jobProductType, fmtQty } from './bomEngine'
import { drawCutSheet } from './exportCutSheet'
import {
  ACCENT_DARK, ACCENT, WARM_100, WARM_200, WARM_300, INK, WHITE,
  loadJsPDF, headerDrawer, clip as clipText, footnote,
  downloadWithAppendix, jobFilename,
} from './pdfKit'

/* --------------------------------------------------------------------------
 * The matrix
 *
 * Landscape, always — a room is a column, and a column that has to be squeezed
 * to fit in portrait stops being readable at about four rooms, which is a
 * small job. Landscape holds nine before it has to continue on another page,
 * and a job of more than nine rooms is rare enough that a second page is a
 * fair price for every other job staying on one.
 *
 * When it does continue, the component and unit columns repeat and so does
 * the total — so each page is a complete, readable table of the rooms it
 * covers, rather than a fragment that only means something held against the
 * page before it.
 * ------------------------------------------------------------------------ */

const W_NAME = 64, W_UNIT = 15, W_TOTAL = 24
const ROOM_MIN = 18, ROOM_MAX = 34

export function drawBOMMatrix(doc, {
  windowsWithBOM = [], jobExtras = [], drawHeader, pageNum = 1,
}) {
  const MX = 12, MXR = 285, CW = MXR - MX
  const MB = 196
  let y = 0

  const setColor = rgb => doc.setTextColor(...rgb)
  const setFill  = rgb => doc.setFillColor(...rgb)
  const fit      = (text, maxW) => clipText(doc, text, maxW)

  const { columns, rows, hasExtras } = jobBOMMatrix(windowsWithBOM, jobExtras)

  // How many rooms fit across one page, and how wide each gets. Rooms spread
  // to fill the page when there are few, so a two-room job doesn't print two
  // narrow columns and a hand's width of nothing.
  const available  = CW - W_NAME - W_UNIT - W_TOTAL
  const perPage    = Math.max(1, Math.floor(available / ROOM_MIN))
  const pages      = []
  for (let i = 0; i < Math.max(1, columns.length); i += perPage) {
    pages.push(columns.slice(i, i + perPage))
  }

  pages.forEach((pageCols, pi) => {
    const roomW = pageCols.length > 0
      ? Math.min(ROOM_MAX, available / pageCols.length)
      : 0
    // Whatever the rooms don't use goes to the component name, which is the
    // column that always wants more.
    const nameW = W_NAME + (available - roomW * pageCols.length)

    const COLS = [
      { key: '__name',  title: 'Component', w: nameW },
      { key: '__unit',  title: 'UOM',       w: W_UNIT },
      ...pageCols.map(c => ({ key: c.key, title: c.label, w: roomW, align: 'right', room: true })),
      { key: '__total', title: 'Total',     w: W_TOTAL, align: 'right' },
    ]
    let runningX = MX
    COLS.forEach(c => { c.x = runningX; runningX += c.w })

    const title = pi === 0 ? 'Bill of Materials' : 'Bill of Materials (continued)'

    if (pi > 0) { doc.addPage(); pageNum++ }
    y = drawHeader(title, pageNum)

    const drawTableHeader = () => {
      setFill(ACCENT_DARK)
      doc.rect(MX, y, CW, 7, 'F')
      setColor(WHITE)
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
      COLS.forEach(c => {
        const tx = c.align === 'right' ? c.x + c.w - 2 : c.x + 2
        doc.text(fit(c.title, c.w - 3), tx, y + 4.8, { align: c.align || 'left' })
      })
      y += 7
    }

    drawTableHeader()

    const ROW_H = 9

    rows.forEach((row, i) => {
      if (y + ROW_H > MB) {
        doc.addPage(); pageNum++
        y = drawHeader(title, pageNum)
        drawTableHeader()
      }

      setFill(i % 2 === 0 ? WARM_100 : WHITE)
      doc.rect(MX, y, CW, ROW_H, 'F')

      COLS.forEach(c => {
        const tx = c.align === 'right' ? c.x + c.w - 2 : c.x + 2

        if (c.key === '__name') {
          setColor(INK); doc.setFontSize(8.5); doc.setFont('helvetica', 'bold')
          doc.text(fit(row.name, c.w - 4), c.x + 2, y + 4.4)
          // The part number rides under the name rather than taking a column
          // of its own: it is what gets typed into an order or matched against
          // a box on the shelf, but it is never what someone reads first.
          const pn = row.component?.supplier_pn
            ? `${row.component.supplier_pn}${row.colour_variant?.suffix ? `-${row.colour_variant.suffix}` : ''}`
            : null
          if (pn) {
            setColor(WARM_300); doc.setFontSize(6.5); doc.setFont('helvetica', 'normal')
            doc.text(fit(pn, c.w - 4), c.x + 2, y + 7.6)
          }
          return
        }

        if (c.key === '__unit') {
          setColor(WARM_300); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal')
          doc.text(fit(row.unit, c.w - 3), c.x + 2, y + 5.8)
          return
        }

        if (c.key === '__total') {
          setColor(INK); doc.setFontSize(9); doc.setFont('helvetica', 'bold')
          doc.text(fmtQty(row.total), tx, y + 5.8, { align: 'right' })
          return
        }

        // A room the component isn't needed in gets a middle dot rather than a
        // blank — an empty cell reads as something nobody filled in.
        const qty = row.cells[c.key]
        if (!qty) {
          setColor(WARM_200); doc.setFontSize(8); doc.setFont('helvetica', 'normal')
          doc.text('·', tx, y + 5.8, { align: 'right' })
          return
        }
        setColor(INK); doc.setFontSize(8.5); doc.setFont('helvetica', 'normal')
        doc.text(fmtQty(qty), tx, y + 5.8, { align: 'right' })
      })

      doc.setDrawColor(...WARM_200); doc.setLineWidth(0.1)
      doc.line(MX, y + ROW_H, MXR, y + ROW_H)
      y += ROW_H
    })

    // Closing bar — what this page's table adds up to.
    if (y + 7 > MB) { doc.addPage(); pageNum++; y = drawHeader(title, pageNum) }
    setFill(ACCENT)
    doc.rect(MX, y, CW, 7, 'F')
    setColor(WHITE); doc.setFontSize(8.5); doc.setFont('helvetica', 'bold')
    doc.text(
      `${rows.length} component${rows.length !== 1 ? 's' : ''} across `
      + `${columns.length} room${columns.length !== 1 ? 's' : ''}`
      + (pages.length > 1 ? `   ·   rooms ${pi * perPage + 1}–${pi * perPage + pageCols.length} on this page` : ''),
      MX + 2, y + 5)
    y += 7

    const notes = [
      'Quantities are per room, already through every deduction and allowance.',
      hasExtras
        ? 'Totals include job-level extras, which belong to the job rather than to any one room and so have no column.'
        : null,
      pages.length > 1
        ? 'The Total column is the whole job, not the rooms on this page.'
        : null,
    ].filter(Boolean).join(' ')
    footnote(doc, notes, MX, y + 5, CW)
  })

  return pageNum
}

/* --------------------------------------------------------------------------
 * The pack
 * ------------------------------------------------------------------------ */

/** `<order number>_<last name>_Job Pack.pdf` */
export function jobPackFilename(job) {
  return jobFilename(job, 'Job Pack')
}

/**
 * Build and download the pack.
 *
 * Returns what happened to the PO — `{ merged: true }`, or `{ merged: false,
 * reason }` when the job has none attached or the file could not be fetched.
 * The pack is saved either way: a PO that has gone missing must not cost
 * someone their bill of materials, and the caller can say what was left out.
 */
export async function exportJobPack(job, windowsWithBOM = [], {
  products = [], optionDefsFor = () => [], suppliers = [], kinds = [],
  jobExtras = [], includePO = true, stock = {},
} = {}) {
  const jsPDF = await loadJsPDF()
  const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  const type = jobProductType(job, windowsWithBOM, products)
  const drawHeader = headerDrawer(doc, {
    job,
    subtitle: `${windowsWithBOM.length} ${type === 'track' ? 'track' : 'blind'}${windowsWithBOM.length !== 1 ? 's' : ''}`,
    pageWidth: 297, marginX: 12, marginRight: 285,
  })

  const pageNum = drawBOMMatrix(doc, { windowsWithBOM, jobExtras, drawHeader, pageNum: 1 })

  drawCutSheet(doc, {
    job, windowsWithBOM, optionDefsFor, suppliers, kinds, products, stock,
    drawHeader, pageNum, startOnNewPage: true,
  })

  const po = includePO ? job?.po_pdf_url : null
  return downloadWithAppendix(doc, po, jobPackFilename(job))
}

// Kept so a caller can describe what it is about to produce without building
// it — the header of the confirm dialog that warns about a missing PO.
export function jobPackSections(job, windowsWithBOM = [], products = []) {
  return [
    'Bill of materials',
    jobProductType(job, windowsWithBOM, products) === 'track' ? 'Track cut sheet' : 'Blind cut sheet',
    job?.po_pdf_url ? 'Original PO' : null,
  ].filter(Boolean)
}

