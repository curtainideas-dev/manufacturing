/**
 * exportLabels
 *
 * Thermal-label PDFs for a job:
 *   - exportPackagingLabels: 62 x 40 mm, one per window, goes on the packaging.
 *     A TRACK gets logo, item i/n, customer, job #, window, product, W×H and
 *     the two dates.
 *
 *     A BLIND gets a different label, because a different set of facts is
 *     what gets checked against the order when the box is opened — and the
 *     ones that are wrong are remakes, not annoyances. It carries the finished
 *     size, the fabric and its colour, the base bar colour, the control side
 *     and whether it is an over or under roll. The product name and the two
 *     dates come off to make room: on a 62 x 40mm label something has to, and
 *     of everything there those are what nobody at the other end is checking.
 *
 *     Which parts print as spec is the on_label tick on the KIND (see
 *     supabase_kind_on_label.sql), not a hard-coded search for "base rail" —
 *     the same shape as the cut sheet's own tick, and for the same reason.
 *   - exportTrackLabels: 62 x 15 mm strip, one per window, on the track/tube.
 *     Job # and window as the main lines; item i/n + year of manufacture
 *     in fine print. TRACKS ONLY — a blind does not get one. Its tube label
 *     would go on the tube itself, and a sticker under the rolled fabric is
 *     enough to cone the blind.
 *   - exportPartsLabels: 62 x 40 mm, for a separately-packaged parts bag. Logo,
 *     customer + job #, then a selected list of parts and quantities. Splits
 *     across multiple stickers when the list is long.
 *   - exportComponentLabels: 93 x 29 mm DK die-cut label, one per selected
 *     stock component (or component + colour). Name is the largest element
 *     (used to identify the part when picking), part number + colour below it
 *     for reordering, supplier + min qty on the bottom row, and a QR code
 *     (encoding the part number) on the right for future scanning.
 *
 * All print on a Brother QL-700 / QL-800 (black-only direct thermal). Most
 * labels use the 62 mm continuous roll; component labels use a 93 x 29 mm DK
 * die-cut roll. jsPDF is loaded from CDN at runtime (matches
 * src/lib/exportPDF.js — no build-time dependency).
 *
 * Each export goes straight to the browser's print dialog (see
 * src/lib/printPDF.js) rather than downloading a file.
 */

import { printPDF } from './printPDF'
import { labelSpecs, jobProductType } from './bomEngine'
import { assemblySpec } from './exportCutSheet'

// ---- Sizes (mm) ----
const PKG_W = 62, PKG_H = 40   // packaging label
const TRK_W = 62, TRK_H = 15   // track/tube label
const CMP_W = 93, CMP_H = 29   // component stock label (DK die-cut)
const BUSINESS_EMAIL = 'sales@curtainideas.com.au'
const BUSINESS_WEB   = 'curtainideas.com.au'

// The packaging label prints a black silhouette of this image (auto-converted at
// print time so it prints cleanly on the black-only printer). Same-origin file
// in /public — replace it to change the printed logo.
const LOGO_URL = '/logo.png'
// Set to a data URL to override the auto-loaded logo; null uses LOGO_URL, and
// if that can't load it falls back to the "Curtain Ideas" wordmark.
const LOGO_DATA_URL = null
const LOGO_MAX_H = 8        // mm — max printed logo height
const LOGO_MAX_W = 42       // mm — max printed logo width (wide wordmark)
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

const loadQRCode = () => new Promise((resolve, reject) => {
  if (window.qrcode) return resolve(window.qrcode)
  const s = document.createElement('script')
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'
  s.onload = () => resolve(window.qrcode)
  s.onerror = reject
  document.head.appendChild(s)
})

// Draw a QR code as vector rects (crisp on a direct-thermal printer, no
// canvas/PNG round-trip) at (x, y), sized size x size mm.
function drawQR(doc, qrFactory, text, x, y, size) {
  const qr = qrFactory(0, 'M')
  qr.addData(String(text ?? ''))
  qr.make()
  const count = qr.getModuleCount()
  const cell  = size / count
  doc.setFillColor(0, 0, 0)
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) doc.rect(x + c * cell, y + r * cell, cell, cell, 'F')
    }
  }
}

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

// The fabric a blind window was made in, off its own BOM line, so it reads
// exactly what the cut sheet and the stock deduction read.
function fabricOf(win) {
  const line = (win.bom || []).find(l => l.product_component_id === 'fabric-slot')
  if (!line?.component) return null
  const name = line.component.fabric_code
    ? `${line.component.fabric_code} ${line.component.name}`
    : line.component.name
  return line.colour_variant?.name ? `${name} · ${line.colour_variant.name}` : name
}

