/**
 * exportJobPDF
 *
 * Generates a printable A4 PDF for the factory with:
 * - Header: job info (customer, job number, date)
 * - Page 1: Summary component list (total qty per component across all windows)
 * - Following pages: one section per window with its individual BOM
 *
 * Uses jsPDF loaded from CDN at runtime — no build-time dependency needed.
 */

const ACCENT_DARK  = [28, 46, 15]   // --accent-dark #1C2E0F
const ACCENT       = [141, 199, 63] // --accent #8DC73F
const WARM_100     = [241, 245, 249]
const WARM_200     = [226, 232, 240]
const WARM_300     = [148, 163, 184]
const INK          = [15, 23, 42]
const WHITE        = [255, 255, 255]

const loadJsPDF = () => new Promise((resolve, reject) => {
  if (window.jspdf) return resolve(window.jspdf.jsPDF)
  const s = document.createElement('script')
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  s.onload = () => resolve(window.jspdf.jsPDF)
  s.onerror = reject
  document.head.appendChild(s)
})

export async function exportJobPDF(job, windowsWithBOM, jobSummary, products) {
  const jsPDF = await loadJsPDF()
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const PW  = 210  // page width
  const PH  = 297  // page height
  const MX  = 14   // left margin
  const MXR = 196  // right margin
  const CW  = MXR - MX  // content width
  const MB  = 280  // bottom threshold — start new page before this

  let y        = 0
  let pageNum  = 1

  // ---- Helpers ----

  const setColor = (rgb) => { doc.setTextColor(...rgb) }
  const setFill  = (rgb) => { doc.setFillColor(...rgb) }
  const setDraw  = (rgb) => { doc.setDrawColor(...rgb) }

  const addPage = () => {
    doc.addPage()
    pageNum++
    y = drawPageHeader()
  }

  const checkPage = (neededHeight) => {
    if (y + neededHeight > MB) addPage()
  }

  // Thin grey rule
  const rule = (yy = y, color = WARM_200) => {
    setDraw(color)
    doc.setLineWidth(0.2)
    doc.line(MX, yy, MXR, yy)
  }

  // Table header row (dark green)
  const tableHeader = (cols) => {
    setFill(ACCENT_DARK)
    doc.rect(MX, y, CW, 7, 'F')
    setColor(WHITE)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    cols.forEach(({ text, x, align }) => {
      doc.text(text, x, y + 5, { align: align || 'left' })
    })
    y += 7
  }

  // Table data row
  const tableRow = (cols, rowIndex, height = 7) => {
    const bg = rowIndex % 2 === 0 ? WARM_100 : WHITE
    setFill(bg)
    doc.rect(MX, y, CW, height, 'F')
    setColor(INK)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    cols.forEach(({ text, x, align, bold }) => {
      if (bold) doc.setFont('helvetica', 'bold')
      doc.text(String(text ?? '—'), x, y + (height / 2) + 1.5, { align: align || 'left' })
      if (bold) doc.setFont('helvetica', 'normal')
    })
    y += height
  }

  const fmtQty = n => {
    const num = Number(n)
    return num % 1 === 0 ? String(num) : num.toFixed(3).replace(/\.?0+$/, '')
  }

  // ---- Page header (drawn on every page) ----
  const drawPageHeader = () => {
    // Dark green bar
    setFill(ACCENT_DARK)
    doc.rect(0, 0, PW, 18, 'F')

    // Company name
    setColor(WHITE)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('Curtain Ideas', MX, 12)

    // Doc title
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(255, 255, 255, 0.7)
    setColor([180, 210, 120])
    doc.text('Job Work Order', MX + 42, 12)

    // Page number (right side)
    setColor(WHITE)
    doc.setFontSize(8)
    doc.text(`Page ${pageNum}`, MXR, 12, { align: 'right' })

    return 24 // return starting y after header
  }

  // ---- PAGE 1 ----
  y = drawPageHeader()

  // Job info block
  const dateStr = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
  setFill(WARM_100)
  doc.roundedRect(MX, y, CW, 22, 2, 2, 'F')
  setColor(INK)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(job.customer_name || 'Untitled Job', MX + 5, y + 9)

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  setColor(WARM_300)
  const meta = [
    job.job_number ? `Job #${job.job_number}` : null,
    `${(job.windows || []).length} window${(job.windows||[]).length !== 1 ? 's' : ''}`,
    `Printed ${dateStr}`,
  ].filter(Boolean).join('   ·   ')
  doc.text(meta, MX + 5, y + 17)
  y += 28

  // ---- SUMMARY SECTION ----
  setColor(WARM_300)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('SUMMARY — ALL COMPONENTS', MX, y)
  y += 5

  tableHeader([
    { text: 'Component',     x: MX + 2 },
    { text: 'Part No.',      x: MX + 80 },
    { text: 'Unit',          x: MX + 125 },
    { text: 'Total Qty',     x: MXR - 2, align: 'right' },
  ])

  jobSummary.forEach((row, i) => {
    checkPage(8)
    tableRow([
      { text: row.component.name,                        x: MX + 2,    bold: true },
      { text: row.component.supplier_pn || '—',          x: MX + 80 },
      { text: row.component.unit,                        x: MX + 125 },
      { text: fmtQty(row.total_qty),                     x: MXR - 2,   align: 'right', bold: true },
    ], i)
  })

  // Summary total bar
  setFill(ACCENT)
  doc.rect(MX, y, CW, 7, 'F')
  setColor(WHITE)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.text(`${jobSummary.length} components across ${(job.windows||[]).length} windows`, MX + 2, y + 5)
  y += 7

  y += 10

  // ---- PER-WINDOW SECTIONS ----
  windowsWithBOM.forEach((win, winIdx) => {
    const product   = products.find(p => p.id === win.product_id)
    const rowHeight = 7
    const sectionHeight = 12 + 7 + win.bom.length * rowHeight + 10

    checkPage(sectionHeight)

    // Window heading bar
    setFill(WARM_200)
    doc.rect(MX, y, CW, 9, 'F')
    setColor(INK)
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `${win.label || `Window ${winIdx + 1}`}`,
      MX + 3, y + 6.5
    )
    // Product + dimensions on the right
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    setColor(WARM_300)
    const dimText = `${product?.name || '—'}   ${win.width_mm}W × ${win.drop_mm}D mm`
    doc.text(dimText, MXR - 2, y + 6.5, { align: 'right' })
    y += 9

    // Column headers
    tableHeader([
      { text: 'Component', x: MX + 2 },
      { text: 'Part No.',  x: MX + 80 },
      { text: 'Unit',      x: MX + 125 },
      { text: 'Qty',       x: MXR - 2,  align: 'right' },
    ])

    // BOM lines
    if (win.bom.length === 0) {
      setFill(WHITE)
      doc.rect(MX, y, CW, 8, 'F')
      setColor(WARM_300)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'italic')
      doc.text('No components in recipe', MX + 2, y + 5.5)
      y += 8
    } else {
      win.bom.forEach((line, li) => {
        checkPage(rowHeight + 2)
        const effectiveQty = line.override_qty ?? line.calculated_qty
        tableRow([
          { text: line.component?.name || '—',        x: MX + 2,   bold: true },
          { text: line.component?.supplier_pn || '—', x: MX + 80 },
          { text: line.component?.unit || '—',        x: MX + 125 },
          { text: fmtQty(effectiveQty),               x: MXR - 2,  align: 'right', bold: true },
        ], li)
      })
    }

    y += 6
  })

  // ---- Save ----
  const customer = (job.customer_name || 'job').replace(/\s+/g, '_')
  const jobNo    = job.job_number ? `_${job.job_number}` : ''
  doc.save(`WorkOrder_${customer}${jobNo}.pdf`)
}
