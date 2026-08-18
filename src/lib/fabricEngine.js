/**
 * Fabric Engine
 *
 * Pure functions — no React, no Supabase.
 *
 * A blind is cut from a roll one of two ways:
 *
 *   normal      the blind's WIDTH runs across the roll, and you pull DROP
 *               metres off it. Needs roll width >= blind width.
 *
 *   railroaded  the blind is turned 90°, so the DROP runs across the roll and
 *               you pull WIDTH metres off it. Needs roll width >= blind drop.
 *               This is what lets a 2.1m roll make a 2.4m wide blind.
 *
 * Fabric is priced per m², one figure per fabric whatever the roll width. So
 * what a cut costs is roll width × length consumed × that rate — meaning
 * cheapest and least-waste are the same question, answered by geometry with
 * no price data involved. The roll that burns the fewest m² wins.
 *
 * Roll width belongs to the physical roll, not the priced item: the same
 * fabric can arrive 2.1m wide one month and 3m wide the next.
 */

export const ORIENTATIONS = { NORMAL: 'normal', RAILROADED: 'railroaded' }

export const orientationLabel = o =>
  o === ORIENTATIONS.RAILROADED ? 'railroaded' : 'normal'

/**
 * The ways a roll of this width could produce the blind, least consumed first.
 * Empty when the roll is too narrow both ways round.
 */
export function orientationsFor(rollWidthMm, widthMm, dropMm) {
  const roll = Number(rollWidthMm) || 0
  const w = Number(widthMm) || 0
  const d = Number(dropMm) || 0
  const out = []
  if (roll >= w) out.push({ orientation: ORIENTATIONS.NORMAL,     consumeMm: d })
  if (roll >= d) out.push({ orientation: ORIENTATIONS.RAILROADED, consumeMm: w })
  return out
    .map(o => ({ ...o, rollWidthMm: roll, areaM2: (roll / 1000) * (o.consumeMm / 1000) }))
    .sort((a, b) => a.areaM2 - b.areaM2)
}

/** Least area across a set of roll widths. Null when none is wide enough. */
export function bestCut(rollWidths = [], widthMm, dropMm) {
  const all = rollWidths.flatMap(rw => orientationsFor(rw, widthMm, dropMm))
  return all.sort((a, b) => a.areaM2 - b.areaM2 || a.rollWidthMm - b.rollWidthMm)[0] || null
}

/** Every workable roll width, for showing the alternatives behind an override. */
export function cutOptions(rollWidths = [], widthMm, dropMm) {
  const seen = new Set()
  return rollWidths
    .flatMap(rw => orientationsFor(rw, widthMm, dropMm))
    .filter(o => {
      const k = `${o.rollWidthMm}:${o.orientation}`
      if (seen.has(k)) return false
      seen.add(k); return true
    })
    .sort((a, b) => a.areaM2 - b.areaM2)
}

/** The roll widths a fabric can be ordered in. */
export const orderableWidths = (fabric) =>
  (Array.isArray(fabric?.roll_widths) ? fabric.roll_widths : [])
    .map(Number).filter(n => n > 0).sort((a, b) => a - b)

/**
 * Pricing categories (A-F), ascending by their price ceiling — used to find
 * the first tier a fabric's real cost fits under, the same way a width
 * schedule finds the first band a width fits into.
 */
export const sortedCategories = (categories = []) =>
  categories.slice().sort((a, b) => Number(a.max_price) - Number(b.max_price))

/**
 * Which pricing category a fabric's real unit cost falls into. Never stored
 * on the fabric — always derived live, so it can't go stale when an admin
 * moves a threshold. Anything pricier than every configured ceiling lands in
 * the top category, same fallback a width schedule uses past its last band.
 * Null only when no categories are configured yet.
 */
export function categoryForPrice(categories = [], price) {
  const sorted = sortedCategories(categories)
  if (sorted.length === 0) return null
  const p = Number(price) || 0
  return sorted.find(c => p <= Number(c.max_price)) || sorted[sorted.length - 1]
}

/** Fabrics currently classified into a pricing category, each with its colours. */
export function fabricsInCategory(components = [], categories = [], categoryCode) {
  return components
    .filter(c => c.order_type === 'fabric' && categoryForPrice(categories, c.unit_cost)?.code === categoryCode)
    .sort((a, b) => String(a.fabric_code || a.name).localeCompare(String(b.fabric_code || b.name)))
}

/**
 * What this blind needs and where it comes from.
 *
 * Stock first: every part-roll held in that fabric and colour is a candidate,
 * judged on its own width and what's left on it. The least-area cut wins, and
 * ties break toward the shorter remnant so long rolls stay whole.
 *
 * Nothing usable in stock means a PO, and the width to order is the one that
 * would waste least.
 */
export function planFabricCut(fabric, widthMm, dropMm, rollStock = [], colourSuffix = null) {
  const suffix = colourSuffix || null
  const rate = Number(fabric?.unit_cost) || 0          // $/m²
  const discount = Number(fabric?.discount) || 0
  const priced = (areaM2) => areaM2 * rate * (1 - discount / 100)

  const fromStock = rollStock
    .filter(s =>
      s.component_id === fabric?.id &&
      s.status === 'available' &&
      (s.colour_variant?.suffix || null) === suffix)
    .flatMap(s => orientationsFor(s.roll_width_mm, widthMm, dropMm)
      .filter(o => Number(s.length_mm) >= o.consumeMm)
      .map(o => ({ ...o, roll: s })))
    .sort((a, b) =>
      a.areaM2 - b.areaM2 ||                            // least fabric burned
      Number(a.roll.length_mm) - Number(b.roll.length_mm)) // then shortest remnant

  const best = fromStock[0]
  if (best) {
    return {
      ok: true, needsPO: false,
      fabric,
      roll:         best.roll,
      rollWidthMm:  best.rollWidthMm,
      orientation:  best.orientation,
      consumeMm:    best.consumeMm,
      areaM2:       best.areaM2,
      remainingAfterMm: Number(best.roll.length_mm) - best.consumeMm,
      cost:         priced(best.areaM2),
    }
  }

  const toOrder = bestCut(orderableWidths(fabric), widthMm, dropMm)
  if (!toOrder) {
    return {
      ok: false, reason: 'no_roll_wide_enough',
      widestOrderableMm: orderableWidths(fabric).slice(-1)[0] || 0,
    }
  }
  return {
    ok: true, needsPO: true,
    fabric,
    roll:        null,
    rollWidthMm: toOrder.rollWidthMm,
    orientation: toOrder.orientation,
    consumeMm:   toOrder.consumeMm,
    areaM2:      toOrder.areaM2,
    remainingAfterMm: null,
    cost:        priced(toOrder.areaM2),
  }
}
