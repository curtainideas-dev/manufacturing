/**
 * pdfKit
 *
 * The plumbing every generated document shares — the palette, the page
 * furniture, text fitting, and getting a finished document out of the browser.
 *
 * It exists because there are now three documents that must look like one
 * company's paperwork: the job pack, the blind cut sheet and the track cut
 * sheet. Before this, each carried its own copy of the colours, its own
 * loadJsPDF and its own header bar, and they had already begun to drift.
 *
 * Nothing here knows what a window or a component is. That is the whole point:
 * the sheets decide what to say, this decides what it looks like.
 */

/* --------------------------------------------------------------------------
 * Palette — the app's CSS variables, as jsPDF wants them.
 * ------------------------------------------------------------------------ */
export const ACCENT_DARK = [28, 46, 15]    // --accent-dark #1C2E0F
export const ACCENT      = [141, 199, 63]  // --accent      #8DC73F
export const ACCENT_TINT = [180, 210, 120] // the lighter accent used on dark bars
export const WARM_100    = [245, 243, 240] // --warm-100    #F5F3F0
export const WARM_200    = [231, 226, 219] // --warm-200    #E7E2DB
export const WARM_300    = [140, 130, 121] // --warm-300    #8C8279
export const INK         = [31, 27, 22]    // --ink         #1F1B16
export const WHITE       = [255, 255, 255]
export const DANGER      = [185, 28, 28]
export const DANGER_BG   = [254, 226, 226]
export const GREEN_BG    = [222, 236, 198]

/** Placeholder for anything unanswered. Never a blank cell — a blank reads as an oversight. */
export const DASH = '—'

/* --------------------------------------------------------------------------
 * Libraries, loaded from cdnjs at runtime
 *
 * Same pattern the app already uses for jsPDF, pdf.js and SheetJS: no
 * build-time dependency, and nothing downloaded until someone actually asks
 * for a document. cdnjs rather than jsdelivr — jsdelivr is unreliable here.
 * ------------------------------------------------------------------------ */

const loadScript = (src, globalName) => new Promise((resolve, reject) => {
  if (window[globalName]) return resolve(window[globalName])
  const s = document.createElement('script')
  s.src = src
  s.onload = () => window[globalName]
    ? resolve(window[globalName])
    : reject(new Error(`${globalName} did not appear after loading ${src}`))
  s.onerror = () => reject(new Error(`Could not load ${src}`))
  document.head.appendChild(s)
})

export const loadJsPDF = () =>
  loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf')
    .then(ns => ns.jsPDF)

// Only ever loaded when a job actually has a PO to merge, which is why it
// isn't bundled with jsPDF above.
export const loadPdfLib = () =>
  loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js', 'PDFLib')

/* --------------------------------------------------------------------------
 * Text fitting
 * ------------------------------------------------------------------------ */

/**
 * Trim text to fit a column, ellipsis included, so a long fabric or component
 * name can never run into the cell beside it.
 *
 * Measured against the font currently set on the document, so call it after
 * setting the size and weight the text will actually be drawn in.
 */
export function clip(doc, text, maxW) {
  let t = String(text ?? DASH)
  if (doc.getTextWidth(t) <= maxW) return t
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1)
  return t + '…'
}

/** Wrap text to a width, returning the lines. A thin wrapper over jsPDF's own splitter. */
export function wrap(doc, text, maxW) {
  return doc.splitTextToSize(String(text ?? ''), maxW)
}

/* --------------------------------------------------------------------------
 * Page furniture
 * ------------------------------------------------------------------------ */

/**
 * The dark banner across the top of every page, and the numbers along it.
 *
 * Returns a function rather than drawing once, because the page number moves
 * and the title changes between sections of the same document — the job pack
 * runs "Bill of Materials", then "Cut Sheet", then the supplier's own PO.
 *
 * The returned drawer answers with the y to start content at, so no caller
 * has to know how tall the banner is.
 */
