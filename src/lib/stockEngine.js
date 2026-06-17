/**
 * Stock Engine
 *
 * Pure functions for stock calculations — no React, no Supabase.
 * Handles both pack-type and bar-type components.
 */

/**
 * Get a consistent key for a component + colour combination.
 * Used to group stock entries.
 */
export function stockKey(componentId, colourVariant) {
  const suffix = colourVariant?.suffix || ''
  return `${componentId}__${suffix}`
}

/**
 * Find suitable bars in stock for a required cut length.
 * Returns bars that are available and long enough, sorted by
 * best fit (smallest bar that fits first — minimises waste).
 */
export function findSuitableBars(stockBars, componentId, colourVariant, requiredLengthMm) {
  const suffix = colourVariant?.suffix || null
  return stockBars
    .filter(bar =>
      bar.component_id === componentId &&
      bar.status === 'available' &&
      bar.length_mm >= requiredLengthMm &&
      (bar.colour_variant?.suffix || null) === suffix
    )
    .sort((a, b) => a.length_mm - b.length_mm) // best fit first
}

/**
 * Check which components in a BOM are below minimum stock.
 * Returns array of { component, colour_variant, qty_required, qty_on_hand, qty_minimum }
 */
export function checkLowStock(jobSummary, stockMap) {
  const alerts = []
  jobSummary.forEach(row => {
    const key = stockKey(row.component.id, row.colour_variant)
    const stock = stockMap[key]
    if (!stock) return
    const afterDeduction = (stock.qty_on_hand || 0) - row.total_qty
    if (afterDeduction < (stock.qty_minimum || 0)) {
      alerts.push({
        component:      row.component,
        colour_variant: row.colour_variant,
        qty_required:   row.total_qty,
        qty_on_hand:    stock.qty_on_hand,
        qty_minimum:    stock.qty_minimum,
        qty_after:      afterDeduction,
      })
    }
  })
  return alerts
}

/**
 * First-fit decreasing bin packing.
 * Returns an array of bins, each with the cuts assigned to it and the leftover length.
 * Bins where a single cut exceeds the bar length are flagged as oversized.
 */
export function packCuts(cutsMm, barLengthMm) {
  const sorted = [...cutsMm].sort((a, b) => b - a)
  const bins = []
  for (const cut of sorted) {
    let placed = false
    for (const bin of bins) {
      if (!bin.oversized && bin.remaining >= cut) {
        bin.cuts.push(cut)
        bin.remaining -= cut
        placed = true
        break
      }
    }
    if (!placed) {
      bins.push({
        cuts:      [cut],
        remaining: barLengthMm - cut,
        oversized: cut > barLengthMm,
      })
    }
  }
  return bins
}

/**
 * Build a stock map from an array of stock rows for quick lookup.
 * { [componentId__colourSuffix]: stockRow }
 */
export function buildStockMap(stockRows) {
  const map = {}
  stockRows.forEach(row => {
    const key = stockKey(row.component_id, row.colour_variant)
    map[key] = row
  })
  return map
}