// ===== Packaging label — 62 x 40 mm =====
//
// optionDefsFor and kinds are only needed for blinds, and both default, so a
// caller that only ever prints track labels is unaffected.
export async function exportPackagingLabels(job, windowsWithBOM, products, {
  optionDefsFor = () => [], kinds = [],
} = {}) {
  const jsPDF = await loadJsPDF()
  const logo  = LOGO_DATA_URL ? { url: LOGO_DATA_URL, aspect: null } : await loadMonoLogo()

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PKG_W, PKG_H] })
  const PW = doc.internal.pageSize.getWidth()
  const M  = 3
  const textW = PW - M * 2

  const windows = windowsWithBOM || []
  const isBlindJob = jobProductType(job, windows, products) === 'blind'

  for (let i = 0; i < windows.length; i++) {
    if (i > 0) doc.addPage([PKG_W, PKG_H], 'landscape')
    const win     = windows[i]
    const product = products.find(p => p.id === win.product_id)
    const headerBottom = drawLogoHeader(doc, logo, PW, `${i + 1}/${windows.length}`)

    // A blind fits six lines between the rule and the QL's unprintable
    // bottom margin, and only just: the last baseline lands at ~35.3mm on a
    // 40mm label. The leading below is measured to that, so a line added here
    // does not quietly print off the bottom edge.
    let y = headerBottom + (isBlindJob ? 3.8 : 4)

    if (isBlindJob) {
      /* ---------------------------------------------------------- a blind --
       * Ordered top to bottom by what gets checked first when the box is
       * opened: whose it is, which window, then the size, then the three
       * specs that decide whether the blind is right or is a remake.
       * ------------------------------------------------------------------ */
      const jobNo = job.job_number ? `#${job.job_number}` : 'No job #'
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
      const jobW = doc.getTextWidth(jobNo)
      doc.text(fitText(doc, job.customer_name || 'Untitled', textW - jobW - 3), M, y)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
      doc.text(jobNo, PW - M, y, { align: 'right' })
      y += 4.3

      doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
      doc.text(fitText(doc, win.label || `Window ${i + 1}`, textW), M, y)
      y += 4.9

      // The size, and the biggest thing on the label. Finished, as ordered —
      // never the cut size, which is a different number and belongs at the
      // saw, not on a box going to a customer.
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
      doc.text(fitText(doc, `${win.width_mm} × ${win.drop_mm}`, textW - 16), M, y)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
      doc.text('W × H mm', PW - M, y, { align: 'right' })
      y += 4.3

      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
      doc.text(fitText(doc, fabricOf(win) || 'Fabric —', textW), M, y)
      y += 3.2

      // Whatever kinds are ticked for the label — the base bar and its colour
      // on the standard setup.
      const specs = labelSpecs(win.bom || [], kinds)
      if (specs.length > 0) {
        doc.text(fitText(doc, specs.map(sp => `${sp.role}: ${sp.value}`).join('   '), textW), M, y)
      }
      y += 3.3

      // The two that are a remake if they are the wrong way round, so they
      // print bold and last, where the eye lands.
      const { roll, control } = assemblySpec(win, optionDefsFor(win.product_id))
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
      doc.text(fitText(doc, [
        control ? `Control ${control}` : 'Control —',
        roll || 'Roll —',
      ].join('   ·   '), textW), M, y)
    } else {
      /* ---------------------------------------------------------- a track -- */
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
  }

  printPDF(doc, saveName('PackagingLabels', job))
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
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
    doc.text(counter, PW - M, 5.1, { align: 'right' })
    const counterW = doc.getTextWidth(counter)
    doc.setFontSize(8)
    doc.text(fitText(doc, job.job_number ? `Job #${job.job_number}` : 'No job #', PW - M * 2 - counterW - 2), M, 5.1)

    // Line 2 (main): window / room name
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.text(fitText(doc, win.label || `Window ${i + 1}`, PW - M * 2), M, 7.5)

    // Line 3 (fine print): email (left) + MFG year (right)
    const mfgYear = (job.date_manufacture || '').slice(0, 4) || '—'
    doc.setFontSize(5)
    doc.text(BUSINESS_EMAIL, M, 9.6)
    doc.text(`MFG ${mfgYear}`, PW - M, 9.6, { align: 'right' })

    // Line 4 (fine print): website
    doc.text(BUSINESS_WEB, M, 11.5)
  }

  printPDF(doc, saveName('TrackLabels', job))
}

