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
 *   fixed_per_width  — manual qty per width bucket, from a named width
 *                      schedule (each schedule defines its own bands — not
 *                      tied to GRID_WIDTHS, which is just the default grid
 *                      offered when creating a new one). formula_buffer is
 *                      used as a multiplier on top of the looked-up qty
 *                      (default 1) — e.g. a centre-open track needs 2× the
 *                      per-leaf carrier count from the schedule.
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

    case 'fixed_per_width': {
      // formula_buffer doubles as a multiplier here (default 1) — e.g. 2 for
      // a centre-open track needing twice the per-leaf schedule figure.
      const multiplier = Number(productComponent.formula_buffer) || 1
      qty = qtyForWidth(productComponent.width_qty, widthMm) * multiplier
      break
    }

    default:
      qty = 0
  }

  return Math.max(0, Math.round(qty * 1000) / 1000)
}

/**
 * Look up the manual qty for a width from a { [bandUpperBoundMm]: qty } map.
 * Uses the first band the width fits into (<= that band's upper bound);
 * anything wider than the largest band falls back to the largest band's qty.
 *
 * The bands come from the map's own keys — NOT the fixed GRID_WIDTHS — so a
 * schedule can use any breakpoints (e.g. a supplier's own chart with ~120mm
 * steps), not just the coarse 300mm default grid.
 */
export function qtyForWidth(widthQty, widthMm) {
  if (!widthQty) return 0
  const bands = Object.keys(widthQty).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b)
  if (bands.length === 0) return 0
  const w = Number(widthMm) || 0
  for (const band of bands) {
    if (w <= band) return Number(widthQty[band]) || 0
  }
  return Number(widthQty[bands[bands.length - 1]]) || 0
}

/**
 * The "1×12" / "2×18" style label for a fixed_per_width line at a given
 * width — multiplier × the schedule's raw per-band figure — so whoever's
 * picking stock can read it straight off the same reference chart the
 * numbers came from. Returns null for any other cost type.
 */
export function fixedPerWidthLabel(pc, widthMm) {
  if (pc.cost_type !== 'fixed_per_width') return null
  const multiplier = Number(pc.formula_buffer) || 1
  const perBand     = qtyForWidth(pc.width_qty, widthMm)
  return `${multiplier}×${perBand}`
}

/* ==========================================================================
 * Recipe resolution
 *
 * A product's recipe now holds more lines than any one window uses. A line
 * with option_choice_id set is only supplied when that choice is answered;
 * a line with a dimension band only applies inside it; and lines sharing a
 * group_key are alternatives where exactly one survives.
 *
 * Resolution runs before any quantity is calculated, so everything
 * downstream — costing, stock deduction, POs, bar packing — sees the same
 * flat list of lines it always did.
 * ========================================================================== */

/**
 * The effective answer for every option, given what the window recorded.
 *
 * An option gated by depends_on_code is only *asked* while that option
 * equals depends_on_value. Otherwise its answer may still be decided for it
 * by forced_values — e.g. a centre-open track takes both return brackets
 * without anyone being asked, and a free-hanging one takes none.
 */
export function resolveAnswers(optionDefs = [], config = null) {
  const given = (config && config.options) || {}
  const out = {}
  optionDefs.forEach(o => { if (!o.depends_on_code) out[o.code] = given[o.code] })
  optionDefs.forEach(o => {
    if (!o.depends_on_code) return
    const dep = out[o.depends_on_code] !== undefined ? out[o.depends_on_code] : given[o.depends_on_code]
    out[o.code] = String(dep) === String(o.depends_on_value)
      ? given[o.code]                            // asked
      : (o.forced_values || {})[dep]             // decided, or genuinely absent
  })
  return out
}

/** Is this option actually put to the user, given the answers so far? */
export function isOptionVisible(option, answers) {
  if (!option.depends_on_code) return true
  return String(answers[option.depends_on_code]) === String(option.depends_on_value)
}

/**
 * Required options that are visible and still unanswered. A hidden option
 * carrying a forced value is never missing — that's the whole point of
 * forcing it. Returns option names, ready to show.
 */
export function missingAnswers(optionDefs = [], config = null) {
  const answers = resolveAnswers(optionDefs, config)
  return optionDefs
    .filter(o => o.required && isOptionVisible(o, answers) && !answers[o.code])
    .map(o => o.name)
}

