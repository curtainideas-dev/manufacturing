/**
 * exportJobLabels
 *
 * Generates one thermal label per window (track / blind) for a job.
 * Sized for a 62 x 40 mm die-cut thermal label (Brother QL-800, 62 mm roll).
 * Mono / black only — the QL-800 is a black-only direct-thermal printer.
 *
 * Each label shows: logo · item i/n · customer · job # · window label ·
 * product name · W×H · date of manufacture (DOM) · date of invoice (DOI).
 *
 * jsPDF is loaded from CDN at runtime — matches src/lib/exportPDF.js
 * (no build-time dependency).
 */

// ---- Tunables (change these one line each) ----
const LABEL_W = 62          // mm — label width (62 mm roll)
const LABEL_H = 40          // mm — label height

// The label header prints a black silhouette of this image (auto-converted at
// print time so it prints cleanly on the black-only thermal printer). It's the
// app favicon (same-origin) — replace that file to change the printed logo.
const LOGO_URL = '/favicon.png'
// Set to a data URL to override the auto-loaded logo; null uses LOGO_URL, and
// if that can't load it falls back to the "Curtain Ideas" wordmark.
const LOGO_DATA_URL = null
const LOGO_MAX_H = 7        // mm — printed logo height

const loadJsPDF = () => new Promise((resolve, reject) => {
  if (window.jspdf) return resolve(window.jspdf.jsPDF)
  const s = document.createElement('script')
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  s.onload = () => resolve(window.jspdf.jsPDF)
  s.onerror = reject
  document.head.appendChild(s)
})

// Load LOGO_URL and convert it to a black silhouette on a transparent
// background (any non-white/opaque pixel → black). Prints cleanly on a
// black-only thermal printer. Returns { url, aspect } or null on failure.
async function loadMonoLogo() {
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image()
      im.onload = () => res(im)
      im.onerror = rej
      im.src = LOGO_URL
    })
    const natW = img.naturalWidth || 1
    const natH = img.naturalHeight || 1
    const w = 240
    const h = Math.max(1, Math.round(natH * (w / natW)))
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const ctx = cv.getContext('2d')
    ctx.drawImage(img, 0, 0, w, h)
    const imgData = ctx.getImageData(0, 0, w, h)
    const px = imgData.data
    for (let k = 0; k < px.length; k += 4) {
      const a   = px[k + 3]
      const lum = 0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2]
      if (a > 128 && lum < 240) {
        px[k] = 0; px[k + 1] = 0; px[k + 2] = 0; px[k + 3] = 255
      } else {
        px[k + 3] = 0 // transparent
      }
    }
    ctx.putImageData(imgData, 0, 0)
    return { url: cv.toDataURL('image/png'), aspect: w / h }
  } catch {
    return null
  }
}

// Format a 'YYYY-MM-DD' date string as dd/mm/yyyy (en-AU); '—' when empty.
function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(`${d}T00:00:00`)
  if (isNaN(dt)) return '—'
  return dt.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Truncate a string to fit maxWidth (mm) at the current font, adding an ellipsis.
function fitText(doc, text, maxWidth) {
  const str = String(text ?? '')
  if (doc.getTextWidth(str) <= maxWidth) return str
  let out = str
  while (out.length > 1 && doc.getTextWidth(out + '…') > maxWidth) {
    out = out.slice(0, -1)
  }
  return out + '…'
}

export async function exportJobLabels(job, windowsWithBOM, products) {
  const jsPDF = await loadJsPDF()
  const logo  = LOGO_DATA_URL ? { url: LOGO_DATA_URL, aspect: null } : await loadMonoLogo()

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [LABEL_W, LABEL_H] })
  const PW = doc.internal.pageSize.getWidth()
  const M  = 3 // margin
  const textW = PW - M * 2 // full-width text column

  const windows = windowsWithBOM || []

  for (let i = 0; i < windows.length; i++) {
    if (i > 0) doc.addPage([LABEL_W, LABEL_H], 'landscape')
    const win     = windows[i]
    const product = products.find(p => p.id === win.product_id)

    // ---- Header: logo / wordmark + item counter ----
    const counter = `${i + 1}/${windows.length}`
    let headerBottom = M + 6
    if (logo) {
      const fmt   = logo.url.includes('image/jpeg') ? 'JPEG' : 'PNG'
      const logoW = logo.aspect ? LOGO_MAX_H * logo.aspect : 0 // 0 = auto from aspect
      doc.addImage(logo.url, fmt, M, M, logoW, LOGO_MAX_H)
      headerBottom = M + LOGO_MAX_H
    } else {
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text('Curtain Ideas', M, M + 4)
      headerBottom = M + 6
    }
    // Item counter, top-right (e.g. 1/9)
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(counter, PW - M, M + 4, { align: 'right' })

    // thin rule under the header
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.2)
    doc.line(M, headerBottom, PW - M, headerBottom)

    // ---- Text ----
    let y = headerBottom + 4.5
    doc.setTextColor(0, 0, 0)

    // Customer
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(fitText(doc, job.customer_name || 'Untitled', textW), M, y)
    y += 4.5

    // Job number
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(fitText(doc, job.job_number ? `Job #${job.job_number}` : 'No job #', textW), M, y)
    y += 5

    // Window / track label
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(fitText(doc, win.label || `Window ${i + 1}`, textW), M, y)
    y += 4

    // Product name
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(fitText(doc, product?.name || '—', textW), M, y)
    y += 5

    // Dimensions — width × height (drop), prominent for the factory floor
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(fitText(doc, `${win.width_mm} × ${win.drop_mm} mm  (W × H)`, textW), M, y)
    y += 4.5

    // Dates — manufacture (DOF) and invoice (DOI), one compact line
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(
      fitText(doc, `DOM ${fmtDate(job.date_manufacture)}    DOI ${fmtDate(job.date_invoice)}`, textW),
      M, y
    )
  }

  const customer = (job.customer_name || 'job').replace(/\s+/g, '_')
  const jobNo    = job.job_number ? `_${job.job_number}` : ''
  doc.save(`Labels_${customer}${jobNo}.pdf`)
}
