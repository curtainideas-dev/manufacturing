/**
 * Stock Engine
 *
 * Pure functions for stock calculations — no React, no Supabase.
 * Handles both pack-type and bar-type components.
 */

/**
 * Get a consistent key for a component + colour combination.
 * Used to group stock entries.
 */
export function stockKey(componentId, colourVariant) {
  const suffix = colourVariant?.suffix || ''
  return `${componentId}__${suffix}`
}

/**
 * Find suitable bars in stock for a required cut length.
 * Returns bars that are available and long enough, sorted by
 * best fit (smallest bar that fits first — minimises waste).
 */
export function findSuitableBars(stockBars, componentId, colourVariant, requiredLengthMm) {
  const suffix = colourVariant?.suffix || null
  return stockBars
    .filter(bar =>
      bar.component_id === componentId &&
      bar.status === 'available' &&
      bar.length_mm >= requiredLengthMm &&
      (bar.colour_variant?.suffix || null) === suffix
    )
    .sort((a, b) => a.length_mm - b.length_mm) // best fit first
}

/**
 * Check which components in a BOM are below minimum stock.
 * Returns array of { component, colour_variant, qty_required, qty_on_hand, qty_minimum }
 */
export function checkLowStock(jobSummary, stockMap) {
  const alerts = []
  jobSummary.forEach(row => {
    const key = stockKey(row.component.id, row.colour_variant)
    const stock = stockMap[key]
    if (!stock) return
    const afterDeduction = (stock.qty_on_hand || 0) - row.total_qty
    if (afterDeduction < (stock.qty_minimum || 0)) {
      alerts.push({
        component:      row.component,
        colour_variant: row.colour_variant,
        qty_required:   row.total_qty,
        qty_on_hand:    stock.qty_on_hand,
        qty_minimum:    stock.qty_minimum,
        qty_after:      afterDeduction,
      })
    }
  })
  return alerts
}

/**
 * First-fit decreasing bin packing.
 * Returns an array of bins, each with the cuts assigned to it and the leftover length.
 * Bins where a single cut exceeds the bar length are flagged as oversized.
 *
 * @param cuts array of { mm, label } — label is the window a cut came from,
 *             carried through untouched so the picker can show it.
 */
export function packCuts(cuts, barLengthMm) {
  const sorted = [...cuts].sort((a, b) => b.mm - a.mm)
  const bins = []
  for (const cut of sorted) {
    let placed = false
    for (const bin of bins) {
      if (!bin.oversized && bin.remaining >= cut.mm) {
        bin.cuts.push(cut)
        bin.remaining -= cut.mm
        placed = true
        break
      }
    }
    if (!placed) {
      bins.push({
        cuts:      [cut],
        remaining: barLengthMm - cut.mm,
        oversized: cut.mm > barLengthMm,
      })
    }
  }
  return bins
}

/**
 * Build the { bar_id, offcut } consumption list for a bar component's cuts,
 * given a per-cut source selection.
 *
 * `packCuts` groups cuts into bins that *could* share one bar, but the picker
 * isn't limited to that — each individual cut can be sourced independently
 * (a specific offcut, or a fresh full bar), so several offcuts and a full bar
 * can be mixed within what was one bin. Cuts that both choose "full bar"
 * within the same bin still share a single bar, preserving the packing
 * optimisation for the common case.
 *
 * @param cuts required cuts, as { mm, label }
 * @param barLengthMm length of a full bar (mm)
 * @param selections   { "<binIdx>.<cutInBinIdx>": sourceId }
 *                      sourceId is '__full_bar__' or a specific offcut's id
 * @param leftoverChoices { "cut:<selKey>": {add,label,length_mm},
 *                          "bar:<binIdx>": {add,label,length_mm} }
 *                      opt-in "save the leftover as a new offcut" choices
 * @returns [{ bar_id, offcut }] — one entry per physical bar/offcut consumed,
 *          in the shape the deduct-stock handler already expects.
 */
export function buildBarDeductions(cuts, barLengthMm, selections, leftoverChoices = {}) {
  const packed = packCuts(cuts, barLengthMm)
  const bars = []

  const offcutFrom = (lo) => (lo?.add && lo.length_mm > 0)
    ? { label: lo.label?.trim() || `${Math.round(lo.length_mm)}mm`, length_mm: lo.length_mm }
    : null

  packed.forEach((bin, binIdx) => {
    const fullBarCutIdxs = []
    bin.cuts.forEach((cut, cutInBinIdx) => {
      const selKey = `${binIdx}.${cutInBinIdx}`
      const sel    = selections[selKey]
      if (sel === '__full_bar__') {
        fullBarCutIdxs.push(cutInBinIdx)
      } else if (sel) {
        bars.push({ bar_id: sel, offcut: offcutFrom(leftoverChoices[`cut:${selKey}`]) })
      }
    })
    if (fullBarCutIdxs.length > 0) {
      bars.push({ bar_id: '__full_bar__', offcut: offcutFrom(leftoverChoices[`bar:${binIdx}`]) })
    }
  })

  return bars
}