export function headerDrawer(doc, { job = {}, subtitle = null, pageWidth, marginX, marginRight }) {
  const dateStr = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

  return function drawHeader(title, pageNum) {
    doc.setFillColor(...ACCENT_DARK)
    doc.rect(0, 0, pageWidth, 16, 'F')

    doc.setTextColor(...WHITE)
    doc.setFontSize(12); doc.setFont('helvetica', 'bold')
    doc.text(title, marginX, 10.5)
    const titleW = doc.getTextWidth(title)

    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.setTextColor(...ACCENT_TINT)
    doc.text(job.customer_name || 'Untitled Job', marginX + titleW + 6, 10.5)

    doc.setTextColor(...WHITE); doc.setFontSize(8)
    const meta = [
      job.job_number ? `Job #${job.job_number}` : null,
      subtitle,
      dateStr,
      `Page ${pageNum}`,
    ].filter(Boolean).join('   ·   ')
    doc.text(meta, marginRight, 10.5, { align: 'right' })

    return 22
  }
}

/**
 * A footnote in the small grey type the sheets use for their "read this before
 * you cut" lines. Wrapped, so a long note doesn't run off the page.
 */
export function footnote(doc, text, x, y, maxW) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  doc.setTextColor(...WARM_300)
  const lines = wrap(doc, text, maxW)
  lines.forEach((line, i) => doc.text(line, x, y + i * 3.2))
  return y + lines.length * 3.2
}

/* --------------------------------------------------------------------------
 * Getting the document out
 * ------------------------------------------------------------------------ */

/** Save a jsPDF document as a file. */
export function downloadPDF(doc, filename) {
  doc.save(filename)
}

/** Save raw bytes (a merged document, which is no longer a jsPDF) as a file. */
export function downloadBytes(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoking immediately can cancel the download in some browsers; a moment
  // later is safely after the click has been handled.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Append another PDF's pages to a jsPDF document and save the result.
 *
 * The PO is merged rather than redrawn: it is the customer's own document, and
 * anything we re-render from it — even perfectly — is a copy we authored and
 * could get wrong. Merging keeps the pages byte-for-byte, which also means a
 * scanned or photographed PO comes through exactly as a scan, where a text
 * extraction would have produced nothing at all.
 *
 * jsPDF cannot import pages, so the finished document is handed to pdf-lib,
 * which copies both sets of pages into one file.
 *
 * Returns { merged: true } or { merged: false, reason } — a PO that can't be
 * fetched must not cost someone their cut sheet, so the pack is saved without
 * it and the caller is told why.
 */
export async function downloadWithAppendix(doc, appendixUrl, filename) {
  if (!appendixUrl) {
    downloadPDF(doc, filename)
    return { merged: false, reason: 'none' }
  }

  try {
    const [PDFLib, appendixBytes] = await Promise.all([
      loadPdfLib(),
      fetch(appendixUrl).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.arrayBuffer()
      }),
    ])

    const pack     = await PDFLib.PDFDocument.load(doc.output('arraybuffer'))
    const appendix = await PDFLib.PDFDocument.load(appendixBytes)
    const pages    = await pack.copyPages(appendix, appendix.getPageIndices())
    pages.forEach(p => pack.addPage(p))

    downloadBytes(await pack.save(), filename)
    return { merged: true, pageCount: pages.length }
  } catch (err) {
    downloadPDF(doc, filename)
    return { merged: false, reason: 'failed', error: String(err?.message || err) }
  }
}

/* --------------------------------------------------------------------------
 * Filenames
 * ------------------------------------------------------------------------ */

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

/** `<order number>_<last name>_<what it is>.pdf` */
export function jobFilename(job, what) {
  const orderNo = String(job?.job_number || '').replace(/[^\w.-]+/g, '_') || 'NoOrderNo'
  return `${orderNo}_${customerLastName(job?.customer_name)}_${what}.pdf`
}
