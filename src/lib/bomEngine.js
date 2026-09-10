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
 *   fabric_strip     — linear metres off a roll, scaled by the share of the
 *                      roll's WIDTH the cut occupies. Only ever produced by
 *                      fabricLineFor (see the bottom of this file) — no
 *                      stored recipe line uses it.
 *
 *                      This is the IDEAL strip: one blind's own share of the
 *                      roll, with nothing nested beside it. It's what the
 *                      price grid wants, since a grid prices a size with no
 *                      job around it. A real job's BOM overwrites it — see
 *                      applyFabricNesting.
 */

import { widthShare, nestPieces, orderableWidths } from './fabricEngine'

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

    case 'fabric_strip': {
      // Length off the roll, exactly as drop_based reads it — a negative
      // deduction adds the drop allowance and wastage.
      const lengthMm = dropMm - deduction
      // ...then only the share of the roll's width this cut actually occupies.
      // The rest of the width isn't waste: it's where the next blind goes, or
      // an offcut back into stock.
      const cutWidth = widthMm - (Number(productComponent.fabric_width_deduction_mm) || 0)
      qty = (lengthMm / 1000) * widthShare(
        cutWidth,
        productComponent.fabric_roll_width_mm,
        productComponent.fabric_width_allowance_mm,
      )
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
 * The group a recipe line competes in, or null if it competes with nothing.
 *
 * The name lives on the COMPONENT — a tube is a tube whoever puts it in a
 * recipe — and the recipe line only says whether it competes. That split is
 * not tidiness: a shared kind must not be enough on its own, because Track
 * Return FF Wave L and R are the same kind and a "Both ends" track takes both.
 * Grouping them would drop one from the BOM. Only the recipe knows the
 * difference between alternatives and a matched pair, so only the recipe ticks
 * the box.
 *
 * An explicit group_key still wins, so anything named by hand keeps working.
 */
export function groupKeyOf(pc) {
  if (pc?.group_key) return pc.group_key
  if (pc?.group_by_kind && pc?.component?.kind) return pc.component.kind
  return null
}

/**
 * Collapse alternatives down to one line each.
 * Precedence: an explicit window override, then a line supplied by an
 * answered option, then a line whose dimension band matched, then the plain
 * default. Ungrouped lines pass straight through.
 */
function applyGroups(lines, overrides = {}) {
  const grouped = {}, out = []
  lines.forEach(pc => {
    const key = groupKeyOf(pc)
    if (!key) { out.push(pc); return }
    ;(grouped[key] ||= []).push(pc)
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

/* ==========================================================================
 * Blind fabric pricing
 *
 * A blind's recipe (product_components) only ever holds hardware — the
 * fabric it's cut from is chosen per window, not fixed on the product, so it
 * can't live there as an ordinary line. It's synthesised instead: a
 * width_drop_based line built on demand from whatever the window picked,
 * priced at its pricing category's flat rate rather than the fabric's own
 * unit_cost — see supabase_fabric_pricing.sql for why. Being an ordinary
 * line by the time it reaches calcWindowBOM, it freezes into a confirmed
 * job's price/qty snapshot the same way every other line does.
 * ========================================================================== */

/**
 * Resolve a blind window's chosen fabric into what the BOM needs: the real
 * component (for name/part no/colour/stock matching) plus the flat price its
 * category charges. Null whenever there's nothing to price yet — a track
 * window, no fabric picked, or a product with no category assigned.
 */
/**
 * The roll width the category rates were quoted against, used when a product
 * predates fabric_roll_width_mm. Matches the default the migration sets, so a
 * product nobody has opened since costs the same either way.
 */
export const DEFAULT_ROLL_WIDTH_MM = 3000

/**
 * The roll width to cut and nest against.
 *
 * The product carries a roll width because the price grid has to work before
 * any fabric is picked — it prices a size against a hypothetical roll. But
 * once a real fabric IS picked, the cut sheet and the order quantity are about
 * a physical roll on a physical shelf, and the fabric knows its own width.
 * So the fabric's own answer wins wherever it has one; the product's figure
 * stays the fallback, and remains what the grid quotes against.
 *
 * A fabric orderable in several widths nests into its widest: nesting packs a
 * whole group of cuts rather than one, and the widest roll is both what gets
 * ordered to fit them and the reference fabricStockValue already values
 * against.
 */
export function fabricRollWidthMm(component, product) {
  const own = orderableWidths(component)
  if (own.length > 0) return own[own.length - 1]
  return Number(product?.fabric_roll_width_mm) || DEFAULT_ROLL_WIDTH_MM
}

/**
 * The fabric side of a window's BOM, from a fabric already resolved.
 *
 * Shared by the saved window and the Customise preview so the two can't drift:
 * when this was written out longhand in both places, the preview quietly
 * dropped the cut allowance and the roll width and quoted a different cost
 * than the window it was about to save.
 */
export function buildFabricSelection(component, colourVariant, product, category) {
  if (!component || !category) return null
  return {
    component, colour_variant: colourVariant || null,
    categoryPrice: Number(category.max_price) || 0,
    dropAllowanceMm:    Number(product?.fabric_drop_allowance_mm) || 0,
    dropWastageMm:      Number(product?.fabric_drop_wastage_mm) || 0,
    widthDeductionMm:   Number(product?.fabric_width_deduction_mm) || 0,
    widthAllowanceMm:   Number(product?.fabric_width_cut_allowance_mm) || 0,
    rollWidthMm:        fabricRollWidthMm(component, product),
  }
}

export function fabricSelectionFor(win, product, components = [], categories = []) {
  if (product?.product_type !== 'blind') return null
  const picked = win?.config?.fabric
  if (!picked?.component_id) return null
  return buildFabricSelection(
    components.find(c => c.id === picked.component_id),
    picked.colour_variant,
    product,
    categories.find(c => c.code === product.fabric_category))
}

/**
 * The synthetic fabric line itself, or null when there's nothing to add.
 *
 * Costed as a STRIP of the roll: the linear metres the cut pulls off, times
 * the share of the roll's width it occupies.
 *
 * A blind still can't be railroaded (see fabricEngine) — the drop always runs
 * lengthwise. But the width beside a blind is not lost: the next blind is cut
 * alongside it out of the same length, and whatever survives the last one goes
 * back into stock as an offcut. Charging every blind for the full roll width,
 * as this line did before, billed each of four blinds nested across a 3m roll
 * for the whole 3m — four times over.
 *
 * Four per-product figures, all set next to the fabric category and all kept
 * apart rather than summed, so each can be reasoned about — and argued with —
 * on its own:
 *   dropAllowanceMm   fabric the finished blind needs beyond its drop — hem,
 *                     pattern repeat, wrap onto the tube.
 *   dropWastageMm     fabric lost making the cut at all — trim, squaring up,
 *                     the bit that never reaches the blind.
 *   widthDeductionMm  cut-width spec: the fabric is cut this much narrower
 *                     than the window. Now a cost driver as well as a factory
 *                     instruction, since width decides the share.
 *   widthAllowanceMm  the blade margin that makes side-by-side cutting
 *                     possible — one per piece, matching how fabricEngine
 *                     nests, so the cost and the cut chart agree exactly.
 *
 * `fabric_cut` rides along untouched: the finished cut dimensions, the roll
 * they're nested into, and the label to write on the piece. Costing ignores
 * it; the cut sheet's chart and the stock picker read it rather than
 * re-deriving deductions they'd have to keep in step by hand.
 */
export function fabricLineFor(fabricSelection, windowLabel = null) {
  if (!fabricSelection?.component) return null
  const {
    component, colour_variant, categoryPrice,
    dropAllowanceMm, dropWastageMm, widthDeductionMm, widthAllowanceMm, rollWidthMm,
  } = fabricSelection
  const addedMm = (Number(dropAllowanceMm) || 0) + (Number(dropWastageMm) || 0)
  return {
    id:                 'fabric-slot',
    component_id:       component.id,
    component:          { ...component, unit: 'metres', unit_cost: categoryPrice, discount: 0 },
    colour_variant:     colour_variant || null,
    cost_type:          'fabric_strip',
    formula_deduction:  -addedMm,
    formula_buffer:     0,
    sort_order:         -1,
    fabric_width_deduction_mm: Number(widthDeductionMm) || 0,
    fabric_width_allowance_mm: Number(widthAllowanceMm) || 0,
    fabric_roll_width_mm:      Number(rollWidthMm) || DEFAULT_ROLL_WIDTH_MM,
    fabric_drop_added_mm:      addedMm,
    window_label:              windowLabel,
  }
}

/**
 * The cut this fabric line describes, in finished millimetres — what the
 * cutting table measures, and what the nesting packs.
 */
export function fabricCutFor(pc, widthMm, dropMm) {
  if (pc?.cost_type !== 'fabric_strip') return null
  return {
    label:       pc.window_label || null,
    cutWidthMm:  Math.max(0, Math.round(Number(widthMm) - (Number(pc.fabric_width_deduction_mm) || 0))),
    cutDropMm:   Math.max(0, Math.round(Number(dropMm) + (Number(pc.fabric_drop_added_mm) || 0))),
    rollWidthMm: Number(pc.fabric_roll_width_mm) || DEFAULT_ROLL_WIDTH_MM,
    widthAllowanceMm: Number(pc.fabric_width_allowance_mm) || 0,
  }
}

/* ==========================================================================
 * Component substitution
 *
 * A recipe says which base rail a product is built from. A job doesn't always
 * agree: the shelf holds a different one, the customer asked for a heavier
 * profile, the specced part is on back-order. Rather than fork the product,
 * a job — or a single window inside it — can swap one component for another.
 *
 * A swap is stored as { [recipeComponentId]: { component_id, colour_variant } }
 * — keyed by the component the RECIPE asks for, never by what it was last
 * swapped to. So it survives re-resolution, can't chain into itself, and
 * reverting is just deleting the key.
 *
 * Job swaps apply to every window; a window's own swap of the same part wins.
 * The fabric line is deliberately out of scope — a blind's fabric is already
 * a per-window choice, made in Customise, and swapping it here would give the
 * same decision two homes.
 * ========================================================================== */

/**
 * The swaps in force for one window: the job's, with the window's own on top,
 * resolved against the component library into the rows the BOM will cost.
 * A swap pointing at a component that no longer exists is dropped.
 */
export function substitutionsFor(job, win, allComponents = []) {
  const merged = { ...(job?.substitutions || {}), ...(win?.substitutions || {}) }
  const out = {}
  Object.entries(merged).forEach(([fromId, sub]) => {
    if (!sub || !sub.component_id) return
    const component = allComponents.find(c => c.id === sub.component_id)
    if (!component) return
    out[fromId] = { component, colour_variant: sub.colour_variant || null }
  })
  return out
}

/**
 * Swap components into resolved recipe lines. A line keeps its formula, bands
 * and sort order — only the part it points at changes — and carries
 * `substituted_from` so every screen downstream can say what it replaced.
 *
 * A swap that keeps the recipe's own component and changes only its COLOUR is
 * a real swap and applies like any other — the same base rail profile in White
 * instead of Anodised is exactly what a job asks for, and it moves the part
 * number and the stock row the line draws from even though the component id
 * never budges. Only a swap that changes nothing at all is a no-op.
 */
export function applySubstitutions(lines, subMap = null) {
  if (!subMap || Object.keys(subMap).length === 0) return lines
  return lines.map(pc => {
    if (pc.cost_type === 'fabric_strip') return pc
    const sub = subMap[pc.component_id]
    if (!sub) return pc
    const sameComponent = sub.component.id === pc.component_id
    const sameColour    = (sub.colour_variant?.suffix || '') === (pc.colour_variant?.suffix || '')
    if (sameComponent && sameColour) return pc
    return {
      ...pc,
      substituted_from: {
        component_id:   pc.component_id,
        component:      pc.component,
        colour_variant: pc.colour_variant || null,
      },
      component_id:   sub.component.id,
      component:      sub.component,
      colour_variant: sub.colour_variant || null,
    }
  })
}

/**
 * Collapse a product's recipe into the entries a person reads it as.
 *
 * A recipe is stored one line per (part × the answer that supplies it), which
 * is the right shape to resolve against but the wrong shape to read: one
 * carrier answered three ways is three rows, and the two tubes that swap over
 * at 2200mm can sit a dozen rows apart with nothing saying they are the same
 * decision.
 *
 * Two things collapse, in this order:
 *
 *   an alternatives group   every line sharing a group_key, whatever parts
 *                           they name — this is the decision, and exactly one
 *                           of its lines survives resolution.
 *
 *   one part, many answers  otherwise, every line built from the same
 *                           component. Not a group in the engine's sense —
 *                           these lines don't compete, they are simply the
 *                           same part reached different ways — but it is one
 *                           thing to a reader, and reads as one row.
 *
 * Ordering is by where a group FIRST appears in the recipe, so collapsing
 * never shuffles a list someone has already learned the shape of.
 *
 * Pure and exported so the grouping can be checked without a browser.
 */
export function groupRecipeLines(productComponents = []) {
  const groups = new Map()

  productComponents.forEach(pc => {
    // Same resolver the engine collapses by, so the list can never show a
    // grouping the BOM does not actually apply.
    const groupName = groupKeyOf(pc)
    const key = groupName ? `g:${groupName}` : `c:${pc.component_id}`
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label:        groupName || pc.component?.name || '—',
        // A tagged group is a real choice the engine makes; a same-part group
        // is only a reading convenience. Worth telling apart on screen.
        isAlternatives: !!groupName,
        lines:        [],
      })
    }
    groups.get(key).lines.push(pc)
  })

  return [...groups.values()]
    .map(g => ({ ...g, sort_order: Math.min(...g.lines.map(l => Number(l.sort_order) || 0)) }))
    .sort((a, b) => a.sort_order - b.sort_order)
}

/* ==========================================================================
 * Job role slots — the parts a job is ASKED about
 *
 * Substitution above is a repair tool: you notice a line is wrong, find it on
 * the BOM, and pick a replacement out of every component of that kind. It
 * works, but only for someone who already knows to go looking.
 *
 * Some parts get changed often enough that waiting to notice is the wrong
 * shape. The base rail's colour follows the fabric, and only some suppliers
 * make some colours. The winder is whichever brand is actually on the shelf
 * this week. So a recipe line can be tagged with a `job_role` — the name the
 * question is asked under — and it becomes a question put to whoever enters
 * the job, alongside the fabric.
 *
 * What it OFFERS is not curated per line. The answers are every component
 * sharing the recipe part's kind, because that is what a kind already means:
 * a winder's alternatives are the other winders. Curating a list per recipe
 * line said the same thing again in a second place, and the two could drift —
 * add a winder to the library and it would be missing from every product until
 * someone remembered to tick it. Naming the kind once is the whole job.
 *
 * The ANSWER is not a new kind of record. It is written into the same
 * `substitutions` map a hand-made swap uses, keyed the same way, so the two
 * are one record and cannot drift apart. Everything downstream — costing,
 * stock, the price snapshot, the PO — needs no idea this exists.
 * ========================================================================== */

/**
 * The questions to put for one window, from its RESOLVED recipe lines.
 *
 * Resolved, not raw, so a base rail that only applies to a chain-drive blind
 * stops being asked about the moment the window answers spring-loaded — the
 * slots follow the same gating as the parts they choose.
 *
 * The recipe's own component is always the first choice and always available:
 * it is both the default and the way back. Alternatives that have since been
 * deleted from the library drop out silently rather than showing as blanks.
 */
export function jobRoleSlots(resolvedLines = [], subMap = null, allComponents = []) {
  const byId = new Map(allComponents.map(c => [c.id, c]))
  const seen = new Set()
  const slots = []

  resolvedLines.forEach(pc => {
    if (!pc.job_role || pc.cost_type === 'fabric_strip') return
    // Two resolved lines built from the same component share one answer —
    // substitutions are keyed by component id, so a second slot would be the
    // same question twice with one shared answer.
    if (seen.has(pc.component_id)) return
    seen.add(pc.component_id)

    const recipeComponent = pc.component || byId.get(pc.component_id) || null
    if (!recipeComponent) return

    // Every other part of the same kind. A recipe part with no kind offers
    // nothing but its own colours, which is honest — nothing in the library
    // claims to be the same sort of thing as it.
    const alternatives = recipeComponent.kind
      ? allComponents
          .filter(c => c.kind === recipeComponent.kind && c.id !== pc.component_id)
          .sort((a, b) => a.name.localeCompare(b.name))
      : []

    const sub    = subMap && subMap[pc.component_id]
    const chosen = sub
      ? { component: sub.component, colour_variant: sub.colour_variant || null }
      : { component: recipeComponent, colour_variant: pc.colour_variant || null }

    slots.push({
      // What an answer is filed under, and what deleting reverts.
      key:    pc.component_id,
      role:   pc.job_role,
      recipe: { component: recipeComponent, colour_variant: pc.colour_variant || null },
      // Recipe part first — it is the default, not just another option.
      choices: [recipeComponent, ...alternatives],
      chosen,
      changed: chosen.component.id !== recipeComponent.id
        || (chosen.colour_variant?.suffix || '') !== (pc.colour_variant?.suffix || ''),
    })
  })

  return slots
}

/**
 * The role slots as flat spec text — "Base rail: Slimline 25 · Black" — for
 * anything that prints rather than asks. Reads the BOM AFTER substitution, so
 * what it says is what the line was actually costed and stocked against.
 */
export function roleSpecs(bomLines = []) {
  const seen = new Set()
  return (bomLines || []).reduce((out, l) => {
    if (!l.job_role || seen.has(l.job_role + '|' + l.component_id)) return out
    seen.add(l.job_role + '|' + l.component_id)
    out.push({
      role:  l.job_role,
      value: `${l.component?.name || '—'}${l.colour_variant?.name ? ` · ${l.colour_variant.name}` : ''}`,
      changed: !!l.substituted_from,
    })
    return out
  }, [])
}

/**
 * Resolve then cost, in one call. Every BOM in the app goes through here so
 * a call site can't accidentally skip resolution and cost the whole recipe.
 */
export function buildWindowBOM(productComponents, win, optionDefs = [], priceMap = null, qtyMap = null, fabricSelection = null, subMap = null) {
  const widthMm = Number(win.width_mm), dropMm = Number(win.drop_mm)
  const resolved = resolveRecipe(productComponents, win.config, optionDefs, widthMm, dropMm)
  const lines = applySubstitutions(resolved, subMap)
  const fabricLine = fabricLineFor(fabricSelection, win.label || null)
  return calcWindowBOM(fabricLine ? [fabricLine, ...lines] : lines, widthMm, dropMm, priceMap, qtyMap)
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
    // Whether this quantity came from a confirmed job's snapshot. The fabric
    // nesting pass has to know: a frozen line is settled and must not be
    // re-quantified, however the roll would be laid out today.
    const qty_frozen     = frozenQty !== null
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
    // Null on every line but the synthesised fabric one.
    const fabric_cut     = fabricCutFor(pc, widthMm, dropMm)
    return {
      product_component_id: pc.id,
      component_id:         pc.component_id,
      component:            pc.component,
      colour_variant:       pc.colour_variant || null,
      // The recipe's own part, when this line has been swapped away from it.
      // Null on every unswapped line — see applySubstitutions.
      substituted_from:     pc.substituted_from || null,
      // The name this line is asked about under at job entry — "Base rail",
      // "Winder" — or null on a line nobody is asked about. Rides along so the
      // cut sheet can print the spec without re-reading the recipe.
      job_role:             pc.job_role || null,
      display_pn,
      calculated_qty,
      qty_frozen,
      width_formula,
      fabric_cut,
      override_qty:         null,
      unit_cost_snapshot:   unit_cost,
      base_cost,
      discount,
      get qty()       { return this.override_qty ?? this.calculated_qty },
      get line_cost() { return this.qty * this.unit_cost_snapshot },
    }
  })
}