const withinBand = (pc, widthMm, dropMm) =>
  (pc.active_min_width == null || widthMm >= Number(pc.active_min_width)) &&
  (pc.active_max_width == null || widthMm <= Number(pc.active_max_width)) &&
  (pc.active_min_drop  == null || dropMm  >= Number(pc.active_min_drop))  &&
  (pc.active_max_drop  == null || dropMm  <= Number(pc.active_max_drop))

const isBanded = pc =>
  pc.active_min_width != null || pc.active_max_width != null ||
  pc.active_min_drop  != null || pc.active_max_drop  != null ||
  hasDropLimit(pc)

const hasDropLimit = pc =>
  !!pc.drop_limit && Object.keys(pc.drop_limit).length > 0

/**
 * The drop at which a rule trips, for a given width.
 *
 * The map is { <width up to mm>: <drop threshold mm> }, read the same way as
 * a width schedule — the first band the width fits into. Anything wider than
 * the largest band uses that band's figure.
 *
 * Deliberately a table rather than a formula, because real thresholds don't
 * move in one direction: 2000 → 1800, 2100 → 1600, 2200 → 1800. No expression
 * of width and drop produces that, so nothing tries to.
 */
export function dropLimitAt(limitMap, widthMm) {
  return qtyForWidth(limitMap, widthMm) || null
}

/**
 * Is a drop-limited line in play at this size?
 *
 *   above        applies once the drop passes the threshold — the usual case,
 *                where a taller blind needs an extra part.
 *   at_or_below  applies while the drop is still under it, for the standard
 *                part that the add-on replaces.
 */
const withinDropLimit = (pc, widthMm, dropMm) => {
  if (!hasDropLimit(pc)) return true
  const threshold = dropLimitAt(pc.drop_limit, widthMm)
  if (threshold == null) return false
  return pc.drop_limit_mode === 'at_or_below'
    ? Number(dropMm) <= threshold
    : Number(dropMm) > threshold
}

/**
 * Collapse group_key alternatives down to one line each.
 * Precedence: an explicit window override, then a line supplied by an
 * answered option, then a line whose dimension band matched, then the plain
 * default. Ungrouped lines pass straight through.
 */
function applyGroups(lines, overrides = {}) {
  const grouped = {}, out = []
  lines.forEach(pc => {
    if (!pc.group_key) { out.push(pc); return }
    ;(grouped[pc.group_key] ||= []).push(pc)
  })
  Object.entries(grouped).forEach(([key, candidates]) => {
    const forcedId = overrides && overrides[key]
    const pick =
      (forcedId && candidates.find(c => c.id === forcedId)) ||
      candidates.find(c => c.option_choice_id) ||
      candidates.find(isBanded) ||
      candidates[0]
    if (pick) out.push(pick)
  })
  return out
}

/**
 * The lines that actually apply to one window.
 *
 * `optionDefs` are the option definitions for the product's type, each with
 * its `choices` array attached.
 */
export function resolveRecipe(productComponents = [], config = null, optionDefs = [], widthMm = 0, dropMm = 0) {
  const answers = resolveAnswers(optionDefs, config)
  const chosen = new Set()
  optionDefs.forEach(o => {
    const value = answers[o.code]
    if (value === undefined || value === null || value === '') return
    const choice = (o.choices || []).find(c => String(c.value) === String(value))
    if (choice) chosen.add(choice.id)
  })

  const applicable = productComponents.filter(pc =>
    (!pc.option_choice_id || chosen.has(pc.option_choice_id)) &&
    withinBand(pc, widthMm, dropMm) &&
    withinDropLimit(pc, widthMm, dropMm))

  return applyGroups(applicable, config && config.overrides)
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
}

/**
 * The answers a price grid should assume: each option's default, falling back
 * to its first real choice when it's required and no default is marked.
 * Returned alongside so the grid can say what it assumed.
 */
export function previewConfig(optionDefs = []) {
  const options = {}, assumed = []
  optionDefs.forEach(o => {
    const choices = (o.choices || []).filter(c => c.selectable !== false)
    const pick = choices.find(c => c.is_default) || (o.required ? choices[0] : null)
    if (pick) { options[o.code] = pick.value; assumed.push(`${o.name}: ${pick.label}`) }
  })
  return { config: { options }, assumed }
}

