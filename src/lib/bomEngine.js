/**
 * BOM Calculation Engine
 *
 * Pure functions — no React, no Supabase.
 * Formulas are defined per product_component row.
 *
 * Cost types:
 *   fixed            — fixed qty (buffer) per unit
 *   width_based      — width − deduction
 *   drop_based       — drop − deduction
 *   width_drop_based — (width − deduction) × (drop − buffer)
 *   labour           — hours per unit (buffer)
 *   per_interval     — base qty (buffer) + floor(width / interval)
 *                      e.g. 2 brackets + 1 per 500mm
 *   perimeter        — 2×(width + drop) ± deduction
 *                      e.g. cord that loops through track and drops
 *   fixed_per_width  — manual qty per width bucket (see GRID_WIDTHS)
 *                      e.g. 2 brackets up to 1200mm, 3 up to 1500mm
 */

export function calcQty(productComponent, widthMm, dropMm) {
  const deduction = Number(productComponent.formula_deduction) || 0
  const buffer    = Number(productComponent.formula_buffer)    || 0
  const interval  = Number(productComponent.formula_interval)  || 500
  const unit      = productComponent.component?.unit || 'each'

  let qty = 0

  switch (productComponent.cost_type) {
    case 'fixed':
      qty = buffer
      break

    case 'width_based':
      qty = widthMm - deduction
      if (unit === 'metres') qty = qty / 1000
      break

    case 'drop_based':
      qty = dropMm - deduction
      if (unit === 'metres') qty = qty / 1000
      break

    case 'width_drop_based':
      const w = widthMm - deduction
      const d = dropMm  - buffer
      qty = unit === 'm²' ? (w / 1000) * (d / 1000) : w * d
      break

    case 'labour':
      qty = buffer
      break

    case 'per_interval':
      // buffer = base qty, interval = spacing in mm
      // e.g. 2 base brackets + floor(2000 / 500) = 2 + 4 = 6
      qty = buffer + Math.floor(widthMm / interval)
      break

    case 'perimeter':
      // 2 × (width + drop), then apply deduction/buffer as offset
      // deduction subtracts, buffer adds
      // e.g. cord = 2×(W+D) − 200mm + 500mm tail
      const perim = 2 * (widthMm + dropMm)
      qty = perim - deduction + buffer
      if (unit === 'metres') qty = qty / 1000
      break

    case 'fixed_per_width':
      qty = qtyForWidth(productComponent.width_qty, widthMm)
      break

    default:
      qty = 0
  }

  return Math.max(0, Math.round(qty * 1000) / 1000)
}

/**
 * Look up the manual qty for a width from a { [gridWidth]: qty } map.
 * Uses the first bucket the width fits into (<= that width); anything wider
 * than the largest bucket falls back to the largest bucket's qty.
 */
export function qtyForWidth(widthQty, widthMm) {
  if (!widthQty) return 0
  const w = Number(widthMm) || 0
  for (const gw of GRID_WIDTHS) {
    if (w <= gw) return Number(widthQty[gw]) || 0
  }
  return Number(widthQty[GRID_WIDTHS[GRID_WIDTHS.length - 1]]) || 0
}

// Key used for snapshotted unit costs — component + colour variant.
export function priceKey(componentId, colourVariant) {
  return `${componentId}__${colourVariant?.suffix || ''}`
}

/**
 * Snapshot the current discounted unit cost of every component in a job's
 * recipes, so a confirmed job keeps the pricing it was confirmed at.
 */
export function buildPriceSnapshot(windowsWithBOM) {
  const snap = {}
  windowsWithBOM.forEach(win => {
    (win.bom || []).forEach(line => {
      const base     = Number(line.component?.unit_cost) || 0
      const discount = Number(line.component?.discount) || 0
      snap[priceKey(line.component_id, line.colour_variant)] = base * (1 - discount / 100)
    })
  })
  return snap
}

/**
 * Snapshot the calculated quantities per window, so later edits to a recipe or
 * a shared width schedule can't change what a confirmed job was costed at.
 * Shape: { [windowId]: { [priceKey]: qty } }
 */
export function buildQtySnapshot(windowsWithBOM) {
  const snap = {}
  windowsWithBOM.forEach(win => {
    const perWindow = {}
    ;(win.bom || []).forEach(line => {
      perWindow[priceKey(line.component_id, line.colour_variant)] = line.calculated_qty
    })
    snap[win.id] = perWindow
  })
  return snap
}

/**
 * Build the BOM lines for one window.
 *
 * `priceMap` is an optional snapshot of unit costs taken when the job was
 * confirmed ({ "<componentId>__<suffix>": unitCost }). When a line is present
 * in it that price wins, so a confirmed job's cost never moves as component
 * pricing changes.
 */
