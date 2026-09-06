/**
 * Fabric Engine
 *
 * Pure functions — no React, no Supabase.
 *
 * A blind is cut from a roll with its WIDTH running across the roll and the
 * DROP pulled off it lengthwise. Needs roll width >= blind width.
 *
 * A blind can't be railroaded (turned 90° so the drop runs across the roll) —
 * the fabric has to wind onto the tube the same way it comes off the roll, so
 * which edge is the roll's own width isn't a free choice.
 *
 * What that does NOT mean is that a cut burns the whole width of the roll.
 * Nothing stops a second, third or fourth blind being cut ALONGSIDE the first
 * out of the width it didn't use — same orientation, same length pulled off.
 * So the roll is consumed in BANDS: one band is a single length pulled off the
 * roll, carrying as many blinds side by side as its width allows, and the band
 * is as long as the longest drop in it.
 *
 * A blind therefore consumes a STRIP of the roll:
 *
 *     occupied width  = cut width + width cut allowance
 *     length off roll = cut drop  (drop + allowance + wastage)
 *     share of roll   = occupied width / roll width
 *
 * The width cut allowance is what makes side-by-side cutting possible: the
 * blade needs somewhere to go and both edges need squaring. It's counted once
 * per piece — including the outermost one, since the roll edge gets trimmed
 * too — which is also exactly how `nestPieces` packs, so a job's costed
 * consumption and its cut chart can never disagree.
 *
 * Fabric is still quoted per LINEAR METRE off the roll, against a nominal roll
 * width set on the product. A blind is charged its share of the metres it
 * pulls off, not all of them.
 *
 * Roll width belongs to the physical roll, not the priced item: the same
 * fabric can arrive 2.1m wide one month and 3m wide the next. The nominal
 * width on the product is the one the category rate is quoted against.
 */

/** Roll width one piece takes up, blade margin included. */
export function occupiedWidthMm(cutWidthMm, widthAllowanceMm = 0) {
  return Math.max(0, (Number(cutWidthMm) || 0) + (Number(widthAllowanceMm) || 0))
}

/**
 * The fraction of the roll's width one piece occupies — the multiplier that
 * turns "metres pulled off the roll" into "metres this blind pays for".
 *
 * Clamped to 1: a piece wider than the roll can't be cut at all, and charging
 * it for more than a full width would quietly paper over that. The impossible
 * cut surfaces through `planFabricCut` / `nestPieces` instead, where it can be
 * shown rather than priced away.
 */
export function widthShare(cutWidthMm, rollWidthMm, widthAllowanceMm = 0) {
  const roll = Number(rollWidthMm) || 0
  if (roll <= 0) return 0
  return Math.min(1, occupiedWidthMm(cutWidthMm, widthAllowanceMm) / roll)
}

/* ==========================================================================
 * Nesting
 * ========================================================================== */

/**
 * Lay pieces out on a roll, returning the bands they cut into.
 *
 * First-fit decreasing height — the standard strip-packing heuristic, and the
 * same shape as `packCuts` in stockEngine, just in two dimensions: pieces go
 * in longest-first, each dropping into the first band with width still free,
 * and the band a piece opens sets that band's length. Because the pieces
 * arrive longest-first, nothing placed later can make a band longer than the
 * piece that opened it.
 *
 * @param pieces [{ label, cutWidthMm, cutDropMm }]
 * @returns [{ pieces: [{ ...piece, occupiedMm, lengthMm, offsetMm }],
 *             usedWidthMm, remainingWidthMm, lengthMm, oversized }]
 *          `offsetMm` is where the piece starts across the roll, so a chart
 *          can be drawn straight off this without re-deriving positions.
 */
export function nestPieces(pieces = [], rollWidthMm, widthAllowanceMm = 0) {
  const roll = Number(rollWidthMm) || 0
  const prepared = pieces
    .map(p => ({
      ...p,
      cutWidthMm: Number(p.cutWidthMm) || 0,
      occupiedMm: occupiedWidthMm(p.cutWidthMm, widthAllowanceMm),
      lengthMm:   Number(p.cutDropMm) || 0,
    }))
    .sort((a, b) => b.lengthMm - a.lengthMm || b.occupiedMm - a.occupiedMm)

  const bands = []
  const open = (piece, oversized) => bands.push({
    pieces:           [{ ...piece, offsetMm: 0 }],
    usedWidthMm:      piece.occupiedMm,
    remainingWidthMm: Math.max(0, roll - piece.occupiedMm),
    lengthMm:         piece.lengthMm,
    oversized,
  })

  for (const piece of prepared) {
    // Too wide for the roll at all — its own band, flagged, so it shows up on
    // the chart as the problem it is instead of silently vanishing.
    if (roll <= 0 || piece.occupiedMm > roll) { open(piece, true); continue }
    const band = bands.find(b => !b.oversized && b.remainingWidthMm >= piece.occupiedMm)
    if (!band) { open(piece, false); continue }
    band.pieces.push({ ...piece, offsetMm: band.usedWidthMm })
    band.usedWidthMm      += piece.occupiedMm
    band.remainingWidthMm -= piece.occupiedMm
  }
  return bands
}

