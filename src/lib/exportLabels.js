/**
 * exportLabels
 *
 * Two thermal-label PDFs per job, one page per window (track / blind):
 *   - exportPackagingLabels: 62 x 40 mm, goes on the packaging. Logo, item i/n,
 *     customer, job #, window, product, W×H, DOM/DOI.
 *   - exportTrackLabels: 62 x 15 mm strip, goes on the track/tube itself.
 *     Job # and window as the main lines; item i/n + year of manufacture
 *     in fine print.
 *
 * So each window yields 2 labels. Both print on a 62 mm continuous roll
 * (Brother QL-700 / QL-800 — black-only direct thermal). jsPDF is loaded from
 * CDN at runtime (matches src/lib/exportPDF.js — no build-time dependency).
 */

// ---- Sizes (mm) ----
const PKG_W = 62, PKG_H = 40   // packaging label
const TRK_W = 62, TRK_H = 15   // track/tube label
const BUSINESS_EMAIL = 'sales@curtainideas.com.au'

// The packaging label prints a black silhouette of this image (auto-converted at
// print time so it prints cleanly on the black-only printer). It's the app
// favicon (same-origin) — replace that file to change the printed logo.
const LOGO_URL = '/favicon.png'
// Set to a data URL to override the auto-loaded logo; null uses LOGO_URL, and
// if that can't load it falls back to the "Curtain Ideas" wordmark.
const LOGO_DATA_URL = null
const LOGO_MAX_H = 6        // mm — printed logo height
// The QL leaves ~3mm unprintable at the top and bottom of every label (a fixed
// hardware feed margin). Keep all content this far from the top/bottom edges.
const SAFE = 3.5           // mm

const loadJsPDF = () => new Promise((resolve, reject) => {
  if (window.jspdf) return resolve(window.jspdf.jsPDF)
  const s = document.createElement('script')
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  s.onload = () => resolve(window.jspdf.jsPDF)
  s.onerror = reject
  document.head.appendChild(s)
})

// Load LOGO_URL and convert it to a black silhouette on a transparent
// background (any non-white/opaque pixel → black). Returns { url, aspect } or null.
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

function saveName(prefix, job) {
  const customer = (job.customer_name || 'job').replace(/\s+/g, '_')
  const jobNo    = job.job_number ? `_${job.job_number}` : ''
  return `${prefix}_${customer}${jobNo}.pdf`
}

// ===== Packaging label — 62 x 40 mm =====
export async function exportPackagingLabels(job, windowsWithBOM, products) {
  const jsPDF = await loadJsPDF()
  const logo  = LOGO_DATA_URL ? { url: LOGO_DATA_URL, aspect: null } : await loadMonoLogo()

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PKG_W, PKG_H] })
  const PW = doc.internal.pageSize.getWidth()
  const M  = 3
  const textW = PW - M * 2

  const windows = windowsWithBOM || []
  for (let i = 0; i < windows.length; i++) {
    if (i > 0) doc.addPage([PKG_W, PKG_H], 'landscape')
    const win     = windows[i]
    const product = products.find(p => p.id === win.product_id)

    // Header: logo/wordmark + item counter (kept inside the printable safe zone)
    const counter = `${i + 1}/${windows.length}`
    let headerBottom = SAFE + LOGO_MAX_H
    if (logo) {
      const fmt   = logo.url.includes('image/jpeg') ? 'JPEG' : 'PNG'
      const logoW = logo.aspect ? LOGO_MAX_H * logo.aspect : 0
      doc.addImage(logo.url, fmt, M, SAFE, logoW, LOGO_MAX_H)
    } else {
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
      doc.text('Curtain Ideas', M, SAFE + 4)
    }
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text(counter, PW - M, SAFE + 3.5, { align: 'right' })

    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2)
    doc.line(M, headerBottom, PW - M, headerBottom)

    let y = headerBottom + 4
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text(fitText(doc, job.customer_name || 'Untitled', textW), M, y); y += 4

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(fitText(doc, job.job_number ? `Job #${job.job_number}` : 'No job #', textW), M, y); y += 4.5

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    doc.text(fitText(doc, win.label || `Window ${i + 1}`, textW), M, y); y += 3.5

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(fitText(doc, product?.name || '—', textW), M, y); y += 4

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    doc.text(fitText(doc, `${win.width_mm} × ${win.drop_mm} mm  (W × H)`, textW), M, y); y += 4

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.text(fitText(doc, `DOM ${fmtDate(job.date_manufacture)}    DOI ${fmtDate(job.date_invoice)}`, textW), M, y)
  }

  doc.save(saveName('PackagingLabels', job))
}

// ===== Track/tube label — 62 x 15 mm (products unused; kept for a consistent signature) =====
export async function exportTrackLabels(job, windowsWithBOM) {
  const jsPDF = await loadJsPDF()

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [TRK_W, TRK_H] })
  const PW = doc.internal.pageSize.getWidth()
  const M  = 2

  const windows = windowsWithBOM || []
  for (let i = 0; i < windows.length; i++) {
    if (i > 0) doc.addPage([TRK_W, TRK_H], 'landscape')
    const win = windows[i]
    doc.setTextColor(0, 0, 0)

    // Content kept inside the printable safe zone (~3mm unprintable top/bottom)
    // Line 1 (main): job number (left) + item counter (top-right)
    const counter = `${i + 1}/${windows.length}`
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
    doc.text(counter, PW - M, 5.6, { align: 'right' })
    const counterW = doc.getTextWidth(counter)
    doc.setFontSize(9)
    doc.text(fitText(doc, job.job_number ? `Job #${job.job_number}` : 'No job #', PW - M * 2 - counterW - 2), M, 5.6)

    // Line 2 (main): window / room name
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(fitText(doc, win.label || `Window ${i + 1}`, PW - M * 2), M, 8.5)

    // Line 3 (fine print): contact email (left) + MFG year (bottom-right)
    const mfgYear = (job.date_manufacture || '').slice(0, 4) || '—'
    doc.setFontSize(5.5)
    doc.text(BUSINESS_EMAIL, M, 11.3)
    doc.text(`MFG ${mfgYear}`, PW - M, 11.3, { align: 'right' })
  }

  doc.save(saveName('TrackLabels', job))
}