export function calcWindowBOM(productComponents, widthMm, dropMm, priceMap = null, qtyMap = null) {
  return productComponents.map(pc => {
    const snapKeyQty     = priceKey(pc.component_id, pc.colour_variant)
    const frozenQty      = qtyMap && qtyMap[snapKeyQty] !== undefined ? Number(qtyMap[snapKeyQty]) : null
    const calculated_qty = frozenQty !== null ? frozenQty : calcQty(pc, widthMm, dropMm)
    const base_cost      = Number(pc.component?.unit_cost) || 0
    const discount       = Number(pc.component?.discount) || 0
    const live_cost      = base_cost * (1 - discount / 100)
    const snapKey        = priceKey(pc.component_id, pc.colour_variant)
    const snapped        = priceMap && priceMap[snapKey] !== undefined ? Number(priceMap[snapKey]) : null
    const unit_cost      = snapped !== null ? snapped : live_cost
    // Build the display P/N — base P/N + colour suffix if a colour is selected
    const basePn         = pc.component?.supplier_pn || ''
    const colourSuffix   = pc.colour_variant?.suffix || ''
    const display_pn     = basePn && colourSuffix ? `${basePn}-${colourSuffix}` : (basePn || colourSuffix || '')
    return {
      product_component_id: pc.id,
      component_id:         pc.component_id,
      component:            pc.component,
      colour_variant:       pc.colour_variant || null,
      display_pn,
      calculated_qty,
      override_qty:         null,
      unit_cost_snapshot:   unit_cost,
      base_cost,
      discount,
      get qty()       { return this.override_qty ?? this.calculated_qty },
      get line_cost() { return this.qty * this.unit_cost_snapshot },
    }
  })
}

export function calcJobSummary(windowsWithBOM) {
  // Group by component_id + colour_variant so different colours are separate lines
  const map = {}
  windowsWithBOM.forEach(win => {
    win.bom.forEach(line => {
      const colourKey = line.colour_variant?.suffix || 'none'
      const key = `${line.component_id}__${colourKey}`
      if (!map[key]) {
        map[key] = {
          component:      line.component,
          colour_variant: line.colour_variant,
          display_pn:     line.display_pn,
          total_qty:      0,
          unit_cost:      line.unit_cost_snapshot,
          cuts:           [], // individual cut lengths in mm, for bar components
        }
      }
      map[key].total_qty += line.qty
      // Track per-window cut lengths for bar components so bin packing can work correctly
      if (line.component?.order_type === 'bar' && line.qty > 0) {
        const unit  = line.component?.unit || 'each'
        const cutMm = unit === 'metres' ? Math.round(line.qty * 1000) : Math.round(line.qty)
        map[key].cuts.push(cutMm)
      }
    })
  })
  return Object.values(map)
    .map(r => ({ ...r, total_cost: r.total_qty * r.unit_cost }))
    .sort((a, b) => a.component.name.localeCompare(b.component.name))
}

export const fmt    = n => Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtQty = n => Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(3).replace(/\.?0+$/, '')

export function calcCostAtWidth(productComponents, widthMm) {
  return productComponents.reduce((total, pc) => {
    const qty      = calcQty(pc, widthMm, 0)
    const base     = Number(pc.component?.unit_cost) || 0
    const discount = Number(pc.component?.discount) || 0
    const cost     = base * (1 - discount / 100)
    return total + qty * cost
  }, 0)
}

export const GRID_WIDTHS = [900,1200,1500,1800,2100,2400,2700,3000,3300,3600,3900,4200,4500,4800,5100,5400,5700,6000]

// Human-readable formula description for display in recipe lists and modals
export function formulaDescription(pc) {
  const d  = Number(pc.formula_deduction)
  const b  = Number(pc.formula_buffer)
  const iv = Number(pc.formula_interval) || 500
  const u  = pc.component?.unit || 'each'
  switch (pc.cost_type) {
    case 'fixed':            return `${b} ${u} each`
    case 'width_based':      return `width − ${d}mm`
    case 'drop_based':       return `drop − ${d}mm`
    case 'width_drop_based': return `(W−${d}) × (D−${b})mm`
    case 'labour':           return `${b}h per unit`
    case 'per_interval':     return `${b} base + 1 per ${iv}mm width`
    case 'perimeter':        return `2×(W+D)${d ? ` − ${d}mm` : ''}${b ? ` + ${b}mm` : ''}`
    case 'fixed_per_width': {
      const set = GRID_WIDTHS.filter(w => Number(pc.width_qty?.[w]) > 0)
      if (set.length === 0) return 'qty per width — not set'
      const first = set[0], last = set[set.length - 1]
      return `${pc.width_qty[first]} up to ${first}mm … ${pc.width_qty[last]} up to ${last}mm`
    }
    default: return ''
  }
}