/**
 * Nest a mixed pile of cuts, splitting it first by the roll it belongs on.
 *
 * One job's cuts in a single fabric and colour can still come off products
 * with different roll widths or different blade margins, and nesting those
 * together would draw a layout none of them was costed at. So they're split on
 * exactly those two figures, nested separately, and handed back as one flat
 * list of bands — each carrying the roll it assumes, so a caller never has to
 * remember which subgroup a band came from.
 */
export function nestGroups(cuts = []) {
  const groups = new Map()
  cuts.forEach(c => {
    const rollWidthMm      = Number(c.rollWidthMm) || 0
    const widthAllowanceMm = Number(c.widthAllowanceMm) || 0
    const key = `${rollWidthMm}__${widthAllowanceMm}`
    if (!groups.has(key)) groups.set(key, { rollWidthMm, widthAllowanceMm, cuts: [] })
    groups.get(key).cuts.push(c)
  })
  return [...groups.values()].flatMap(g =>
    nestPieces(g.cuts, g.rollWidthMm, g.widthAllowanceMm)
      .map(b => ({ ...b, rollWidthMm: g.rollWidthMm, widthAllowanceMm: g.widthAllowanceMm })))
}

/**
 * What a nesting actually costs the roll: metres pulled off, and how much of
 * that ended up in a blind. `wasteM2` is everything else — the strip beside
 * the last piece in each band, and the tail under every piece shorter than the
 * band that holds it.
 */
export function nestSummary(bands = [], rollWidthMm) {
  const roll = Number(rollWidthMm) || 0
  const totalLengthMm = bands.reduce((s, b) => s + b.lengthMm, 0)
  const usedM2 = bands.reduce((s, b) =>
    s + b.pieces.reduce((t, p) => t + (p.cutWidthMm / 1000) * (p.lengthMm / 1000), 0), 0)
  const rollM2 = (roll / 1000) * (totalLengthMm / 1000)
  return {
    bandCount:  bands.length,
    pieceCount: bands.reduce((s, b) => s + b.pieces.length, 0),
    totalLengthMm,
    usedM2,
    rollM2,
    wasteM2:  Math.max(0, rollM2 - usedM2),
    wastePct: rollM2 > 0 ? Math.max(0, (rollM2 - usedM2) / rollM2) * 100 : 0,
  }
}

/* ==========================================================================
 * Stock and ordering
 * ========================================================================== */

/**
 * The cut a roll of this width would produce. Null when the roll isn't wide
 * enough to take the piece at all.
 *
 * `shareOfRoll` is what the piece is charged for; `spareWidthMm` is what's
 * left across the roll for the next blind — the whole point of the model.
 */
export function cutFor(rollWidthMm, cutWidthMm, cutDropMm, widthAllowanceMm = 0) {
  const roll     = Number(rollWidthMm) || 0
  const occupied = occupiedWidthMm(cutWidthMm, widthAllowanceMm)
  const length   = Number(cutDropMm) || 0
  if (roll <= 0 || occupied > roll) return null
  return {
    rollWidthMm:  roll,
    occupiedMm:   occupied,
    consumeMm:    length,
    spareWidthMm: roll - occupied,
    shareOfRoll:  occupied / roll,
    // What this one piece actually takes out of the roll, once the width it
    // leaves behind is credited to whatever gets cut next to it.
    chargedMm:    length * (occupied / roll),
    areaM2:       (occupied / 1000) * (length / 1000),
  }
}

/**
 * Best roll width for a single piece.
 *
 * With the width offcut reusable, "narrowest roll that fits" is no longer
 * automatically least-waste — a wider roll simply leaves a wider strip for the
 * next blind, and that strip isn't waste any more. What still matters is not
 * opening a roll wider than needed when a narrower one would do, so the sort
 * is on the roll's own width.
 */
export function bestCut(rollWidths = [], cutWidthMm, cutDropMm, widthAllowanceMm = 0) {
  return rollWidths
    .map(rw => cutFor(rw, cutWidthMm, cutDropMm, widthAllowanceMm))
    .filter(Boolean)
    .sort((a, b) => a.rollWidthMm - b.rollWidthMm)[0] || null
}

