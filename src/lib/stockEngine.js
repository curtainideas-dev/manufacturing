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
 * Build the { bar_id, offcut } consumption list for a bar component's cuts,
 * given a per-cut source selection.
 *
 * `packCuts` groups cuts into bins that *could* share one bar, but the picker
 * isn't limited to that — each individual cut can be sourced independently
 * (a specific offcut, or a fresh full bar), so several offcuts and a full bar
 * can be mixed within what was one bin. Cuts that both choose "full bar"
 * within the same bin still share a single bar, preserving the packing
 * optimisation for the common case.
 *
 * @param cutsMm required cut lengths (mm)
 * @param barLengthMm length of a full bar (mm)
 * @param selections   { "<binIdx>.<cutInBinIdx>": sourceId }
 *                      sourceId is '__full_bar__' or a specific offcut's id
 * @param leftoverChoices { "cut:<selKey>": {add,label,length_mm},
 *                          "bar:<binIdx>": {add,label,length_mm} }
 *                      opt-in "save the leftover as a new offcut" choices
 * @returns [{ bar_id, offcut }] — one entry per physical bar/offcut consumed,
 *          in the shape the deduct-stock handler already expects.
 */
export function buildBarDeductions(cutsMm, barLengthMm, selections, leftoverChoices = {}) {
  const packed = packCuts(cutsMm, barLengthMm)
  const bars = []

  const offcutFrom = (lo) => (lo?.add && lo.length_mm > 0)
    ? { label: lo.label?.trim() || `${Math.round(lo.length_mm)}mm`, length_mm: lo.length_mm }
    : null

  packed.forEach((bin, binIdx) => {
    const fullBarCutIdxs = []
    bin.cuts.forEach((cutLength, cutInBinIdx) => {
      const selKey = `${binIdx}.${cutInBinIdx}`
      const sel    = selections[selKey]
      if (sel === '__full_bar__') {
        fullBarCutIdxs.push(cutInBinIdx)
      } else if (sel) {
        bars.push({ bar_id: sel, offcut: offcutFrom(leftoverChoices[`cut:${selKey}`]) })
      }
    })
    if (fullBarCutIdxs.length > 0) {
      bars.push({ bar_id: '__full_bar__', offcut: offcutFrom(leftoverChoices[`bar:${binIdx}`]) })
    }
  })

  return bars
}

// Total individual cut slots across all bins — used to check every cut has a
// source selected before a bar-component line can be marked picked.
export function countCutSlots(cutsMm, barLengthMm) {
  return packCuts(cutsMm, barLengthMm).reduce((s, bin) => s + bin.cuts.length, 0)
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

/**
 * Look up a component's stock row, tolerating colour-key drift.
 *
 * Stock rows are keyed by component + colour suffix, so adding a colour variant
 * to a component that already had stock would otherwise orphan the existing row
 * (it was saved with no colour) and the holding would appear to vanish. When a
 * component has exactly one variant there is no ambiguity, so fall back to the
 * colourless row. Stock always follows the component id — never its name.
 */
export function getStock(stockMap, component, colourVariant) {
  if (!component) return undefined
  const exact = stockMap[stockKey(component.id, colourVariant)]
  if (exact) return exact
  const variants = component.colour_variants || []
  if (colourVariant && variants.length <= 1) {
    return stockMap[stockKey(component.id, null)]
  }
  return undefined
}

/**
 * Value of one stock holding at the discounted (what-you-pay) unit cost.
 * Bars are valued on total available length — full bars plus offcuts.
 */
export function stockValue(component, stock, offcutLengthMm = 0) {
  const base     = Number(component?.unit_cost) || 0
  const discount = Number(component?.discount) || 0
  const unitCost = base * (1 - discount / 100)
  const qty      = Number(stock?.qty_on_hand) || 0

  if (component?.order_type === 'bar') {
    // unit_cost is per metre for bar components
    const barLenMm  = Number(component.bar_length_mm) || 6000
    const totalMm   = qty * barLenMm + (Number(offcutLengthMm) || 0)
    return (totalMm / 1000) * unitCost
  }
  return qty * unitCost
}