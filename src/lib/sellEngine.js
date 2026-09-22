/**
 * Sell Engine
 *
 * What a window is SOLD for, and what that leaves once it is built.
 *
 * The app already knew what everything cost. It did not know what anything
 * earned, because the only number beside cost was cost × a markup — which is
 * an assumption dressed as a price. Gross profit needs the real figure, and
 * for roller blinds the real figure comes off a wholesaler's list: a grid of
 * prices by width and drop, one grid per fabric category.
 *
 * So the chain is:
 *
 *   fabric  ──tagged with──▶  category  ──holds──▶  price grid
 *                                                        │
 *                          window width × drop ──────────┘
 *                                    │
 *                                    ▼
 *                              list sell price
 *                          + option sell surcharges
 *                          ( or an override, when what
 *                            we actually charged differs )
 *
 * Tracks have no fabric and so no category; their sell price is typed on the
 * window. Nothing is inferred for them, because there is nothing to infer it
 * from and a guessed sell price produces a confidently wrong GP.
 *
 * Pure — no React, no Supabase.
 */

/* ==========================================================================
 * Grid lookup
 * ========================================================================== */

/**
 * The first band at or above a measurement.
 *
 * Wholesale price lists are banded: a grid with columns at 1,000 / 1,200 /
 * 1,400 charges a 1,150mm blind at the 1,200 column. Rounding UP is the whole
 * convention — rounding to nearest would undercharge half of every band, and
 * the list has no cell for what falls between.
 *
 * Returns the INDEX, or -1 when the measurement is past the last band. That is
 * not the same as "use the last band": a blind bigger than the largest cell is
 * off the price list entirely — the Inline list says as much, recommending a
 * different tube above 3,000mm — so it gets no price rather than the corner
 * one, and the window asks for a figure instead.
 */
export function bandIndex(bands = [], mm) {
  const value = Number(mm) || 0
  for (let i = 0; i < bands.length; i++) {
    if (value <= Number(bands[i])) return i
  }
  return -1
}

/**
 * The list price for one size out of one grid.
 *
 * Returns { price, widthBand, dropBand } or a reason it couldn't:
 *   'no_grid'   the category has no price list loaded yet
 *   'oversize'  bigger than the largest cell — off the list
 *   'no_cell'   the grid has a hole where that cell should be
 */
export function gridPrice(grid, widthMm, dropMm) {
  const widths = Array.isArray(grid?.widths) ? grid.widths : []
  const drops  = Array.isArray(grid?.drops)  ? grid.drops  : []
  const prices = Array.isArray(grid?.prices) ? grid.prices  : []
  if (widths.length === 0 || drops.length === 0 || prices.length === 0) {
    return { price: null, reason: 'no_grid' }
  }

  const wi = bandIndex(widths, widthMm)
  const di = bandIndex(drops,  dropMm)
  if (wi < 0 || di < 0) {
    return {
      price: null, reason: 'oversize',
      maxWidth: Number(widths[widths.length - 1]) || 0,
      maxDrop:  Number(drops[drops.length - 1])  || 0,
    }
  }

  const cell = prices[di]?.[wi]
  if (cell === null || cell === undefined || cell === '') {
    return { price: null, reason: 'no_cell', widthBand: widths[wi], dropBand: drops[di] }
  }
  return { price: Number(cell), widthBand: Number(widths[wi]), dropBand: Number(drops[di]) }
}

/* ==========================================================================
 * Option surcharges
 * ========================================================================== */

/**
 * What the window's answers add to the list price.
 *
 * A price list prices a plain blind of a size; motorisation, a cassette or a
 * heavier tube are extra, and the options admin already carries a
 * `sell_surcharge` on both the option and each of its choices for exactly
 * that. A 'qty' option multiplies by the number entered, mirroring how
 * cost_surcharge is applied.
 *
 * `answers` is the RESOLVED answer set (see bomEngine.resolveAnswers), so an
 * answer forced by another option surcharges the same as one picked by hand —
 * the customer is charged for what they are getting either way.
 */
export function optionSellSurcharge(optionDefs = [], answers = {}) {
  return (optionDefs || []).reduce((total, opt) => {
    const value = answers[opt.code]
    if (value === undefined || value === null || value === '') return total

    if (opt.selection === 'qty') {
      const qty = Number(value) || 0
      return total + (Number(opt.sell_surcharge) || 0) * qty
    }

    const values = Array.isArray(value) ? value : [value]
    const choiceTotal = values.reduce((s, v) => {
      const choice = (opt.choices || []).find(c => String(c.value) === String(v))
      return s + (Number(choice?.sell_surcharge) || 0)
    }, 0)
    return total + (Number(opt.sell_surcharge) || 0) + choiceTotal
  }, 0)
}

/* ==========================================================================
 * A window's sell price
 * ========================================================================== */

