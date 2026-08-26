/**
 * printPDF
 *
 * Sends a jsPDF document straight to the browser's print dialog instead of
 * downloading a file. Loads the PDF into a hidden same-origin iframe (via a
 * blob: URL, so no cross-origin restriction applies) and calls print() on it
 * once loaded — this is the standard way to trigger printing from a web app,
 * since browsers don't allow silently printing with no dialog at all.
 *
 * The user's browser print dialog still lets them choose "Save as PDF" as the
 * destination if they want a file instead of a physical printout, so nothing
 * is lost by not offering a separate download.
 *
 * Falls back to downloading the file if anything above fails (e.g. a browser
 * that blocks the iframe).
 */
export function printPDF(doc, filename) {
  try {
    const blobUrl = doc.output('bloburl')
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right  = '0'
    iframe.style.bottom = '0'
    iframe.style.width  = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'

    let printed = false

    const cleanup = () => {
      if (iframe.parentNode) document.body.removeChild(iframe)
      URL.revokeObjectURL(blobUrl)
    }

    // Attaching an iframe makes the browser load about:blank before anything
    // else, and that fires `load` exactly like a real document does. Printing
    // on it put an empty sheet in front of whoever pressed the button, which
    // they had to dismiss before the real one appeared. So only print for the
    // blob we actually asked for, and only once.
    const isDocumentReady = () => {
      try {
        return (iframe.contentWindow?.location?.href || '').startsWith('blob:')
      } catch {
        return true   // unreadable means it isn't the about:blank placeholder
      }
    }

    iframe.onload = () => {
      if (printed || !isDocumentReady()) return
      printed = true
      try {
        iframe.contentWindow.focus()
        iframe.contentWindow.print()
      } catch {
        doc.save(filename)
      }
      // The print dialog is modal in most browsers, but we can't detect when
      // the user dismisses it — keep the iframe around long enough to cover
      // that, then discard it.
      setTimeout(cleanup, 5 * 60 * 1000)
    }
    iframe.onerror = () => { cleanup(); doc.save(filename) }

    // src before attaching, so the one load event we get is the PDF itself.
    iframe.src = blobUrl
    document.body.appendChild(iframe)
  } catch {
    doc.save(filename)
  }
}
