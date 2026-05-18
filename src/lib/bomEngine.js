/**
 * BOM Calculation Engine
 *
 * Pure functions — no React, no Supabase.
 * Formulas are now defined per product_component, not per component.
 *
 * A product_component row looks like:
 * { component_id, component: {...}, cost_type, formula_deduction, formula_buffer, formula_divisor }
 *
 * A window has: product_id, width_mm, drop_mm
 */

/**
 * Calculate quantity for a single product_component line given window dimensions.
 */
export function calcQty(productComponent, widthMm, dropMm) {
  const deduction = Number(productComponent.formula_deduction) || 0
  const buffer    = Number(productComponent.formula_buffer)    || 0
  const divisor   = Number(productComponent.formula_divisor)   || 1
  const unit      = productComponent.component?.unit || 'each'

  let qty = 0

  switch (productComponent.cost_type) {
    case 'fixed':
      // buffer = fixed quantity (e.g. 2 flick sticks for centre open)
      qty = buffer
      break

    case 'width_based':
      // e.g. track extrusion = width − 13mm
      qty = widthMm - deduction
      if (unit === 'metres') qty = qty / 1000
      break

    case 'drop_based':
      // e.g. chain = drop − 50mm
      qty = dropMm - deduction
      if (unit === 'metres') qty = qty / 1000
      break

    case 'width_drop_based':
      // e.g. fabric = (width − deduction) × (drop − buffer)
      const w = widthMm - deduction
      const d = dropMm  - buffer
      qty = unit === 'm²' ? (w / 1000) * (d / 1000) : w * d
      break

    case 'labour':
      // buffer = hours per unit
      qty = buffer
      break

    default:
      qty = 0
  }

  return Math.max(0, Math.round(qty * 1000) / 1000)
}

/**
 * Calculate the full BOM for one window.
 * productComponents must be the recipe rows for the selected product,
 * each with a nested .component object (joined from the components table).
 */
export function calcWindowBOM(productComponents, widthMm, dropMm) {
  return productComponents.map(pc => {
    const calculated_qty = calcQty(pc, widthMm, dropMm)
    const base_cost      = Number(pc.component?.unit_cost) || 0
    const discount       = Number(pc.component?.discount) || 0
    // discount lives on the component itself (set in the component library)
    const unit_cost      = base_cost * (1 - discount / 100)
    return {
      product_component_id: pc.id,
      component_id:         pc.component_id,
      component:            pc.component,
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

/**
 * Aggregate a job's windows into a single component summary.
 * Used for the job-level BOM summary and eventually purchase orders.
 */
export function calcJobSummary(windowsWithBOM) {
  const map = {}
  windowsWithBOM.forEach(win => {
    win.bom.forEach(line => {
      const id = line.component_id
      if (!map[id]) {
        map[id] = {
          component:  line.component,
          total_qty:  0,
          unit_cost:  line.unit_cost_snapshot,
        }
      }
      map[id].total_qty += line.qty
    })
  })
  return Object.values(map)
    .map(r => ({ ...r, total_cost: r.total_qty * r.unit_cost }))
    .sort((a, b) => a.component.name.localeCompare(b.component.name))
}

export const fmt     = n => Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtQty  = n => Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(3).replace(/\.?0+$/, '')

/**
 * Calculate total product cost at a specific width (for tracks — no drop needed).
 * Used to generate the pricing grid on the product page.
 */
export function calcCostAtWidth(productComponents, widthMm) {
  return productComponents.reduce((total, pc) => {
    const qty      = calcQty(pc, widthMm, 0)
    const base     = Number(pc.component?.unit_cost) || 0
    const discount = Number(pc.component?.discount) || 0
    const cost     = base * (1 - discount / 100)
    return total + qty * cost
  }, 0)
}

// Standard track widths for the pricing grid (mm)
export const GRID_WIDTHS = [900,1200,1500,1800,2100,2400,2700,3000,3300,3600,3900,4200,4500,4800,5100,5400,5700,6000]