/* ==========================================================================
 * Fabric nesting — from "what this blind is worth" to "what to order"
 *
 * Two different questions, deliberately answered differently:
 *
 *   THE PRICE GRID asks what one blind of a given size is worth, with no job
 *   around it. It can't know what it will be nested beside, so it assumes the
 *   ideal: the blind's own strip of the roll and nothing more. That's what
 *   calcQty's fabric_strip case computes, and it stays exactly that.
 *
 *   THE BOM AND JOB COSTING ask what has to come off the roll to build THIS
 *   job. That is the nesting, and it is always more than the sum of the ideal
 *   strips — the strip beside the last blind in a band, and the run under
 *   every blind shorter than the band holding it, are pulled off the roll
 *   whether or not they end up in a blind.
 *
 * The BOM has to answer the second question, or the quantity ordered is short
 * every time and the offcut that lands on the shelf was never paid for. So the
 * fabric lines are re-quantified here, after the per-window BOMs are built,
 * against the job's actual layout.
 * ========================================================================== */

/**
 * Re-quantify every fabric line in a job against the roll layout it will
 * actually be cut from.
 *
 * A band's full length is shared out across the blinds in it, in proportion to
 * the width each occupies. So the totals add up to the metres genuinely pulled
 * off the roll — the same figure the cut sheet's chart draws, because both go
 * through the same `nestPieces` — while each window still carries a share that
 * reflects how much of the band it took. A blind alone in a band bears that
 * band's whole length, which is the honest signal: an odd size that shares
 * with nothing is expensive, and it should look expensive.
 *
 * Lines frozen by a confirmed job's snapshot are left alone.
 *
 * Idempotent: it reads each line's `fabric_cut` (the cut dimensions, which
 * never change) rather than its current quantity, so running it twice gives
 * the same answer as running it once.
 */
