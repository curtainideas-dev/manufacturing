/**
 * Cut Plan
 *
 * Tracks, tubes and base bars are cut in BULK — the whole job's lengths for a
 * part are sawn in one session, off whatever is on the rack, and the leftovers
 * are put away afterwards. The app's job is therefore not to ask where each
 * cut came from. It is to say, before anyone picks up a saw, which bar each
 * cut should come off and in what order, so the least material is wasted.
 *
 * That is the whole point of the arrangement: two 2,400mm cuts and a 1,100mm
 * cut fit one 6,000mm bar with 100mm left; cut in the order they happen to
 * appear on the job they can take two bars and leave two unusable stubs.
 *
 * WHAT IT OPTIMISES FOR, in order:
 *
 *   1. Fewest full bars.        Bars cost money; offcuts are already paid for.
 *   2. Fewest leftover pieces.  Material is not destroyed by being left over —
 *                               a remnant goes back on the shelf. What costs
 *                               is FRAGMENTATION, so an arrangement that ends
 *                               with one piece beats one that ends with three.
 *   3. The biggest single one.  Among plans leaving the same NUMBER of pieces,
 *                               prefer the one whose piece is longest — that
 *                               is the one that gets used again.
 *   4. Fewest offcuts consumed. A last tie-break, so the plan doesn't pull a
 *                               piece off the shelf for no gain.
 *
 * Rules 2 and 4 are why this is not simply "use the offcuts first". Four
 * 3,000mm cuts against 6,000mm bars need two bars and leave nothing over;
 * feeding one of them through a 3,500mm offcut still needs two bars, and has
 * spent the offcut to leave two stubs behind. The planner tries every offcut
 * and keeps only the ones that earn their place.
 *
 * Note rule 3 is subordinate to rule 2 on purpose. Ranking on "biggest single
 * remnant" alone rewards a plan for MAKING waste — a 3,000mm leftover scores
 * above a plan that wastes nothing at all — which is exactly backwards.
 *
 * Pure — no React, no Supabase, no stock writes. What it returns is a
 * proposal; nothing leaves the shelf until someone confirms it.
 */

/**
 * Take the largest cuts that still fit, biggest first.
 *
 * Applied to a full bar this is exactly first-fit-decreasing, which is what
 * the app packed with before any of this existed — so a plan with no offcuts
 * to consider produces the same bars it always did.
 *
 * `pool` is a length-sorted (descending) array; taken entries are spliced out.
 */
function fillBin(capacityMm, pool) {
  const taken = []
  let remaining = capacityMm
  for (let i = 0; i < pool.length; ) {
    if (pool[i].mm <= remaining) {
      remaining -= pool[i].mm
      taken.push(pool[i])
      pool.splice(i, 1)
    } else {
      i++
    }
  }
  return { taken, remaining }
}

/**
 * One concrete arrangement, given a decision about which offcuts to involve.
 *
 * Offcuts are filled first so the cuts they can absorb are gone before the
 * bars are packed — but only the offcuts this candidate was handed, which is
 * what lets the search decide whether involving them was worth it.
 */
function buildPlan(cuts, barLengthMm, offcutsToUse) {
  const pool    = [...cuts].sort((a, b) => b.mm - a.mm)
  const sources = []

  ;[...offcutsToUse]
    .sort((a, b) => (Number(b.length_mm) || 0) - (Number(a.length_mm) || 0))
    .forEach(oc => {
      const capacity = Number(oc.length_mm) || 0
      const { taken, remaining } = fillBin(capacity, pool)
      // An offcut nothing fits on is not consumed — it stays on the shelf.
      if (taken.length === 0) return
      sources.push({
        kind:        'offcut',
        barId:       oc.id,
        label:       oc.label || `${Math.round(capacity).toLocaleString()}mm offcut`,
        capacityMm:  capacity,
        cuts:        taken,
        usedMm:      capacity - remaining,
        remainderMm: remaining,
      })
    })

  let guard = 0
  while (pool.length > 0 && guard++ < 1000) {
    const { taken, remaining } = fillBin(barLengthMm, pool)
    if (taken.length === 0) break   // can't happen: oversized cuts are filtered out
    sources.push({
      kind:        'bar',
      barId:       '__full_bar__',
      label:       `Full bar (${Math.round(barLengthMm).toLocaleString()}mm)`,
      capacityMm:  barLengthMm,
      cuts:        taken,
      usedMm:      barLengthMm - remaining,
      remainderMm: remaining,
    })
  }

  const fullBarsUsed = sources.filter(s => s.kind === 'bar').length
  const offcutsUsed  = sources.filter(s => s.kind === 'offcut').length
  const remnants     = sources.map(s => s.remainderMm).filter(mm => mm > 0)

  return {
    sources,
    fullBarsUsed,
    offcutsUsed,
    remnantCount:     remnants.length,
    remnantMm:        remnants.reduce((s, mm) => s + mm, 0),
    largestRemnantMm: remnants.length ? Math.max(...remnants) : 0,
  }
}

/**
 * Fewest bars, then fewest leftover pieces, then the biggest single one, then
 * fewest offcuts spent. See the rules at the top of the file.
 */