/** Every workable roll width, for showing the alternatives behind an override. */
export function cutOptions(rollWidths = [], cutWidthMm, cutDropMm, widthAllowanceMm = 0) {
  const seen = new Set()
  return rollWidths
    .map(rw => cutFor(rw, cutWidthMm, cutDropMm, widthAllowanceMm))
    .filter(o => {
      if (!o || seen.has(o.rollWidthMm)) return false
      seen.add(o.rollWidthMm); return true
    })
    .sort((a, b) => a.rollWidthMm - b.rollWidthMm)
}

/** The roll widths a fabric can be ordered in. */
export const orderableWidths = (fabric) =>
  (Array.isArray(fabric?.roll_widths) ? fabric.roll_widths : [])
    .map(Number).filter(n => n > 0).sort((a, b) => a - b)

/**
 * Every physical piece of one fabric and colour held in stock — full rolls and
 * offcuts alike, since a fabric offcut is only a roll with both dimensions
 * already reduced. Widest and longest first, so the fullest roll reads first.
 */
export function fabricPieces(rollStock = [], componentId, colourSuffix = null) {
  const suffix = colourSuffix || null
  return rollStock
    .filter(s =>
      s.component_id === componentId &&
      s.status === 'available' &&
      (s.colour_variant?.suffix || null) === suffix)
    .sort((a, b) =>
      (Number(b.roll_width_mm) || 0) - (Number(a.roll_width_mm) || 0) ||
      (Number(b.length_mm) || 0) - (Number(a.length_mm) || 0))
}

/**
 * The stocked pieces that could supply a cut of this width and length.
 *
 * Best fit first, and "best" now means TIGHTEST: the narrowest piece still
 * wide enough, then the shortest still long enough. A blind that fits an
 * offcut should come off the offcut, leaving the full rolls whole — the
 * opposite of the old rule, which had nothing to protect because every cut
 * consumed the entire width regardless.
 */
export function piecesFitting(rollStock = [], componentId, colourSuffix, cutWidthMm, cutDropMm, widthAllowanceMm = 0) {
  const occupied = occupiedWidthMm(cutWidthMm, widthAllowanceMm)
  const length   = Number(cutDropMm) || 0
  return fabricPieces(rollStock, componentId, colourSuffix)
    .filter(s => (Number(s.roll_width_mm) || 0) >= occupied && (Number(s.length_mm) || 0) >= length)
    .sort((a, b) =>
      (Number(a.roll_width_mm) || 0) - (Number(b.roll_width_mm) || 0) ||
      (Number(a.length_mm) || 0) - (Number(b.length_mm) || 0))
}

/* ==========================================================================
 * Pricing categories
 * ========================================================================== */

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

/* ==========================================================================
 * Sourcing one cut
 * ========================================================================== */

/**
 * What this blind needs and where it comes from.
 *
 * Stock first: every piece held in that fabric and colour is a candidate,
 * judged on its own width and what's left on it — none can be turned sideways,
 * so a piece narrower than the cut is never an option however much length it
 * has spare. The tightest piece that still fits wins, which keeps full rolls
 * intact and works offcuts back out of stock.
 *
 * Nothing usable in stock means a PO, at the narrowest orderable width that
 * still takes the cut.
 *
 * Cost is the piece's SHARE of the linear metres it pulls off — the width
 * beside it is left for the next blind, not billed to this one.
 */
export function planFabricCut(fabric, cutWidthMm, cutDropMm, rollStock = [], colourSuffix = null, widthAllowanceMm = 0) {
  const rate     = Number(fabric?.unit_cost) || 0          // $/linear metre
  const discount = Number(fabric?.discount) || 0
  const priced   = (chargedMm) => (chargedMm / 1000) * rate * (1 - discount / 100)

  const best = piecesFitting(rollStock, fabric?.id, colourSuffix, cutWidthMm, cutDropMm, widthAllowanceMm)[0]
  if (best) {
    const cut = cutFor(best.roll_width_mm, cutWidthMm, cutDropMm, widthAllowanceMm)
    return {
      ok: true, needsPO: false,
      fabric,
      roll:             best,
      ...cut,
      remainingAfterMm: Number(best.length_mm) - cut.consumeMm,
      cost:             priced(cut.chargedMm),
    }
  }

  const toOrder = bestCut(orderableWidths(fabric), cutWidthMm, cutDropMm, widthAllowanceMm)
  if (!toOrder) {
    return {
      ok: false, reason: 'no_roll_wide_enough',
      requiredWidthMm:   occupiedWidthMm(cutWidthMm, widthAllowanceMm),
      widestOrderableMm: orderableWidths(fabric).slice(-1)[0] || 0,
    }
  }
  return {
    ok: true, needsPO: true,
    fabric,
    roll: null,
    ...toOrder,
    remainingAfterMm: null,
    cost: priced(toOrder.chargedMm),
  }
}