export function applyFabricNesting(windowsWithBOM = []) {
  const pieces = []
  windowsWithBOM.forEach(win => {
    (win.bom || []).forEach(line => {
      if (!line.fabric_cut || line.qty_frozen) return
      pieces.push({
        winId:       win.id,
        groupKey:    `${line.component_id}__${line.colour_variant?.suffix || ''}__${line.fabric_cut.rollWidthMm}__${line.fabric_cut.widthAllowanceMm}`,
        ...line.fabric_cut,
      })
    })
  })
  if (pieces.length === 0) return windowsWithBOM

  // Only blinds on the same fabric, colour, roll width and cut allowance can
  // share a length of roll — the same grouping the cut sheet uses.
  const groups = new Map()
  pieces.forEach(p => {
    if (!groups.has(p.groupKey)) groups.set(p.groupKey, [])
    groups.get(p.groupKey).push(p)
  })

  const metresByWindow = {}
  groups.forEach(list => {
    nestPieces(list, list[0].rollWidthMm, list[0].widthAllowanceMm).forEach(band => {
      // Guard the degenerate band (a cut wider than the roll) so an
      // unbuildable size still costs something rather than dividing by zero.
      const across = band.usedWidthMm || 1
      band.pieces.forEach(p => {
        metresByWindow[p.winId] =
          (metresByWindow[p.winId] || 0) + (band.lengthMm / 1000) * (p.occupiedMm / across)
      })
    })
  })

  return windowsWithBOM.map(win => {
    const metres = metresByWindow[win.id]
    if (metres === undefined) return win
    return {
      ...win,
      bom: (win.bom || []).map(line =>
        line.fabric_cut && !line.qty_frozen
          // Deliberately unrounded. Each window carries its exact share of its
          // band, so the shares add back up to the metres actually pulled off
          // the roll — which is the whole point of this pass, and something
          // rounding each window first quietly broke (1mm per fabric, every
          // job). Display rounds on its own; see fmtQty.
          ? reQuantify(line, metres)
          : line),
    }
  })
}

