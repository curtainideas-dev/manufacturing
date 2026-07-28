/**
 * pdfExtract
 *
 * Client-side PDF text extraction for the PO submission portal.
 * Loads pdf.js from CDN at runtime (same pattern as exportPDF/exportLabels).
 *
 * Works on TEXT-BASED PDFs only. A scanned/photographed PO has no text layer,
 * so extraction returns little or nothing — the fields simply stay blank for
 * the submitter to fill in. All guessed values are best-effort and editable.
 */

const PDFJS_VER = '3.11.174'

const loadPdfJs = () => new Promise((resolve, reject) => {
  if (window.pdfjsLib) return resolve(window.pdfjsLib)
  const s = document.createElement('script')
  s.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.min.js`
  s.onload = () => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.worker.min.js`
    resolve(window.pdfjsLib)
  }
  s.onerror = reject
  document.head.appendChild(s)
})

// Extract text from the first `maxPages` pages, reconstructing line breaks from
// each text item's vertical position (pdf.js joins runs without newlines, which
// makes label-based parsing impossible otherwise).
export async function extractPdfText(file, maxPages = 3) {
  const pdfjsLib = await loadPdfJs()
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  const pages = Math.min(pdf.numPages, maxPages)
  let out = ''
  for (let i = 1; i <= pages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    let lastY = null
    for (const it of content.items) {
      const y = it.transform ? it.transform[5] : null
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        out += '\n'
      } else if (out && !out.endsWith('\n')) {
        out += ' '
      }
      out += it.str
      lastY = y
    }
    out += '\n'
  }
  return out
}

// Value that follows a label — same line after the label, else the next line.
function labelValue(lines, labelRe, cap) {
  for (let i = 0; i < lines.length; i++) {
    if (labelRe.test(lines[i])) {
      const after = lines[i].replace(labelRe, '').replace(/^\s*[:#\-]?\s*/, '').trim()
      if (after) return after.slice(0, cap)
      if (lines[i + 1]) return lines[i + 1].trim().slice(0, cap)
    }
  }
  return ''
}

// Best-effort field guesses from PO text. Everything is editable afterwards.
export function guessFields(text) {
  const guess = {}
  const t = String(text || '').replace(/\r/g, '')
  const lines = t.split('\n').map(l => l.trim()).filter(Boolean)

  const email = t.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
  if (email) guess.email = email[0]

  const phone = t.match(/(?:\+?61|\(?0)[\d ()\-]{7,}\d/)
  if (phone) guess.phone = phone[0].trim()

  // PO reference — require the captured ref to contain a digit so headings like
  // "PURCHASE ORDER" don't grab the following word ("Customer").
  const po = t.match(/\b(?:p\.?o\.?|purchase\s*order|order\s*(?:no|number|#))\s*(?:number|no\.?|ref\.?|#)?\s*[:#\-]?\s*([a-z0-9][a-z0-9\-/]*\d[a-z0-9\-/]*)/i)
  if (po) guess.po_reference = po[1].trim().slice(0, 40)

  // Customer name — value after a customer/bill-to label
  const name = labelValue(lines, /^(?:customer|client|bill\s*to|sold\s*to|company)\b/i, 80)
  if (name) guess.customer_name = name

  // Address — prefer a bounded AU street+state+postcode, else a label value
  const au = t.match(/\d+[^,\n]{2,60}?,?\s*[A-Za-z .'\-]{2,40}\s+(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s+\d{4}/i)
  if (au) guess.customer_address = au[0].replace(/\s+/g, ' ').trim().slice(0, 140)
  else {
    const addr = labelValue(lines, /^address\b/i, 140)
    if (addr) guess.customer_address = addr
  }

  return guess
}