// Total individual cut slots across all bins — used to check every cut has a
// source selected before a bar-component line can be marked picked.
export function countCutSlots(cuts, barLengthMm) {
  return packCuts(cuts, barLengthMm).reduce((s, bin) => s + bin.cuts.length, 0)
}

/**
 * Build a stock map from an array of stock rows for quick lookup.
 * { [componentId__colourSuffix]: stockRow }
 */
export function buildStockMap(stockRows) {
  const map = {}
  stockRows.forEach(row => {
    const key = stockKey(row.component_id, row.colour_variant)
    map[key] = row
  })
  return map
}

/**
 * Look up a component's stock row, tolerating colour-key drift.
 *
 * Stock rows are keyed by component + colour suffix, so adding a colour variant
 * to a component that already had stock would otherwise orphan the existing row
 * (it was saved with no colour) and the holding would appear to vanish. When a
 * component has exactly one variant there is no ambiguity, so fall back to the
 * colourless row. Stock always follows the component id — never its name.
 */
export function getStock(stockMap, component, colourVariant) {
  if (!component) return undefined
  const exact = stockMap[stockKey(component.id, colourVariant)]
  if (exact) return exact
  const variants = component.colour_variants || []
  if (colourVariant && variants.length <= 1) {
    return stockMap[stockKey(component.id, null)]
  }
  return undefined
}

/**
 * Value of one stock holding at the discounted (what-you-pay) unit cost.
 * Bars are valued on total available length — full bars plus offcuts.
 */
export function stockValue(component, stock, offcutLengthMm = 0) {
  const base     = Number(component?.unit_cost) || 0
  const discount = Number(component?.discount) || 0
  const unitCost = base * (1 - discount / 100)
  const qty      = Number(stock?.qty_on_hand) || 0

  if (component?.order_type === 'bar') {
    // unit_cost is per metre for bar components
    const barLenMm  = Number(component.bar_length_mm) || 6000
    const totalMm   = qty * barLenMm + (Number(offcutLengthMm) || 0)
    return (totalMm / 1000) * unitCost
  }
  return qty * unitCost
}

/**
 * Value of the fabric held in one component and colour.
 *
 * A fabric's unit_cost is per linear metre of a FULL-WIDTH roll, so a piece
 * narrower than full width is worth its share of that: a 900mm strip off a
 * 3000mm roll is worth 30% of the rate per metre, not the whole of it. That's
 * the same width-share the BOM charges a blind, so what leaves stock and what
 * lands on the job agree.
 *
 * The reference width is the widest the fabric can be ordered in, falling back
 * to the widest piece actually held — either way a full roll values at exactly
 * its length × the rate.
 */
export function fabricStockValue(component, pieces = []) {
  const base     = Number(component?.unit_cost) || 0
  const discount = Number(component?.discount) || 0
  const rate     = base * (1 - discount / 100)

  const orderable = (Array.isArray(component?.roll_widths) ? component.roll_widths : [])
    .map(Number).filter(n => n > 0)
  const widestHeld = pieces.reduce((m, p) => Math.max(m, Number(p.roll_width_mm) || 0), 0)
  const reference  = Math.max(0, ...orderable, widestHeld)
  if (reference <= 0) return 0

  return pieces.reduce((total, p) => {
    const w = Number(p.roll_width_mm) || 0
    const l = Number(p.length_mm) || 0
    return total + (l / 1000) * rate * Math.min(1, w / reference)
  }, 0)
}

/* ==========================================================================
 * Undoing a deduction
 *
 * Deleting a job that had stock deducted used to leave the stock deducted.
 * Putting it back means undoing three different things, because a deduction
 * does three different things depending on what kind of part it is:
 *
 *   a counted quantity   pack parts come off stock.qty_on_hand. The movement
 *                        now records exactly what it took (qty_on_hand_delta),
 *                        so returning it is adding that back. A movement from
 *                        before that column existed has null there for bars
 *                        and fabric, and null means "unknown", not zero — such
 *                        a line is reported as needing a hand rather than
 *                        quietly returning nothing.
 *
 *   consumed pieces      bars and rolls are individual rows in stock_bars,
 *                        marked used and stamped with the job. Returning them
 *                        is a status change, and it is exact.
 *
 *   created offcuts      what survived the cut went back as new available
 *                        pieces. Those have to come OUT again, or a deleted
 *                        job leaves stock behind. They are told apart from
 *                        consumed pieces by status: used = taken by the job,
 *                        available = made by it.
 *
 * Pure: it decides what should happen and nothing else, so the arithmetic can
 * be checked without a database.
 * ========================================================================== */

