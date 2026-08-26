/**
 * Fabric Engine
 *
 * Pure functions — no React, no Supabase.
 *
 * A blind is cut from a roll with its WIDTH running across the roll and the
 * DROP pulled off it lengthwise. Needs roll width >= blind width.
 *
 * Unlike curtain fabric, a blind can't be railroaded (turned 90° so the drop
 * runs across the roll instead) — the fabric has to wind onto the tube the
 * same way it comes off the roll, so which edge is the roll's own width isn't
 * a free choice. That means wastage can't be minimised by picking an
 * orientation; the only lever left is picking the narrowest roll on hand (or
 * orderable) that's still wide enough for the blind's width.
 *
 * Because of that, fabric is priced per LINEAR METRE pulled off the roll, not
 * per m². The roll's own width is a constant (only one width is stocked), and
 * a cut consumes that full width whatever the blind's width — so length is the
 * only thing that varies, and the width folds into the rate. Least-waste is
 * therefore just "narrowest roll that fits", answered by geometry with no
 * price data involved.
 *
 * Roll width belongs to the physical roll, not the priced item: the same
 * fabric can arrive 2.1m wide one month and 3m wide the next.
 */

/**
 * The cut this roll width would produce — the blind's width across the roll,
 * drop pulled off lengthwise. Null when the roll isn't wide enough.
 */
export function cutFor(rollWidthMm, widthMm, dropMm) {
  const roll = Number(rollWidthMm) || 0
  const w = Number(widthMm) || 0
  const d = Number(dropMm) || 0
  if (roll < w) return null
  return { rollWidthMm: roll, consumeMm: d, areaM2: (roll / 1000) * (d / 1000) }
}

/** Least area across a set of roll widths. Null when none is wide enough. */
export function bestCut(rollWidths = [], widthMm, dropMm) {
  const all = rollWidths.map(rw => cutFor(rw, widthMm, dropMm)).filter(Boolean)
  return all.sort((a, b) => a.areaM2 - b.areaM2 || a.rollWidthMm - b.rollWidthMm)[0] || null
}

/** Every workable roll width, for showing the alternatives behind an override. */
export function cutOptions(rollWidths = [], widthMm, dropMm) {
  const seen = new Set()
  return rollWidths
    .map(rw => cutFor(rw, widthMm, dropMm))
    .filter(o => {
      if (!o || seen.has(o.rollWidthMm)) return false
      seen.add(o.rollWidthMm); return true
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
 * judged on its own width and what's left on it — none of them can be turned
 * sideways to fit, so a roll narrower than the blind's width is never an
 * option, however much length it has spare. The least-area cut wins, and ties
 * break toward the shorter remnant so long rolls stay whole.
 *
 * Nothing usable in stock means a PO, and the width to order is the narrowest
 * one that's still wide enough.
 */
export function planFabricCut(fabric, widthMm, dropMm, rollStock = [], colourSuffix = null) {
  const suffix = colourSuffix || null
  const rate = Number(fabric?.unit_cost) || 0          // $/linear metre
  const discount = Number(fabric?.discount) || 0
  const priced = (consumeMm) => (consumeMm / 1000) * rate * (1 - discount / 100)

  const fromStock = rollStock
    .filter(s =>
      s.component_id === fabric?.id &&
      s.status === 'available' &&
      (s.colour_variant?.suffix || null) === suffix)
    .map(s => {
      const cut = cutFor(s.roll_width_mm, widthMm, dropMm)
      return cut && Number(s.length_mm) >= cut.consumeMm ? { ...cut, roll: s } : null
    })
    .filter(Boolean)
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
      consumeMm:    best.consumeMm,
      areaM2:       best.areaM2,
      remainingAfterMm: Number(best.roll.length_mm) - best.consumeMm,
      cost:         priced(best.consumeMm),
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
    consumeMm:   toOrder.consumeMm,
    areaM2:      toOrder.areaM2,
    remainingAfterMm: null,
    cost:        priced(toOrder.consumeMm),
  }
}