/**
 * A copy of a BOM line at a new calculated quantity.
 *
 * Spreading a line would flatten its `qty` and `line_cost` getters into stale
 * values, so the property descriptors are carried across instead and only
 * `calculated_qty` is replaced — leaving an override the picker typed, and
 * everything derived from it, working exactly as before.
 */
function reQuantify(line, calculated_qty) {
  return Object.defineProperties({}, {
    ...Object.getOwnPropertyDescriptors(line),
    calculated_qty: { value: calculated_qty, enumerable: true, writable: true, configurable: true },
  })
}

export function calcJobSummary(windowsWithBOM) {
  // Group by component_id + colour_variant so different colours are separate lines
  const map = {}
  windowsWithBOM.forEach((win, idx) => {
    const windowLabel = win.label || `Window ${idx + 1}`
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
          cuts:           [], // { mm, label } per cut, for bar components — label is the window it came from
          fabricCuts:     [], // { cutWidthMm, cutDropMm, label, ... } per cut, for fabric — feeds the nesting
          widthFormulas:  [], // "1×12" style labels, one per contributing window
          substituted_from: null, // the recipe part this row replaced, if any
          // Windows whose lines are NOT a swap. Non-empty on a row that some
          // windows reach by substitution and others by their own recipe —
          // which is exactly when a job-wide revert would be a lie.
          nativeWindows:  [],
        }
      }
      map[key].total_qty += line.qty
      if (line.substituted_from) map[key].substituted_from ||= line.substituted_from
      else if (!line.fabric_cut) map[key].nativeWindows.push(windowLabel)
      // Track per-window cut lengths for bar components so bin packing can work correctly
      if (line.component?.order_type === 'bar' && line.qty > 0) {
        const unit  = line.component?.unit || 'each'
        const cutMm = unit === 'metres' ? Math.round(line.qty * 1000) : Math.round(line.qty)
        map[key].cuts.push({ mm: cutMm, label: windowLabel })
      }
      // Fabric is nested two-dimensionally rather than packed end to end, so
      // it carries both cut dimensions rather than a single length.
      if (line.fabric_cut) {
        map[key].fabricCuts.push({ ...line.fabric_cut, label: line.fabric_cut.label || windowLabel })
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
    case 'fabric_strip': {
      const wd    = Number(pc.fabric_width_deduction_mm) || 0
      const wa    = Number(pc.fabric_width_allowance_mm) || 0
      const roll  = Number(pc.fabric_roll_width_mm) || DEFAULT_ROLL_WIDTH_MM
      const added = Number(pc.fabric_drop_added_mm) || 0
      const w     = `W${wd ? ` − ${wd}` : ''}${wa ? ` + ${wa}` : ''}`
      return `(D${added ? ` + ${added}` : ''})mm × (${w}) / ${roll.toLocaleString()}mm roll`
    }
    default: return ''
  }
}