/**
 * What returning a job's stock would do.
 *
 * movements  the job's deduct rows
 * jobBars    the stock_bars rows carrying its job_id
 * components the library, for naming the lines
 */
export function planStockRestore({ movements = [], jobBars = [], components = [] } = {}) {
  const byId = new Map(components.map(c => [c.id, c]))

  const lines = [], unreturnable = []

  movements.forEach(m => {
    if (m.movement_type !== 'deduct') return
    const component = byId.get(m.component_id) || null
    const delta = m.qty_on_hand_delta

    // Never recorded — only true of deductions taken before the column
    // existed. Returning movement.qty instead would credit millimetres as
    // whole bars, so it is surfaced rather than guessed at.
    if (delta === null || delta === undefined) {
      unreturnable.push({
        movement_id: m.id,
        component,
        colour_variant: m.colour_variant || null,
        qty: Number(m.qty) || 0,
        reason: 'Deducted before restore tracking existed, so what it took off stock was never recorded.',
      })
      return
    }

    // 0 is a real answer, not a missing one: fabric never touches the count,
    // and a bar cut entirely from offcuts takes no whole bar. Nothing to add
    // back, and nothing wrong.
    const back = -Number(delta)
    if (!back) return

    lines.push({
      component,
      component_id: m.component_id,
      colour_variant: m.colour_variant || null,
      qty: back,
    })
  })

  // One line per component+colour, since several windows deduct the same part.
  const merged = new Map()
  lines.forEach(q => {
    const k = stockKey(q.component_id, q.colour_variant)
    if (!merged.has(k)) merged.set(k, { ...q, qty: 0 })
    merged.get(k).qty += q.qty
  })

  const quantities = [...merged.values()]
  const pieces  = jobBars.filter(b => b.status === 'used')
  const offcuts = jobBars.filter(b => b.status !== 'used')

  return {
    quantities,
    pieces,
    offcuts,
    unreturnable,
    isEmpty: quantities.length === 0 && pieces.length === 0
      && offcuts.length === 0 && unreturnable.length === 0,
  }
}

/* ==========================================================================
 * Stock position across jobs
 *
 * checkLowStock answers "does this one job dip the shelf below its minimum",
 * which sounds right and quietly is not, because every job is measured against
 * the WHOLE shelf on its own. Three jobs each wanting eight of a part with ten
 * in stock are each told they are fine. On live data that hid five genuinely
 * short parts, including one where two jobs wanted 5.08m of a tube against 2m
 * on hand and the page reported a shortfall of 0.33.
 *
 * So demand is totted up once across every job in play, and each job is then
 * told two things: whether IT can be built, and whether the shelf covers
 * everything promised. They are different questions and both get asked.
 * ========================================================================== */

/**
 * The stock position for a set of jobs sharing one shelf.
 *
 * `entries` is [{ jobId, summary }] where summary is calcJobSummary output.
 * Returns { [jobId]: line[] }, a line per part worth mentioning:
 *
 *   jobShort    this job alone needs more than is on the shelf — it cannot be
 *               built today whatever else happens.
 *   shelfShort  everything committed across these jobs needs more than is on
 *               the shelf. This job might still be buildable; something has to
 *               give somewhere.
 *   belowMin    it all fits, but what is left drops under the reorder minimum.
 *
 * A part with none of the three is left out entirely.
 */
/**
 * What is on the shelf, in the SAME unit the BOM asks for.
 *
 * The stock row does not hold one unit across the board:
 *
 *   pack     qty_on_hand is a count in the component's own unit, which is
 *            already what the BOM counts. Nothing to convert.
 *   bar      qty_on_hand is a count of FULL BARS, and every offcut is its own
 *            row in stock_bars with a length. The BOM asks for length. Ten bars
 *            of a 5.4m tube is 54 metres, not 10 — comparing the two directly
 *            understated bar stock by the bar length, five- or six-fold.
 *   fabric   qty_on_hand is unused; every roll is a stock_bars piece.
 *
 * Mirrors calcQty's own rule for the BOM side — metres when the component's
 * unit is 'metres', millimetres otherwise — so both sides of the comparison
 * are always in the same unit by construction, not by coincidence. Fabric is
 * always metres, as fabric_strip is.
 *
 * The minimum is converted the same way, since for a bar it is also counted
 * in bars.
 *
 * Offcuts are counted at full length. That flatters them slightly — a 1.5m
 * offcut cannot supply a 1.8m cut — so the breakdown is returned alongside the
 * total and the page shows it, rather than presenting one number as certain.
 */
