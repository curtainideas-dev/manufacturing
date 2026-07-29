/**
 * exportComponentsCSV
 *
 * Exports the component library as a CSV for use as a P-touch Editor database
 * (Insert > Database), so container labels can be mail-merged from it.
 *
 * One row per component *per colour variant* — each colour is a separate
 * container with its own part number. Components without variants get one row.
 *
 * Written as UTF-8 with a byte-order mark: P-touch Editor and Excel on Windows
 * otherwise misread non-ASCII characters (e.g. m²).
 */

import { getStock } from './stockEngine'

const COLUMNS = [
  'Name',
  'PartNumber',
  'Colour',
  'Supplier',
  'Unit',
  'OrderType',
  'QtyOnHand',
  'MinQty',
  'UnitCost',
  'BarLengthMm',
]

// Quote a field only when it needs it; double up any embedded quotes.
function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const csvRow = (cells) => cells.map(csvCell).join(',')

export function buildComponentsCSV(components, suppliers = [], stockMap = {}) {
  const supplierName = (c) =>
    suppliers.find(s => s.id === c.supplier_id)?.name || c.supplier || ''

  const rows = []
  const sorted = [...components].sort((a, b) => a.name.localeCompare(b.name))

  sorted.forEach(c => {
    const variants = (c.colour_variants || [])
    const list = variants.length > 0 ? variants : [null]

    list.forEach(variant => {
      const stock    = getStock(stockMap, c, variant)
      const basePn   = c.supplier_pn || ''
      const suffix   = variant?.suffix || ''
      const partNo   = basePn && suffix ? `${basePn}-${suffix}` : (basePn || suffix)
      const base     = Number(c.unit_cost) || 0
      const discount = Number(c.discount) || 0

      rows.push(csvRow([
        c.name,
        partNo,
        variant?.name || '',
        supplierName(c),
        c.unit || '',
        c.order_type || 'pack',
        Number(stock?.qty_on_hand) || 0,
        Number(stock?.qty_minimum) || 0,
        (base * (1 - discount / 100)).toFixed(4),
        c.order_type === 'bar' ? (Number(c.bar_length_mm) || '') : '',
      ]))
    })
  })

  return [csvRow(COLUMNS), ...rows].join('\r\n')
}

// Trigger a browser download of `csv` as `filename`.
function downloadCSV(csv, filename) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportComponentsCSV(components, suppliers, stockMap) {
  const date = new Date().toISOString().slice(0, 10)
  downloadCSV(buildComponentsCSV(components, suppliers, stockMap), `Components_${date}.csv`)
}

/**
 * Stock-take sheet: what the system thinks is on hand (Expected) alongside
 * blank Actual / Variance columns to fill in while counting.
 *
 * Labour components are skipped — nothing physical to count. Bars are counted
 * in whole bars, with any offcut length shown for reference.
 */
const STOCKTAKE_COLUMNS = [
  'Category',
  'Name',
  'PartNumber',
  'Colour',
  'Unit',
  'MinQty',
  'Expected',
  'Actual',
  'Variance',
  'OffcutsMm',
]

export function buildStockTakeCSV(components, stockMap = {}, stockBars = []) {
  const rows = []
  const countable = components
    .filter(c => c.order_type !== 'labour')
    .sort((a, b) => (a.order_type || 'pack').localeCompare(b.order_type || 'pack') || a.name.localeCompare(b.name))

  countable.forEach(c => {
    const isBar    = c.order_type === 'bar'
    const variants = (c.colour_variants || [])
    const list     = variants.length > 0 ? variants : [null]

    list.forEach(variant => {
      const stock  = getStock(stockMap, c, variant)
      const basePn = c.supplier_pn || ''
      const suffix = variant?.suffix || ''
      const partNo = basePn && suffix ? `${basePn}-${suffix}` : (basePn || suffix)

      const offcutMm = isBar
        ? stockBars
            .filter(b => b.component_id === c.id && b.status === 'available' &&
              (b.colour_variant?.suffix || null) === (variant?.suffix || null))
            .reduce((s, b) => s + (Number(b.length_mm) || 0), 0)
        : 0

      rows.push(csvRow([
        isBar ? 'Tracks & Tubes' : 'Components',
        c.name,
        partNo,
        variant?.name || '',
        isBar ? 'bars' : (c.unit || ''),
        Number(stock?.qty_minimum) || 0,
        Number(stock?.qty_on_hand) || 0,
        '',   // Actual — filled in during the count
        '',   // Variance — filled in during the count
        isBar ? offcutMm : '',
      ]))
    })
  })

  return [csvRow(STOCKTAKE_COLUMNS), ...rows].join('\r\n')
}

export function exportStockTakeCSV(components, stockMap, stockBars) {
  const date = new Date().toISOString().slice(0, 10)
  downloadCSV(buildStockTakeCSV(components, stockMap, stockBars), `StockTake_${date}.csv`)
}