/**
 * What one window sells for, and where that number came from.
 *
 * Precedence, and the reasons for it:
 *
 *   1. an override on the window What we actually charged, and therefore the
 *                                last word. A list price is what the list
 *                                says, not always what went on the invoice —
 *                                discounts, a price held from a quote, a
 *                                goodwill adjustment. It beats the snapshot
 *                                on purpose: the real figure is often only
 *                                known at invoicing, which is AFTER the job
 *                                was confirmed, and a lock that shut out the
 *                                true number would defeat the point of
 *                                measuring GP at all.
 *   2. the job's sell snapshot   A confirmed job's GP must not move because
 *                                the price LIST was updated afterwards. Cost
 *                                already freezes at confirm (price_snapshot);
 *                                the looked-up sell freezes beside it, or the
 *                                margin on a job from March silently rewrites
 *                                itself. It guards against the list moving,
 *                                not against being told the truth.
 *   3. the price grid            Blinds only, via the chosen fabric's category.
 *
 * Returns { sell, source, listPrice, surcharge, reason, ... }. `sell` is null
 * when nothing could supply one, with `reason` saying which link in the chain
 * is missing — 'no_fabric', 'untagged_fabric', 'no_grid', 'oversize',
 * 'no_cell', or 'not_priced' for a track nobody has typed a price on. A null
 * sell is reported, never defaulted to zero: zero is a real price meaning
 * "given away", and a job full of them would report a catastrophic loss
 * rather than an incomplete entry.
 */
export function windowSell({
  win, product, fabricComponent = null, categories = [],
  optionDefs = [], answers = {}, sellSnapshot = null,
} = {}) {
  const surcharge = optionSellSurcharge(optionDefs, answers)

  const override = win?.sell_price
  if (override !== undefined && override !== null && override !== '') {
    return { sell: Number(override), source: 'override', listPrice: null, surcharge: 0 }
  }

  const snap = sellSnapshot?.[win?.id]
  if (snap !== undefined && snap !== null) {
    return { sell: Number(snap), source: 'snapshot', listPrice: null, surcharge: 0 }
  }

  // Tracks carry no fabric, so no category and no grid. Typed or nothing.
  if (product?.product_type !== 'blind') {
    return { sell: null, source: null, reason: 'not_priced', surcharge }
  }

  if (!fabricComponent) {
    return { sell: null, source: null, reason: 'no_fabric', surcharge }
  }

  const category = categories.find(c => c.code === fabricComponent.fabric_category)
  if (!category) {
    return { sell: null, source: null, reason: 'untagged_fabric', surcharge }
  }

  const hit = gridPrice(category, win?.width_mm, win?.drop_mm)
  if (hit.price === null) {
    return { sell: null, source: null, reason: hit.reason, category, surcharge, ...hit }
  }

  return {
    sell:      hit.price + surcharge,
    source:    'grid',
    listPrice: hit.price,
    surcharge,
    category,
    widthBand: hit.widthBand,
    dropBand:  hit.dropBand,
  }
}

/* ==========================================================================
 * Gross profit
 * ========================================================================== */

/**
 * GP on one line.
 *
 * Margin is on the SELL price — (sell − cost) / sell — which is what "GP%"
 * means in a trade that buys at wholesale and sells at retail. The other
 * reading, profit over cost, is markup, and the two diverge fast: a blind
 * costing $100 and selling for $200 is 50% GP and 100% markup. Calling the
 * second one GP would flatter every job on the list.
 *
 * Null sell means nothing is known yet, which is different from zero profit,
 * so the whole line comes back null rather than showing -100%.
 */
export function grossProfit(cost, sell) {
  const c = Number(cost) || 0
  if (sell === null || sell === undefined || sell === '') {
    return { cost: c, sell: null, gp: null, gpPct: null, priced: false }
  }
  const s = Number(sell) || 0
  const gp = s - c
  return { cost: c, sell: s, gp, gpPct: s !== 0 ? (gp / s) * 100 : null, priced: true }
}

/**
 * The job's GP, from its windows' own figures.
 *
 * Windows with no sell price are counted and set aside rather than treated as
 * free: a total that quietly includes their cost and none of their revenue
 * reads as a loss the business is not making. So the headline is the GP of
 * what IS priced, and the count of what isn't rides alongside it — an
 * incomplete answer that says it is incomplete beats a complete-looking wrong
 * one.
 *
 * Job-level extra lines are real cost with no window to sell them through, so
 * they come off the total. That is deliberate: a delivery or a bracket bought
 * for the job eats into the margin on it and should be seen to.
 */
export function jobGrossProfit(lines = [], extrasCost = 0) {
  const priced   = lines.filter(l => l.sell !== null && l.sell !== undefined)
  const unpriced = lines.filter(l => l.sell === null || l.sell === undefined)

  const sell = priced.reduce((s, l) => s + (Number(l.sell) || 0), 0)
  const cost = priced.reduce((s, l) => s + (Number(l.cost) || 0), 0)
    + (Number(extrasCost) || 0)

  const gp = sell - cost
  return {
    cost, sell, gp,
    gpPct:         sell !== 0 ? (gp / sell) * 100 : null,
    pricedCount:   priced.length,
    unpricedCount: unpriced.length,
    unpricedCost:  unpriced.reduce((s, l) => s + (Number(l.cost) || 0), 0),
    extrasCost:    Number(extrasCost) || 0,
    complete:      unpriced.length === 0,
  }
}