function better(a, b) {
  if (!b) return true
  if (a.fullBarsUsed !== b.fullBarsUsed)         return a.fullBarsUsed < b.fullBarsUsed
  if (a.remnantCount !== b.remnantCount)         return a.remnantCount < b.remnantCount
  if (a.largestRemnantMm !== b.largestRemnantMm) return a.largestRemnantMm > b.largestRemnantMm
  return a.offcutsUsed < b.offcutsUsed
}

/**
 * The arrangement to cut this part's lengths in.
 *
 * @param cuts            [{ mm, label }] — every length this job needs of one
 *                        part, label being the window it is for.
 * @param barLengthMm     length of a full bar of that part.
 * @param offcuts         available stock_bars rows for that part and colour.
 * @param fullBarsOnHand  stock.qty_on_hand — a COUNT OF BARS, never a length.
 *
 * Offcuts shorter than the shortest cut are dropped before the search: they
 * cannot help, and leaving them in only makes the search longer.
 *
 * The search is a hill climb — start with bars alone, then repeatedly add
 * whichever single unused offcut improves the plan most, stopping when none
 * does. Exhaustive over every subset would be 2^n for no practical gain; a
 * rack holds a handful of offcuts of any one profile, and each step already
 * considers all of them.
 */
export function planBarCuts({ cuts = [], barLengthMm = 0, offcuts = [], fullBarsOnHand = 0 } = {}) {
  const barLen = Number(barLengthMm) || 0
  const clean  = (cuts || []).filter(c => Number(c?.mm) > 0)
    .map(c => ({ mm: Math.round(Number(c.mm)), label: c.label || null }))

  // Nothing to pack into. Reported rather than packed against a guessed
  // length, the same way the cut sheet refuses to draw a bar it doesn't know.
  if (barLen <= 0) {
    return {
      sources: [], oversized: [], cuts: clean, barLengthMm: 0,
      totalCutMm: clean.reduce((s, c) => s + c.mm, 0),
      fullBarsUsed: 0, offcutsUsed: 0, remnantCount: 0, remnantMm: 0, largestRemnantMm: 0,
      shortfallBars: 0, unplannable: true,
    }
  }

  const oversized = clean.filter(c => c.mm > barLen)
  const packable  = clean.filter(c => c.mm <= barLen)
  const shortest  = packable.length ? Math.min(...packable.map(c => c.mm)) : Infinity

  const usable = (offcuts || [])
    .filter(o => (Number(o?.length_mm) || 0) >= shortest)
    .sort((a, b) => (Number(b.length_mm) || 0) - (Number(a.length_mm) || 0))

  let chosen = []
  let best   = buildPlan(packable, barLen, chosen)

  let improved = true
  while (improved) {
    improved = false
    let bestAdd = null, bestAddPlan = null
    usable.forEach(oc => {
      if (chosen.includes(oc)) return
      const plan = buildPlan(packable, barLen, [...chosen, oc])
      if (better(plan, bestAddPlan)) { bestAdd = oc; bestAddPlan = plan }
    })
    if (bestAddPlan && better(bestAddPlan, best)) {
      best = bestAddPlan
      chosen = [...chosen, bestAdd]
      improved = true
    }
  }

  return {
    ...best,
    oversized,
    cuts:          clean,
    barLengthMm:   barLen,
    totalCutMm:    clean.reduce((s, c) => s + c.mm, 0),
    shortfallBars: Math.max(0, best.fullBarsUsed - (Number(fullBarsOnHand) || 0)),
    unplannable:   false,
  }
}

/**
 * The plan in the shape the deduct handler already takes.
 *
 * One entry per physical piece consumed — a specific offcut by id, or
 * '__full_bar__' for each whole bar off the count. `offcut` is always null
 * here: what survives the saw is recorded AFTER cutting, against what really
 * came off, not against what was predicted (see plannedOffcuts).
 */
export function barDeductionsFromPlan(plan) {
  return (plan?.sources || []).map(s => ({ bar_id: s.barId, offcut: null }))
}

/**
 * What the plan expects to be left over, for the record-offcuts step.
 *
 * Kept as a prediction rather than written straight into stock, because the
 * saw is where the truth is: a bar cut 40mm short, a length that had to be
 * re-squared, an offcut already shorter than its label claimed. The figures
 * here pre-fill that form; the person at the bench corrects them.
 *
 * A remnant of an offcut names the piece it came off, so it can be told apart
 * from the bar remnants when four of them are listed together.
 */
export function plannedOffcuts(plan) {
  return (plan?.sources || [])
    .filter(s => s.remainderMm > 0)
    .map((s, i) => ({
      from:      s.kind,
      from_id:   s.kind === 'offcut' ? s.barId : null,
      from_label: s.label,
      length_mm: Math.round(s.remainderMm),
      label:     s.kind === 'offcut'
        ? `Rem. ${s.label}`
        : `Bar ${i + 1} rem.`,
    }))
}

/** A one-line summary of what the plan asks for — "2 bars + 1 offcut". */
export function planSummary(plan) {
  if (!plan || plan.unplannable) return 'No bar length set'
  const parts = []
  if (plan.fullBarsUsed) parts.push(`${plan.fullBarsUsed} full bar${plan.fullBarsUsed !== 1 ? 's' : ''}`)
  if (plan.offcutsUsed)  parts.push(`${plan.offcutsUsed} offcut${plan.offcutsUsed !== 1 ? 's' : ''}`)
  return parts.length ? parts.join(' + ') : 'nothing to cut'
}
