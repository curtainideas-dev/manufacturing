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
 * A cut that has been through `planJobFabric` already knows its roll, its band
 * and where it sits across it — that plan is what the BOM was quantified on
 * and what the cut sheet draws, so it is read back rather than nested again.
 * Anything without a placement falls back to the old rule: split on roll width
 * and blade margin, nest each pile on its own.
 *
 * Either way the result is one flat list of bands, each carrying the roll it
 * assumes, so a caller never has to remember which subgroup a band came from.
 */
export function nestGroups(cuts = []) {
  if (cuts.length > 0 && cuts.every(c => c.placement)) {
    return placedRolls(cuts).flatMap(r => r.bands)
  }
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
 * What a fabric costs
 *
 * The supplier's list prices a fabric per SQUARE METRE, one figure whatever
 * width the roll is: Vibe is $7.03/m² at 2.0, 2.5 and 3.0m alike. The per
 * metre price is only that figure times the width, so it is different for
 * every width and there is nothing to maintain per width.
 *
 * A fabric row stores one of two things, told apart by its unit:
 *
 *   'm²'      unit_cost IS the rate.
 *   'metres'  unit_cost is per linear metre of the WIDEST roll the fabric can
 *             be ordered in — the convention fabricStockValue already values
 *             stock against — so the rate is that figure over the width.
 * ========================================================================== */

/** The width a per-metre fabric price is quoted against. */
export function fabricReferenceWidthMm(fabric, fallbackWidthMm = 3000) {
  const own = orderableWidths(fabric)
  return own.length > 0 ? own[own.length - 1] : (Number(fallbackWidthMm) || 3000)
}

/** List price per square metre, before discount. */
export function fabricSqmRate(fabric, fallbackWidthMm = 3000) {
  const cost = Number(fabric?.unit_cost) || 0
  if (fabric?.unit === 'm²') return cost
  const ref = fabricReferenceWidthMm(fabric, fallbackWidthMm)
  return ref > 0 ? cost / (ref / 1000) : 0
}

/** List price per linear metre off a roll of this width, before discount. */
export function fabricMetreRate(fabric, rollWidthMm, fallbackWidthMm = 3000) {
  return fabricSqmRate(fabric, fallbackWidthMm) * ((Number(rollWidthMm) || 0) / 1000)
}

/* ==========================================================================
 * Planning a job's fabric
 *
 * One fabric in one colour is planned as a whole, in two steps:
 *
 *   1. STOCK. Every roll and offcut on the shelf is tried, tightest first, and
 *      takes whatever cuts fit on it — across its width and within the length
 *      it has left. Skipped entirely when the job says to order the lot.
 *
 *   2. ORDER. Whatever is left is laid out on each width the fabric can be
 *      ordered in, and the width that needs the fewest square metres wins.
 *      ONE width, always: a second roll is a second cut charge, which costs
 *      more than the fabric a split would save. Fabric is priced per m², so
 *      fewest square metres is also cheapest — there is no trade to weigh.
 *
 * The chosen width can be overridden per job; the alternatives ride along in
 * the result so a screen can show what each would have taken.
 * ========================================================================== */

/**
 * Nest cuts onto one piece of stock, which has an end.
 *
 * The same first-fit-decreasing pass as `nestPieces`, with the one thing a
 * roll on the shelf has that a roll on order does not: a length. A cut that
 * would open a band past the end of the piece is left for something else.
 */
export function nestOnPiece(cuts = [], pieceWidthMm, pieceLengthMm, widthAllowanceMm = 0) {
  const roll   = Number(pieceWidthMm) || 0
  const length = Number(pieceLengthMm) || 0
  const prepared = cuts
    .map(p => ({
      ...p,
      cutWidthMm: Number(p.cutWidthMm) || 0,
      occupiedMm: occupiedWidthMm(p.cutWidthMm, widthAllowanceMm),
      lengthMm:   Number(p.cutDropMm) || 0,
    }))
    .sort((a, b) => b.lengthMm - a.lengthMm || b.occupiedMm - a.occupiedMm)

  const bands = [], left = []
  let usedLength = 0
  for (const piece of prepared) {
    if (roll <= 0 || piece.occupiedMm > roll || piece.lengthMm <= 0) { left.push(piece); continue }
    const band = bands.find(b => b.remainingWidthMm >= piece.occupiedMm)
    if (band) {
      band.pieces.push({ ...piece, offsetMm: band.usedWidthMm })
      band.usedWidthMm      += piece.occupiedMm
      band.remainingWidthMm -= piece.occupiedMm
      continue
    }
    if (usedLength + piece.lengthMm > length) { left.push(piece); continue }
    bands.push({
      pieces:           [{ ...piece, offsetMm: 0 }],
      usedWidthMm:      piece.occupiedMm,
      remainingWidthMm: roll - piece.occupiedMm,
      lengthMm:         piece.lengthMm,
      oversized:        false,
    })
    usedLength += piece.lengthMm
  }
  return { bands, left, usedLengthMm: usedLength }
}

/**
 * What each orderable width would take to cut these pieces.
 *
 * `fits` is false when a piece is wider than the roll — that width is still
 * listed, so the screen can say why it was passed over, but never chosen while
 * another width takes everything.
 */
export function orderOptions(cuts = [], widths = [], widthAllowanceMm = 0) {
  return [...new Set(widths.map(Number).filter(w => w > 0))]
    .sort((a, b) => a - b)
    .map(rollWidthMm => {
      const bands   = nestPieces(cuts, rollWidthMm, widthAllowanceMm)
      const summary = nestSummary(bands, rollWidthMm)
      return {
        rollWidthMm, bands,
        fits:     bands.every(b => !b.oversized),
        lengthMm: summary.totalLengthMm,
        rollM2:   summary.rollM2,
        wasteM2:  summary.wasteM2,
        wastePct: summary.wastePct,
      }
    })
}

/** Fewest square metres among the widths that take every piece; narrower on a tie. */
export function bestOrderOption(options = []) {
  const fitting = options.filter(o => o.fits)
  if (fitting.length === 0) return options[options.length - 1] || null   // nothing fits: the widest, flagged
  return fitting.slice().sort((a, b) =>
    Math.abs(a.rollM2 - b.rollM2) > 1e-9 ? a.rollM2 - b.rollM2 : a.rollWidthMm - b.rollWidthMm)[0]
}

/**
 * Plan one fabric and colour.
 *
 * @param cuts          [{ id, label, cutWidthMm, cutDropMm }]
 * @param orderWidths   widths the fabric can be bought in
 * @param stockPieces   available stock_bars rows for this fabric and colour
 * @param useStock      false orders everything and leaves the shelf alone
 * @param overrideWidthMm  a width picked by hand, or null for least waste
 * @returns { rolls, options, autoWidthMm, chosenWidthMm, overridden }
 *          `rolls` is every roll the job cuts from — stock pieces first, then
 *          the one on order — each { key, source, rollWidthMm, stockPiece, bands }.
 */
export function planFabricGroup({
  cuts = [], orderWidths = [], widthAllowanceMm = 0,
  stockPieces = [], useStock = true, overrideWidthMm = null,
}) {
  let remaining = cuts.slice()
  const rolls = []

  if (useStock) {
    // Tightest first, so an offcut is used up before a full roll is opened.
    const shelf = stockPieces.slice().sort((a, b) =>
      (Number(a.roll_width_mm) || 0) - (Number(b.roll_width_mm) || 0) ||
      (Number(a.length_mm) || 0) - (Number(b.length_mm) || 0))
    for (const piece of shelf) {
      if (remaining.length === 0) break
      const { bands, left } = nestOnPiece(remaining, piece.roll_width_mm, piece.length_mm, widthAllowanceMm)
      if (bands.length === 0) continue
      rolls.push({
        key: `stock:${piece.id}`, source: 'stock',
        rollWidthMm: Number(piece.roll_width_mm) || 0,
        stockPiece: piece, bands,
      })
      // `left` is prepared copies; carry on with the originals.
      const leftIds = new Set(left.map(p => p.id))
      remaining = remaining.filter(p => leftIds.has(p.id))
    }
  }

  const options = remaining.length > 0 ? orderOptions(remaining, orderWidths, widthAllowanceMm) : []
  const auto    = bestOrderOption(options)
  const forced  = overrideWidthMm != null
    ? options.find(o => o.rollWidthMm === Number(overrideWidthMm)) || null
    : null
  const chosen  = forced || auto

  if (chosen) {
    rolls.push({
      key: `order:${chosen.rollWidthMm}`, source: 'order',
      rollWidthMm: chosen.rollWidthMm, stockPiece: null, bands: chosen.bands,
    })
  }

  return {
    rolls,
    // The layouts themselves stay out: only the chosen one is ever drawn.
    options: options.map(o => ({
      rollWidthMm: o.rollWidthMm, fits: o.fits, lengthMm: o.lengthMm,
      rollM2: o.rollM2, wasteM2: o.wasteM2, wastePct: o.wastePct, bandCount: o.bands.length,
    })),
    autoWidthMm:   auto?.rollWidthMm ?? null,
    chosenWidthMm: chosen?.rollWidthMm ?? null,
    overridden:    !!forced && forced.rollWidthMm !== auto?.rollWidthMm,
  }
}

/** The key a job's fabric choices are saved under — one fabric in one colour. */
export const fabricPlanKey = (componentId, colourSuffix) => `${componentId}__${colourSuffix || ''}`

/**
 * Plan every fabric cut in a job.
 *
 * @param cuts       [{ id, componentId, colourSuffix, cutWidthMm, cutDropMm,
 *                      widthAllowanceMm, orderWidthsMm, label }]
 * @param rollStock  every stock_bars row
 * @param fabricPlan the job's saved choices: { [fabricPlanKey]: { source, width } }
 *                   `source: 'order'` orders the lot; anything else uses stock
 *                   first. `width` forces the ordered roll's width.
 * @returns { [cut.id]: placement } — the roll, band and position of every cut.
 *
 * Two products can put the same fabric on a job with different blade margins.
 * Those can't share a band, so they are planned as separate piles — but they
 * do share the shelf, so what the first pile takes off a piece of stock is
 * gone by the time the second one looks.
 */
export function planJobFabric(cuts = [], rollStock = [], fabricPlan = null) {
  const piles = new Map()
  cuts.forEach(c => {
    const widths = (c.orderWidthsMm || []).map(Number).filter(w => w > 0)
    const key = [c.componentId, c.colourSuffix || '', Number(c.widthAllowanceMm) || 0, widths.join('/')].join('__')
    if (!piles.has(key)) piles.set(key, { key, widths, cuts: [] })
    piles.get(key).cuts.push(c)
  })

  const lengthLeft = new Map()   // stock piece id -> mm not yet taken by an earlier pile
  const placements = {}

  piles.forEach(pile => {
    const first   = pile.cuts[0]
    const planKey = fabricPlanKey(first.componentId, first.colourSuffix)
    const choice  = fabricPlan?.[planKey] || {}
    const shelf   = fabricPieces(rollStock, first.componentId, first.colourSuffix || null)
      .map(p => ({ ...p, length_mm: lengthLeft.has(p.id) ? lengthLeft.get(p.id) : Number(p.length_mm) || 0 }))
      .filter(p => p.length_mm > 0)

    const plan = planFabricGroup({
      cuts: pile.cuts, orderWidths: pile.widths,
      widthAllowanceMm: Number(first.widthAllowanceMm) || 0,
      stockPieces: shelf,
      useStock: choice.source !== 'order',
      overrideWidthMm: choice.width ?? null,
    })

    plan.rolls.forEach(roll => {
      if (roll.stockPiece) {
        const taken = roll.bands.reduce((s, b) => s + b.lengthMm, 0)
        lengthLeft.set(roll.stockPiece.id, roll.stockPiece.length_mm - taken)
      }
      roll.bands.forEach((band, bandIdx) => band.pieces.forEach(p => {
        placements[p.id] = {
          planKey,
          rollKey:     `${pile.key}__${roll.key}`,
          source:      roll.source,
          rollWidthMm: roll.rollWidthMm,
          stockPiece:  roll.stockPiece
            ? { id: roll.stockPiece.id, label: roll.stockPiece.label || null,
                roll_width_mm: roll.rollWidthMm, length_mm: roll.stockPiece.length_mm }
            : null,
          bandIdx,
          offsetMm:      p.offsetMm,
          occupiedMm:    p.occupiedMm,
          bandLengthMm:  band.lengthMm,
          bandUsedMm:    band.usedWidthMm,
          oversized:     !!band.oversized,
          options:       plan.options,
          autoWidthMm:   plan.autoWidthMm,
          chosenWidthMm: plan.chosenWidthMm,
          overridden:    plan.overridden,
        }
      }))
    })
  })
  return placements
}

/**
 * Rebuild the rolls a set of planned cuts sits on.
 *
 * The plan is stamped onto each cut rather than kept beside them, so anything
 * holding the cuts — the cut sheet, the stock picker — can draw the layout the
 * BOM was quantified on without being handed the stock and the job's choices
 * and planning it a second time.
 *
 * @param cuts [{ label, cutWidthMm, cutDropMm, widthAllowanceMm, placement }]
 * @returns [{ rollKey, source, rollWidthMm, stockPiece, widthAllowanceMm, bands }]
 *          stock rolls first.
 */
export function placedRolls(cuts = []) {
  const rolls = new Map()
  cuts.forEach(c => {
    const pl = c.placement
    if (!pl) return
    if (!rolls.has(pl.rollKey)) {
      rolls.set(pl.rollKey, {
        rollKey: pl.rollKey, source: pl.source, rollWidthMm: pl.rollWidthMm,
        stockPiece: pl.stockPiece, planKey: pl.planKey,
        widthAllowanceMm: Number(c.widthAllowanceMm) || 0,
        options: pl.options, autoWidthMm: pl.autoWidthMm,
        chosenWidthMm: pl.chosenWidthMm, overridden: pl.overridden,
        bandMap: new Map(),
      })
    }
    const roll = rolls.get(pl.rollKey)
    if (!roll.bandMap.has(pl.bandIdx)) {
      roll.bandMap.set(pl.bandIdx, {
        pieces: [], usedWidthMm: 0, lengthMm: pl.bandLengthMm, oversized: pl.oversized,
        rollWidthMm: pl.rollWidthMm, widthAllowanceMm: roll.widthAllowanceMm,
        source: pl.source, stockPieceId: pl.stockPiece?.id || null,
      })
    }
    const band = roll.bandMap.get(pl.bandIdx)
    band.pieces.push({
      ...c, cutWidthMm: Number(c.cutWidthMm) || 0, lengthMm: Number(c.cutDropMm) || 0,
      occupiedMm: pl.occupiedMm, offsetMm: pl.offsetMm,
    })
    band.usedWidthMm += pl.occupiedMm
  })

  return [...rolls.values()]
    .map(({ bandMap, ...roll }) => ({
      ...roll,
      bands: [...bandMap.entries()].sort((a, b) => a[0] - b[0]).map(([, band]) => ({
        ...band,
        pieces: band.pieces.sort((a, b) => a.offsetMm - b.offsetMm),
        remainingWidthMm: Math.max(0, roll.rollWidthMm - band.usedWidthMm),
      })),
    }))
    .sort((a, b) => (a.source === 'stock' ? 0 : 1) - (b.source === 'stock' ? 0 : 1))
}

/* ==========================================================================
 * Pricing categories
 *
 * A category used to be derived from what a fabric COST — the first tier whose
 * ceiling covered it — and used to charge a flat rate for it. Both halves of
 * that are gone. Cost now comes from the fabric's own wholesale rate, and the
 * category is a SELL-side fact that no arithmetic can work out: it is which
 * group of the wholesaler's price list a fabric is sold under, and only their
 * price list knows. So it is tagged on the fabric by hand and read, never
 * derived. See supabase_price_grids.sql.
 * ========================================================================== */

/** Categories in list order, for a dropdown. */
export const sortedCategories = (categories = []) =>
  categories.slice().sort((a, b) =>
    (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
    || String(a.code).localeCompare(String(b.code)))

/** The category a fabric is tagged with, or null when it hasn't been tagged. */
export function categoryForFabric(categories = [], component) {
  const code = component?.fabric_category
  if (!code) return null
  return categories.find(c => c.code === code) || null
}

/**
 * Every fabric in the library, for the window's fabric picker.
 *
 * All of them, deliberately. The picker used to be narrowed to the product's
 * own category, which made sense while the product's category decided what a
 * blind cost. It doesn't any more — any fabric can go on any roller blind, and
 * what it costs and what it sells for both follow the fabric, not the product.
 */
export function allFabrics(components = []) {
  return components
    .filter(c => c.order_type === 'fabric')
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