export function onHandInBomUnits(component, stock = null, pieces = []) {
  const type    = component?.order_type || 'pack'
  const qty     = Number(stock?.qty_on_hand) || 0
  const minimum = Number(stock?.qty_minimum) || 0
  const pieceMm = pieces.reduce((t, p) => t + (Number(p.length_mm) || 0), 0)

  if (type === 'bar') {
    const barMm  = Number(component?.bar_length_mm) || 6000
    const toUnit = (mm) => (component?.unit === 'metres' ? mm / 1000 : mm)
    return {
      onHand:   toUnit(qty * barMm + pieceMm),
      minimum:  toUnit(minimum * barMm),
      fullBars: qty,
      barMm,
      pieces:   pieces.length,
      piecesIn: toUnit(pieceMm),
    }
  }
  if (type === 'fabric') {
    return { onHand: pieceMm / 1000, minimum: 0, pieces: pieces.length, piecesIn: pieceMm / 1000 }
  }
  return { onHand: qty, minimum }
}

export function stockPositions(entries = [], stockMap = {}, stockBars = []) {
  // Loose pieces — offcuts and rolls — by the same key as the stock map.
  const piecesByKey = new Map()
  stockBars.forEach(b => {
    if (b.status && b.status !== 'available') return
    const k = stockKey(b.component_id, b.colour_variant)
    if (!piecesByKey.has(k)) piecesByKey.set(k, [])
    piecesByKey.get(k).push(b)
  })

  // One pass to total demand, so every job is measured against the same shelf.
  const demand = new Map()
  entries.forEach(({ summary = [] }) => {
    summary.forEach(row => {
      const k = stockKey(row.component.id, row.colour_variant)
      demand.set(k, (demand.get(k) || 0) + (Number(row.total_qty) || 0))
    })
  })

  const out = {}
  entries.forEach(({ jobId, summary = [] }) => {
    const lines = []
    // Fold the job's own rows per part first. calcJobSummary already merges,
    // so this is belt and braces — but without it a part appearing twice in
    // one summary would produce two lines saying different things about the
    // same shelf.
    const own = new Map()
    summary.forEach(r => {
      const k = stockKey(r.component.id, r.colour_variant)
      if (!own.has(k)) own.set(k, { ...r, total_qty: 0 })
      own.get(k).total_qty += Number(r.total_qty) || 0
    })
    ;[...own.values()].forEach(row => {
      const k = stockKey(row.component.id, row.colour_variant)
      const stock  = stockMap[k]
      const pieces = piecesByKey.get(k) || []
      // Nothing tracked for this part — silence beats a made-up shortfall. A
      // bar or roll with loose pieces but no stock row IS tracked, though.
      if (!stock && pieces.length === 0) return

      const held        = onHandInBomUnits(row.component, stock, pieces)
      const onHand      = held.onHand
      const minimum     = held.minimum
      const jobQty      = Number(row.total_qty) || 0
      const totalDemand = demand.get(k) || 0
      const otherQty    = Math.max(0, totalDemand - jobQty)

      const jobShort   = jobQty > onHand
      const shelfShort = totalDemand > onHand
      const belowMin   = !shelfShort && (onHand - totalDemand) < minimum

      if (!jobShort && !shelfShort && !belowMin) return

      lines.push({
        component:      row.component,
        colour_variant: row.colour_variant || null,
        // Fabric is costed in metres whatever its unit says; bars in metres
        // or millimetres per calcQty. Report the unit the numbers are in.
        unit: row.component?.order_type === 'fabric' ? 'metres'
          : row.component?.order_type === 'bar' && row.component?.unit !== 'metres' ? 'mm'
          : (row.component?.unit || ''),
        // How the stock figure is made up, for a bar or roll — so "54 metres"
        // can be read as "10 full bars" rather than taken on trust.
        fullBars:   held.fullBars ?? null,
        barMm:      held.barMm ?? null,
        pieces:     held.pieces ?? 0,
        piecesIn:   held.piecesIn ?? 0,
        jobQty,
        onHand,
        minimum,
        totalDemand,
        otherQty,
        // How many OTHER jobs here want any of it — "also wanted by 2 jobs".
        otherJobs: entries.filter(e => e.jobId !== jobId
          && (e.summary || []).some(r => stockKey(r.component.id, r.colour_variant) === k)).length,
        jobShort,
        shelfShort,
        belowMin,
        jobShortBy:   Math.max(0, jobQty - onHand),
        shelfShortBy: Math.max(0, totalDemand - onHand),
        leaves:       onHand - totalDemand,
      })
    })
    if (lines.length) {
      // Worst first: what stops this job, then what stops the shelf.
      lines.sort((a, b) => (b.jobShort - a.jobShort) || (b.shelfShort - a.shelfShort)
        || b.shelfShortBy - a.shelfShortBy)
      out[jobId] = lines
    }
  })
  return out
}
