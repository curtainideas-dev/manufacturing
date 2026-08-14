/**
 * exportPurchaseOrderXLSX
 *
 * Generates an .xlsx purchase order to send to a supplier — supplier
 * details, one row per line item, and an estimated total.
 *
 * Uses SheetJS (xlsx) loaded from CDN at runtime — no build-time dependency,
 * matching the jsPDF/pdf.js pattern used elsewhere in this app (cdnjs, not
 * jsdelivr — jsdelivr is blocked/unreliable in this environment).
 */

import { displayPN, orderUnitInfo, poDisplayNumber, poLineTotal, poGrandTotal } from './poEngine'

const loadXLSX = () => new Promise((resolve, reject) => {
  if (window.XLSX) return resolve(window.XLSX)
  const s = document.createElement('script')
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
  s.onload = () => resolve(window.XLSX)
  s.onerror = reject
  document.head.appendChild(s)
})

export async function exportPurchaseOrderXLSX(po, supplier, lines) {
  const XLSX = await loadXLSX()

  const dateStr = new Date(po.created_at || Date.now()).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const rows = [
    ['Curtain Ideas'],
    ['Purchase Order'],
    [],
    ['PO Number', poDisplayNumber(po), '', 'Date', dateStr],
    ['Supplier', supplier?.name || '—'],
  ]
  if (supplier?.contact_name) rows.push(['Contact', supplier.contact_name])
  if (supplier?.email)        rows.push(['Email', supplier.email])
  if (supplier?.phone)        rows.push(['Phone', supplier.phone])
  rows.push([])
  rows.push(['Part No.', 'Description', 'Colour', 'Qty', 'Order Unit', 'Unit Price', 'Line Total'])

  lines.forEach(l => {
    const info = l.component ? orderUnitInfo(l.component) : null
    rows.push([
      displayPN(l.component, l.colour_variant),
      l.component?.name || '',
      l.colour_variant?.name || '',
      Number(l.qty_ordered) || 0,
      info?.label || '',
      Number(l.unit_cost) || 0,
      poLineTotal(l),
    ])
  })

  const total = poGrandTotal(lines)
  rows.push([])
  rows.push(['', '', '', '', '', 'Estimated Total', total])
  if (po.notes) { rows.push([]); rows.push(['Notes', po.notes]) }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 14 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Purchase Order')

  const safeSupplier = (supplier?.name || 'Supplier').replace(/[^a-zA-Z0-9]+/g, '_')
  XLSX.writeFile(wb, `PO_${safeSupplier}_${poDisplayNumber(po)}.xlsx`)
}
