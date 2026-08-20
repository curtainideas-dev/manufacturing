/**
 * Pricing combinations for a product's price-download export.
 *
 * Enumerates every valid answer-combination for a product's options — the
 * same visibility/forced-value rules resolveRecipe uses via resolveAnswers —
 * prices each one across the width (and drop, for blinds) grid, then groups
 * combinations that land on the exact same price grid. Plenty of options
 * never touch price (a spec-only colour choice, a qty option — those have no
 * `choices` to gate a recipe line on), so without grouping the export would
 * carry a duplicate tab per option that happens not to matter.
 */

import {
  isOptionVisible, calcCostAtWidth, calcCostAt, resolveRecipe, calcQty, fixedPerWidthLabel,
  GRID_WIDTHS, GRID_BLIND_WIDTHS, GRID_BLIND_DROPS,
} from './bomEngine'

// Safety cap so a product with several optional multi-choice options can't
// lock up the browser enumerating a combinatorial explosion.
const MAX_COMBOS = 500

/** Options ordered so every option comes after whatever it depends on. */
function topoOrder(optionDefs) {
  const resolved = [], resolvedCodes = new Set()
  let remaining = [...optionDefs]
  let guard = 0
  while (remaining.length && guard++ < optionDefs.length + 5) {
    const ready = remaining.filter(o => !o.depends_on_code || resolvedCodes.has(o.depends_on_code))
    if (ready.length === 0) { resolved.push(...remaining); break } // dependency cycle — bail out flat
    ready.forEach(o => resolvedCodes.add(o.code))
    resolved.push(...ready)
    remaining = remaining.filter(o => !ready.includes(o))
  }
  return resolved
}

/**
 * Every valid { [optionCode]: value } combination for a set of option defs.
 * A dependent option only branches over its own choices while its parent's
 * chosen value matches depends_on_value; otherwise it's forced to a single
 * decided value (or left absent), exactly like resolveAnswers. An optional
 * option also branches over "left unanswered", since a real window can skip
 * it.
 */
export function enumerateOptionCombos(optionDefs = []) {
  const ordered = topoOrder(optionDefs)
  let combos = [{}]
  let truncated = false

  for (const o of ordered) {
    const choices = (o.choices || []).filter(c => c.selectable !== false)
    const next = []
    for (const answers of combos) {
      if (isOptionVisible(o, answers)) {
        if (choices.length === 0) { next.push(answers); continue }
        choices.forEach(c => next.push({ ...answers, [o.code]: c.value }))
        if (!o.required) next.push(answers)
      } else {
        const parentVal = answers[o.depends_on_code]
        const forced = (o.forced_values || {})[parentVal]
        next.push(forced !== undefined ? { ...answers, [o.code]: forced } : answers)
      }
    }
    combos = next
    if (combos.length > MAX_COMBOS) { combos = combos.slice(0, MAX_COMBOS); truncated = true }
  }

  return { combos, truncated }
}

/** "Option: Answer" strings for a combo, in option order — for tab labels. */
export function describeCombo(optionDefs, answers) {
  return optionDefs
    .filter(o => answers[o.code] !== undefined && answers[o.code] !== null && answers[o.code] !== '')
    .map(o => {
      const choice = (o.choices || []).find(c => String(c.value) === String(answers[o.code]))
      return `${o.name}: ${choice?.label ?? answers[o.code]}`
    })
}

const round2 = n => Math.round((Number(n) || 0) * 100) / 100

function trackGrid(productComponents, optionDefs, answers) {
  return GRID_WIDTHS.map(w => round2(calcCostAtWidth(productComponents, w, optionDefs, { options: answers })))
}

function blindGrid(pricedComponents, optionDefs, answers) {
  return GRID_BLIND_DROPS.flatMap(d =>
    GRID_BLIND_WIDTHS.map(w => round2(calcCostAt(pricedComponents, w, d, optionDefs, { options: answers }))))
}

/**
 * Bracket-count and carrier-chart breakdown rows for a track combo, one row
 * per component, values aligned to GRID_WIDTHS. "Bracket" is a component
 * named as one AND costed with the per_interval spacing formula ("2 base +
 * 1 per 500mm width") — the name alone isn't enough, since e.g. a "Return
 * Bracket Screw" is a fixed-qty fastener, not a spacing-based bracket
 * count. "Carrier chart" is the fixed_per_width mechanism itself — the
 * named width→qty schedule that already produces the "N×M" reference label
 * (fixedPerWidthLabel) manufacturing reads off a supplier's chart.
 */
function trackDetailRows(productComponents, optionDefs, answers) {
  const perWidth = GRID_WIDTHS.map(w => resolveRecipe(productComponents, { options: answers }, optionDefs, w, 0))
  const bracketNames = new Set(), carrierNames = new Set()
  perWidth.forEach(lines => lines.forEach(l => {
    if (l.cost_type === 'per_interval' && /bracket/i.test(l.component?.name || '')) bracketNames.add(l.component.name)
    if (l.cost_type === 'fixed_per_width') carrierNames.add(l.component.name)
  }))

  const bracketRows = [...bracketNames].map(name => ({
    name,
    values: perWidth.map((lines, i) => {
      const line = lines.find(l => l.component?.name === name)
      return line ? calcQty(line, GRID_WIDTHS[i], 0) : ''
    }),
  }))
  const carrierRows = [...carrierNames].map(name => ({
    name,
    values: perWidth.map((lines, i) => {
      const line = lines.find(l => l.component?.name === name)
      return line ? (fixedPerWidthLabel(line, GRID_WIDTHS[i]) || '') : ''
    }),
  }))
  return { bracketRows, carrierRows }
}

/**
 * Every valid option combination for a product, priced and grouped by
 * identical resulting price grid. `isBlind` picks the width×drop grid over
 * the width-only one; `pricedComponents` should already include the
 * synthetic category-fabric line for blinds (see ProductDetail). Track
 * groups also carry bracket/carrier breakdown rows, computed from the
 * group's representative (first) combo.
 */
export function computePricingGroups({ productComponents, optionDefs, isBlind, pricedComponents }) {
  const { combos, truncated } = enumerateOptionCombos(optionDefs)
  const groups = []
  const byKey = new Map()

  combos.forEach(answers => {
    const grid = isBlind
      ? blindGrid(pricedComponents, optionDefs, answers)
      : trackGrid(productComponents, optionDefs, answers)
    const key = grid.join(',')
    let group = byKey.get(key)
    if (!group) {
      group = { grid, combos: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.combos.push({ answers, description: describeCombo(optionDefs, answers) })
  })

  if (!isBlind) {
    groups.forEach(group => {
      Object.assign(group, trackDetailRows(productComponents, optionDefs, group.combos[0].answers))
    })
  }

  return { groups, truncated }
}