/**
 * Cost of one product at a given size, with the recipe resolved first.
 * Without resolution this would total every option's lines at once.
 */
export function calcCostAt(productComponents, widthMm, dropMm, optionDefs = [], config = null) {
  const lines = resolveRecipe(productComponents, config, optionDefs, widthMm, dropMm)
  return lines.reduce((total, pc) => {
    const qty      = calcQty(pc, widthMm, dropMm)
    const base     = Number(pc.component?.unit_cost) || 0
    const discount = Number(pc.component?.discount) || 0
    return total + qty * base * (1 - discount / 100)
  }, 0)
}

/**
 * Resolve then cost, in one call. Every BOM in the app goes through here so
 * a call site can't accidentally skip resolution and cost the whole recipe.
 */
export function buildWindowBOM(productComponents, win, optionDefs = [], priceMap = null, qtyMap = null) {
  const widthMm = Number(win.width_mm), dropMm = Number(win.drop_mm)
  const lines = resolveRecipe(productComponents, win.config, optionDefs, widthMm, dropMm)
  return calcWindowBOM(lines, widthMm, dropMm, priceMap, qtyMap)
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
    // "1×12" style reference label for fixed_per_width lines — always computed
    // live from the window's own width, so it stays readable even when the
    // total qty itself is frozen from a confirmed job's snapshot.
    const width_formula  = fixedPerWidthLabel(pc, widthMm)
    return {
      product_component_id: pc.id,
      component_id:         pc.component_id,
      component:            pc.component,
      colour_variant:       pc.colour_variant || null,
      display_pn,
      calculated_qty,
      width_formula,
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
          widthFormulas:  [], // "1×12" style labels, one per contributing window
        }
      }
      map[key].total_qty += line.qty
      // Track per-window cut lengths for bar components so bin packing can work correctly
      if (line.component?.order_type === 'bar' && line.qty > 0) {
        const unit  = line.component?.unit || 'each'
        const cutMm = unit === 'metres' ? Math.round(line.qty * 1000) : Math.round(line.qty)
        map[key].cuts.push(cutMm)
      }
      if (line.width_formula) map[key].widthFormulas.push(line.width_formula)
    })
  })
  return Object.values(map)
    .map(r => ({
      ...r,
      total_cost: r.total_qty * r.unit_cost,
      // De-duplicated for display — e.g. "1×32" when every window needs the
      // same pick, or "1×32, 1×34" when windows land in different bands.
      widthFormulaLabel: [...new Set(r.widthFormulas)].join(', '),
    }))
    .sort((a, b) => a.component.name.localeCompare(b.component.name))
}

export const fmt    = n => Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtQty = n => Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(3).replace(/\.?0+$/, '')

// Tracks price on width alone. Kept as a thin wrapper so the call sites read
// the way they always did, but it resolves now — before options existed a
// plain sum was correct, and afterwards it silently totalled every choice.
export function calcCostAtWidth(productComponents, widthMm, optionDefs = [], config = null) {
  return calcCostAt(productComponents, widthMm, 0, optionDefs, config)
}

export const GRID_WIDTHS = [900,1200,1500,1800,2100,2400,2700,3000,3300,3600,3900,4200,4500,4800,5100,5400,5700,6000]

// Blinds price on both axes, so their grid is square and stops at a drop
// nobody orders past.
export const GRID_BLIND_WIDTHS = [900,1200,1500,1800,2100,2400,2700,3000]
export const GRID_BLIND_DROPS  = [900,1200,1500,1800,2100,2400,2700,3000]

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
      const bands = Object.keys(pc.width_qty || {}).map(Number).filter(n => !isNaN(n) && Number(pc.width_qty[n]) > 0).sort((a, b) => a - b)
      const mult  = Number(pc.formula_buffer) || 1
      const prefix = mult !== 1 ? `×${mult} · ` : ''
      if (bands.length === 0) return `${prefix}qty per width — not set`
      const first = bands[0], last = bands[bands.length - 1]
      return `${prefix}${pc.width_qty[first]} up to ${first}mm … ${pc.width_qty[last]} up to ${last}mm`
    }
    default: return ''
  }
}