// Draw the logo header (+ optional page counter) and return the header bottom Y.
function drawLogoHeader(doc, logo, PW, pageLabel) {
  const M = 3
  let headerBottom
  if (logo && logo.aspect) {
    const fmt   = logo.url.includes('image/jpeg') ? 'JPEG' : 'PNG'
    const logoH = Math.min(LOGO_MAX_H, LOGO_MAX_W / logo.aspect)
    const logoW = logoH * logo.aspect
    doc.addImage(logo.url, fmt, M, SAFE, logoW, logoH)
    headerBottom = SAFE + Math.max(logoH, 5.5)
  } else if (logo) {
    doc.addImage(logo.url, logo.url.includes('image/jpeg') ? 'JPEG' : 'PNG', M, SAFE, 0, LOGO_MAX_H)
    headerBottom = SAFE + LOGO_MAX_H
  } else {
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text('Curtain Ideas', M, SAFE + 4)
    headerBottom = SAFE + 6
  }
  if (pageLabel) {
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text(pageLabel, PW - M, SAFE + 3.5, { align: 'right' })
  }
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2)
  doc.line(M, headerBottom, PW - M, headerBottom)
  return headerBottom
}

// ===== Parts-list label — 62 x 40 mm, split across stickers when long =====
// parts: [{ name, qty }]
export async function exportPartsLabels(job, parts) {
  const jsPDF = await loadJsPDF()
  const logo  = LOGO_DATA_URL ? { url: LOGO_DATA_URL, aspect: null } : await loadMonoLogo()

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PKG_W, PKG_H] })
  const PW = doc.internal.pageSize.getWidth()
  const M  = 3
  const textW = PW - M * 2

  const list  = (parts || []).filter(p => p && p.name && Number(p.qty) > 0)
  const ROWS_PER_PAGE = 6
  const pages = Math.max(1, Math.ceil(list.length / ROWS_PER_PAGE))

  for (let pg = 0; pg < pages; pg++) {
    if (pg > 0) doc.addPage([PKG_W, PKG_H], 'landscape')
    const headerBottom = drawLogoHeader(doc, logo, PW, pages > 1 ? `${pg + 1}/${pages}` : null)

    // Identity line — customer + job #
    let y = headerBottom + 4
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    const ident = `${job.job_number ? `Job #${job.job_number}` : 'No job #'}  ·  ${job.customer_name || 'Untitled'}`
    doc.text(fitText(doc, ident, textW), M, y)
    y += 4.8

    // Parts rows — name (left) + qty (right)
    const qtyX  = PW - M
    const nameW = textW - 12
    for (const p of list.slice(pg * ROWS_PER_PAGE, (pg + 1) * ROWS_PER_PAGE)) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
      doc.text(fitText(doc, String(p.name), nameW), M, y)
      doc.setFont('helvetica', 'bold')
      doc.text(String(p.qty), qtyX, y, { align: 'right' })
      y += 3.2
    }
  }

  printPDF(doc, saveName('PartsLabels', job))
}

// ===== Component stock label — 93 x 29 mm DK die-cut =====
// items: [{ name, partNumber, colour, supplier, minQty, unit }]
// Name is the largest element (used to identify the part when picking).
// Part number + colour sit below it for reordering, supplier + min qty on
// the bottom row, and a QR code (encoding the part number) on the right.
export async function exportComponentLabels(items) {
  const jsPDF  = await loadJsPDF()
  const qrcode = await loadQRCode()

  const list = (items || []).filter(it => it && it.name)
  if (list.length === 0) return

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [CMP_W, CMP_H] })
  const PW = doc.internal.pageSize.getWidth()
  const M  = 3
  const QR = 13
  const qrX = PW - M - QR
  const qrY = (CMP_H - QR) / 2
  const textW = qrX - M - 3   // left column width — 3mm gap before the QR

  for (let i = 0; i < list.length; i++) {
    if (i > 0) doc.addPage([CMP_W, CMP_H], 'landscape')
    const it = list[i]
    doc.setTextColor(0, 0, 0)

    // Part name — biggest element on the label, this is what a picker scans for
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
    doc.text(fitText(doc, it.name, textW), M, 8)

    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2)
    doc.line(M, 10, M + textW, 10)

    // Part number — for reordering, secondary in size, monospace
    doc.setFont('courier', 'bold'); doc.setFontSize(12)
    doc.text(fitText(doc, it.partNumber || '—', textW), M, 15.5)

    if (it.colour) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
      doc.text(fitText(doc, it.colour, textW), M, 20)
    }

    // Supplier (left) + min qty (right)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    const minLabel = `Min ${it.minQty ?? 0} ${it.unit || ''}`.trim()
    const minW = doc.getTextWidth(minLabel)
    doc.text(fitText(doc, it.supplier || '—', textW - minW - 4), M, 24)
    doc.setFont('helvetica', 'bold')
    doc.text(minLabel, M + textW, 24, { align: 'right' })

    drawQR(doc, qrcode, it.partNumber || it.name, qrX, qrY, QR)
  }

  const date = new Date().toISOString().slice(0, 10)
  printPDF(doc, `ComponentLabels_${date}.pdf`)
}
