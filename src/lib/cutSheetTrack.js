/**
 * cutSheetTrack
 *
 * The cut sheet for a TRACK job — the sibling of the blind sheet in
 * exportCutSheet.js, and deliberately not the same document.
 *
 * A blind and a track are cut from different things and fail in different
 * ways. A blind is a rectangle taken out of a roll, so its sheet nests cuts
 * across a width and lives or dies on fabric waste. A track is a length sawn
 * off a bar: there is no width to nest, the only question along the bar is how
 * the cuts pack end to end, and what decides whether the finished track works
 * is not its length at all but what is threaded onto and screwed into it —
 * how many carriers, how many brackets, and which way it draws.
 *
 * So the table carries:
 *
 *   Ordered W     the width as ordered, for checking against the order.
 *   Cut length    what the saw is set to — the width less the recipe's
 *                 deduction, already applied.
 *   count columns one per component kind the bench needs a number for, each
 *                 showing the part and the schedule figure it came from
 *                 ("60mm S-Wave Carrier · 2×36 = 72"). Which kinds those are
 *                 is the `on_cut_sheet` tick in the Kinds admin — the same
 *                 tick that prints a spec line on the blind sheet, because
 *                 "the bench needs to see this" is one question, answered in
 *                 the shape each sheet has room for.
 *   Opening       how the track draws — centre open, free hanging, one way —
 *                 and on a one-way track the direction with it, since "one
 *                 way" without a hand is only half an instruction. The
 *                 direction is the return answer, the only left/right a track
 *                 records; it is never the control side, which tracks do not
 *                 have and which is a different spec besides.
 *
 * Behind the table come the BAR CHARTS — one per track profile and colour,
 * each bar drawn to scale with this job's cuts laid end to end and the
 * remainder shaded, so the saw can be set up bar by bar instead of working out
 * the packing on the bench. It is the same CUT PLAN the stock deduction
 * confirms (lib/cutPlan), so the sheet at the saw and what leaves the shelf
 * cannot disagree — including which existing offcuts the plan pulls off the
 * rack, which is the difference between an arrangement that reads well on
 * paper and one that actually minimises what gets thrown away.
 */

import { stockKey, getStock } from './stockEngine'
import { planBarCuts } from './cutPlan'
import { resolveAnswers, roleSpecs } from './bomEngine'
import {
  ACCENT_DARK, WARM_100, WARM_200, WARM_300, INK, WHITE,
  DANGER, DANGER_BG, GREEN_BG, DASH,
  clip, footnote,
} from './pdfKit'

/* --------------------------------------------------------------------------
 * Opening
 *
 * How the track draws — centre open, one way, free hanging — and, when it is
 * one way, which way. That is one fact in two halves: "one way" on its own
 * tells the bench the track is handed without telling them which hand, and
 * the second half is only ever asked on a one-way track, so it has nothing to
 * say on the other two.
 *
 * The direction is the `return` answer, because that is the only left/right
 * this track records and, on a one-way track, the end it returns to is the
 * end it stacks to. The other two openings force that answer rather than
 * asking it — centre open returns at both ends, free hanging at neither — so
 * printing it there would add a word that means nothing about the opening.
 *
 * Both reads go through resolveAnswers, so an answer that was decided for a
 * window rather than picked by hand reads exactly the same.
 *
 * The known codes first, then a name pattern, so the column survives either
 * option being renamed or set up again on a future track type — the same
 * belt-and-braces the blind sheet uses for roll direction.
 * ------------------------------------------------------------------------ */
const OPENING_CODE   = 'opening'
const RETURN_CODE    = 'return'

const OPENING_PATTERN = /opening|draw/i
const RETURN_PATTERN  = /return|stack/i

const findByCodeOrName = (optionDefs, code, pattern) =>
  (optionDefs || []).find(o => o.code === code)
  || (optionDefs || []).find(o => pattern.test(`${o?.name || ''} ${o?.code || ''}`))

/** A matched option's answer as its own label, or null when unanswered. */
function answerLabel(win, optionDefs, opt) {
  if (!opt) return null
  const value = resolveAnswers(optionDefs, win.config)[opt.code]
  if (value === undefined || value === null || value === '') return null
  const choice = (opt.choices || []).find(c => String(c.value) === String(value))
  return choice?.label ?? String(value)
}

/**
 * "Centre open", "Free hanging", or "One way · Left".
 *
 * The direction rides along only on a one-way track — decided by whether the
 * return option is ASKED for this answer rather than by matching the word "one
 * way", so a renamed choice still behaves and a setup that asks the direction
 * on some other opening gets it too.
 */
export function openingSpec(win, optionDefs = []) {
  const openingOpt = findByCodeOrName(optionDefs, OPENING_CODE, OPENING_PATTERN)
  const opening    = answerLabel(win, optionDefs, openingOpt)
  if (!opening) return DASH

  const returnOpt = findByCodeOrName(optionDefs, RETURN_CODE, RETURN_PATTERN)
  if (!returnOpt) return opening

  // Only when this opening is the one the direction is actually asked for. On
  // every other opening the answer is forced, and a forced "both ends" says
  // nothing about how the track draws.
  const answers = resolveAnswers(optionDefs, win.config)
  const asked = returnOpt.depends_on_code
    ? String(answers[returnOpt.depends_on_code]) === String(returnOpt.depends_on_value)
    : false
  if (!asked) return opening

  const direction = answerLabel(win, optionDefs, returnOpt)
  return direction ? `${opening} · ${direction}` : opening
}

/**
 * The option answers that decide the build, as a short list for the line under
 * each row — Fixing, Operation, and anything else a setup has added.
 *
 * Opening and return are left out: they are the column now, and an answer
 * printed twice in two vocabularies ("One way · Left" above, "Return: Left"
 * below) reads as two different facts.
 */
export function optionSpecs(win, optionDefs = []) {
  const answers = resolveAnswers(optionDefs, win.config)
  const inColumn = new Set([
    findByCodeOrName(optionDefs, OPENING_CODE, OPENING_PATTERN)?.code,
    findByCodeOrName(optionDefs, RETURN_CODE, RETURN_PATTERN)?.code,
  ].filter(Boolean))

  return (optionDefs || [])
    .filter(o => !inColumn.has(o.code))
    .map(o => {
      const value  = answers[o.code]
      if (value === undefined || value === null || value === '') return null
      const choice = (o.choices || []).find(c => String(c.value) === String(value))
      return { role: o.name || o.code, value: choice?.label ?? String(value), changed: false }
    })
    .filter(Boolean)
}

/* --------------------------------------------------------------------------
 * Count columns
 * ------------------------------------------------------------------------ */

/** The number of columns the page has room for before the cells start to clip. */
export const MAX_COUNT_COLS = 3

/**
 * Which kinds get a count column, in order.
 *
 * Every kind ticked `on_cut_sheet` that actually appears on this job as a
 * counted part. Bars are excluded — the track itself is a ticked kind on some
 * setups, and it already has two columns of its own.
 *
 * Ranked by how many windows carry the kind, so on a job where the brackets
 * differ window to window the column that is the same everywhere doesn't push
 * out the one that varies. Kinds level on that — which is the usual case,
 * since most ticked kinds appear on every window — fall into the order they
 * are listed in the Kinds admin. That is the lever for "carriers before
 * brackets": order them there and the columns follow. Name breaks a remaining
 * tie, so the sheet never reshuffles between two prints of the same job.
 *
 * Anything past the cap isn't dropped — it falls to the spec line under each
 * row, which is where it would have been printed on the blind sheet anyway.
 */
export function trackCountKinds(windowsWithBOM = [], kinds = []) {
  const ticked = new Set(kinds.filter(k => k?.on_cut_sheet).map(k => k.name))
  if (ticked.size === 0) return []

  const sortOrder = new Map(kinds.map(k => [k.name, Number(k.sort_order) || 0]))

  const windowCount = new Map()
  windowsWithBOM.forEach(win => {
    const seen = new Set()
    ;(win.bom || []).forEach(l => {
      const kind = l.component?.kind
      if (!kind || !ticked.has(kind)) return
      if (l.component?.order_type === 'bar') return
      if (Number(l.qty) <= 0) return
      seen.add(kind)
    })
    seen.forEach(kind => windowCount.set(kind, (windowCount.get(kind) || 0) + 1))
  })

  return [...windowCount.entries()]
    .sort((a, b) =>
      b[1] - a[1]
      || (sortOrder.get(a[0]) ?? 0) - (sortOrder.get(b[0]) ?? 0)
      || a[0].localeCompare(b[0]))
    .slice(0, MAX_COUNT_COLS)
    .map(([kind]) => kind)
}

/**
 * The parts of one kind on one window, as the count cell shows them.
 *
 * `formula` is the "2×36" the quantity was read off — multiplier × the width
 * schedule's own figure — so the bench can check the number against the
 * supplier's chart instead of taking it on trust. Lines that aren't scheduled
 * (a fixed two end caps) have none, and show the quantity alone.
 *
 * It is only offered when it AGREES with the quantity. The label is computed
 * live from the window's width, while a confirmed job's quantity is frozen at
 * what it was costed at, so the two can disagree — a job confirmed before its
 * carrier schedule existed carries the quantity it was priced with, and
 * today's chart says something else. Printing "1×70 = 4.19" would assert an
 * equation that is false and put the bench on the wrong side of it, so where
 * they disagree the quantity stands alone: it is what was confirmed, ordered
 * and costed, and it is the one to build to.
 */
export function kindEntries(bom = [], kind) {
  return (bom || [])
    .filter(l => l.component?.kind === kind && Number(l.qty) > 0)
    .map(l => {
      const qty = Number(l.qty)
      return {
        name: `${l.component?.name || DASH}${l.colour_variant?.name ? ` · ${l.colour_variant.name}` : ''}`,
        formula: formulaAgrees(l.width_formula, qty) ? l.width_formula : null,
        qty,
        changed: !!l.substituted_from,
      }
    })
}

/**
 * Does an "M×N" label multiply out to this quantity?
 *
 * Anything unparseable counts as disagreement, so a label shape this doesn't
 * understand is dropped rather than printed beside a number it may not equal.
 */
export function formulaAgrees(label, qty) {
  if (!label) return false
  const [m, n] = String(label).split('×').map(Number)
  if (!isFinite(m) || !isFinite(n)) return false
  return Math.abs(m * n - Number(qty)) < 1e-9
}

/**
 * The cut-sheet row for one track window. Exported separately from the
 * rendering so the numbers can be checked without generating a PDF.
 */
export function trackSheetRow(win, optionDefs = [], kinds = [], countKinds = []) {
  const bom = win.bom || []

  // The things that get sawn. Usually one; joined rather than split across
  // rows so a window stays one line on the sheet.
  const bars = bom.filter(l => l.component?.order_type === 'bar' && Number(l.qty) > 0)

  // The cut length, in millimetres, whatever the line is costed in. A bar
  // bought by the metre still gets sawn in mm, and a cut sheet that says
  // "2.388" is a cut sheet someone has to convert at the saw.
  const cutMm = (line) => {
    const qty = Number(line.qty) || 0
    return line.component?.unit === 'metres' ? Math.round(qty * 1000) : Math.round(qty)
  }

  // Kinds printed as columns are not repeated in the spec line under the row.
  const counted = new Set(countKinds)

  return {
    window:   win.label || DASH,
    track:    bars.length
      ? bars.map(l => `${l.component?.name || DASH}${l.colour_variant?.name ? ` · ${l.colour_variant.name}` : ''}`).join(' / ')
      : DASH,
    orderedW: win.width_mm != null ? Number(win.width_mm).toLocaleString() : DASH,
    cutLength: bars.length ? bars.map(l => cutMm(l).toLocaleString()).join(' / ') : DASH,
    counts:   countKinds.map(kind => ({ kind, entries: kindEntries(bom, kind) })),
    opening:  openingSpec(win, optionDefs),
    // The options that decide the build, then any ticked kind that didn't get
    // a column of its own.
    specs: [
      ...optionSpecs(win, optionDefs),
      ...roleSpecs(bom, kinds).filter(s => !counted.has(s.role)),
    ],
  }
}

/* --------------------------------------------------------------------------
 * Bar packing
 * ------------------------------------------------------------------------ */

/**
 * The job's track cuts, grouped into the bars they'll be cut from, each group
 * already packed.
 *
 * Grouped by profile, colour AND bar length: two cuts only share a bar if they
 * are the same part in the same colour, and the packing only means anything
 * against one bar length.
 *
 * A component with no bar length recorded can't be packed — there is no bar to
 * pack into — so it comes back with its cuts and no bins, and the chart says
 * so rather than drawing a bar of invented length.
 *
 * Exported separately from the rendering so a layout can be checked without
 * generating a PDF.
 */
export function trackCutGroups(windowsWithBOM = [], stock = {}) {
  const { stockBars = [], stockMap = {} } = stock
  const groups = new Map()

  windowsWithBOM.forEach((win, i) => {
    (win.bom || []).forEach(line => {
      if (line.component?.order_type !== 'bar') return
      const qty = Number(line.qty) || 0
      if (qty <= 0) return

      const suffix = line.colour_variant?.suffix || ''
      const key    = `${line.component_id}__${suffix}`
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          component:      line.component,
          colour_variant: line.colour_variant || null,
          barLengthMm:    Number(line.component?.bar_length_mm) || 0,
          cuts:           [],
        })
      }
      groups.get(key).cuts.push({
        mm: line.component?.unit === 'metres' ? Math.round(qty * 1000) : Math.round(qty),
        label: win.label || `Window ${i + 1}`,
      })
    })
  })

  return [...groups.values()]
    .map(g => {
      // Planned against the real rack when stock was handed in. Given no
      // stock it plans against full bars alone, which is what this sheet did
      // before offcuts were part of the arrangement — so a caller that has no
      // stock to offer still gets a correct, if more wasteful, chart.
      const suffix = g.colour_variant?.suffix || null
      const plan = planBarCuts({
        cuts:        g.cuts,
        barLengthMm: g.barLengthMm,
        offcuts:     stockBars.filter(b =>
          b.component_id === g.component?.id &&
          b.status === 'available' &&
          (b.colour_variant?.suffix || null) === suffix),
        fullBarsOnHand: Number(
          getStock(stockMap, g.component, g.colour_variant)?.qty_on_hand
          ?? stockMap[stockKey(g.component?.id, g.colour_variant)]?.qty_on_hand) || 0,
      })

      // Waste is measured against the FULL BARS opened, not against every
      // piece touched: an offcut pulled off the rack was already waste, and
      // counting it again would make the plan that reuses it look worse than
      // the one that leaves it there.
      const barMm = plan.fullBarsUsed * (g.barLengthMm || 0)
      const barRemnantMm = plan.sources
        .filter(s => s.kind === 'bar')
        .reduce((s, src) => s + Math.max(0, src.remainderMm), 0)

      return {
        ...g,
        plan,
        summary: {
          cutCount:    g.cuts.length,
          barCount:    plan.fullBarsUsed,
          offcutsUsed: plan.offcutsUsed,
          totalCutMm:  plan.totalCutMm,
          offcutMm:    barRemnantMm,
          wastePct:    barMm > 0 ? (barRemnantMm / barMm) * 100 : 0,
          oversized:   plan.oversized.length > 0,
        },
      }
    })
    .sort((a, b) => String(a.component?.name || '').localeCompare(String(b.component?.name || '')))
}

/**
 * One row per bar the job needs — what to pull off the rack, or put on an
 * order. The track answer to the blind sheet's fabric summary.
 */
export function trackSummary(windowsWithBOM = [], suppliers = [], stock = {}) {
  const groups = trackCutGroups(windowsWithBOM, stock)

  const rows = groups.map(g => ({
    track: `${g.component?.name || DASH}${g.colour_variant?.name ? ` · ${g.colour_variant.name}` : ''}`,
    company: suppliers.find(s => s.id === g.component?.supplier_id)?.name || DASH,
    bars: g.barLengthMm > 0
      ? `${g.summary.barCount} × ${g.barLengthMm.toLocaleString()}mm`
        + (g.summary.offcutsUsed ? ` + ${g.summary.offcutsUsed} offcut${g.summary.offcutsUsed !== 1 ? 's' : ''}` : '')
      : 'no bar length set',
    cut:    `${(g.summary.totalCutMm / 1000).toFixed(2)} m`,
    offcut: g.barLengthMm > 0
      ? `${(g.summary.offcutMm / 1000).toFixed(2)} m · ${g.summary.wastePct.toFixed(0)}%`
      : DASH,
    barCount:   g.summary.barCount,
    totalCutMm: g.summary.totalCutMm,
  }))

  return {
    rows,
    barCount:   rows.reduce((s, r) => s + r.barCount, 0),
    totalCutM:  rows.reduce((s, r) => s + r.totalCutMm, 0) / 1000,
  }
}

export const TRACK_SUMMARY_COLS = [
  { key: 'track',   title: 'Track',           w: 76 },
  { key: 'company', title: 'Company',         w: 44 },
  { key: 'bars',    title: 'Bars required',   w: 40, align: 'right' },
  { key: 'cut',     title: 'Total cut',       w: 30, align: 'right' },
  { key: 'offcut',  title: 'Offcut',          w: 36, align: 'right' },
]

/* ==========================================================================
 * Rendering
 * ========================================================================== */

const SPEC_H = 5.6

/**
 * The bar charts, drawn on their own pages.
 *
 * Extracted so the BLIND sheet can print them too. A blind has bar parts —
 * its tube and its base rail — cut off exactly the same rack as a track, so
 * the sheet that goes to the saw needs the same arrangement on it. Leaving
 * the charts on the track sheet alone meant the person cutting tubes had the
 * plan on screen and nothing on paper.
 *
 * Returns where it finished, so the caller can carry on down the page.
 */
export function drawBarCutCharts(doc, { groups = [], drawHeader, pageNum = 1, title = 'Cut Charts' }) {
  const MX = 12
  const MB = 196
  const CHART_W  = 200                  // mm of paper one full bar maps to
  const CHART_X  = MX + 4
  const BAR_H    = 13
  const LEGEND_X = CHART_X + CHART_W + 8

  const setColor = rgb => doc.setTextColor(...rgb)
  const setFill  = rgb => doc.setFillColor(...rgb)
  const fit      = (text, maxW) => clip(doc, text, maxW)

  let y = 0
  const newPage = () => { doc.addPage(); pageNum++; y = drawHeader(title, pageNum) }


  newPage()

  y = footnote(doc,
    'Each bar is drawn to scale along its length. This is the cutting plan the stock deduction confirms, so what you see '
    + 'here is what will leave the rack — cut them in this order. A row marked OFFCUT is a piece already on the rack, not a new bar. '
    + 'The shaded end of a row is what is left over; record it against the job once it is off the saw.',
    CHART_X, y, CHART_W + 60) + 4

  groups.forEach((g, gi) => {
    const { barLengthMm, plan, summary } = g
    const scaleX = barLengthMm > 0 ? CHART_W / barLengthMm : 0

    // Group heading — keep it with at least one bar, never orphaned.
    if (y + 16 + BAR_H > MB) newPage()
    if (gi > 0) y += 4

    const name = `${g.component?.name || DASH}${g.colour_variant?.name ? ` · ${g.colour_variant.name}` : ''}`
    setFill(ACCENT_DARK)
    doc.rect(CHART_X, y, CHART_W + 60, 8, 'F')
    setColor(WHITE); doc.setFontSize(9); doc.setFont('helvetica', 'bold')
    doc.text(fit(name, 110), CHART_X + 3, y + 5.5)
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal')
    doc.text(
      barLengthMm > 0
        ? [
            `${barLengthMm.toLocaleString()}mm bars`,
            `${summary.cutCount} cut${summary.cutCount !== 1 ? 's' : ''}`,
            `${summary.barCount} bar${summary.barCount !== 1 ? 's' : ''}`
              + (summary.offcutsUsed ? ` + ${summary.offcutsUsed} offcut${summary.offcutsUsed !== 1 ? 's' : ''}` : ''),
            `${(summary.totalCutMm / 1000).toFixed(2)}m cut`,
            `${summary.wastePct.toFixed(0)}% offcut`,
          ].join('   ·   ')
        : 'no bar length recorded — cannot be packed',
      CHART_X + CHART_W + 57, y + 5.5, { align: 'right' })
    y += 11

    if (barLengthMm <= 0) {
      // Nothing to draw, but the cuts still have to be readable — this is a
      // data gap on the component, not a reason to hide the work.
      setColor(WARM_300); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal')
      doc.text(
        fit(`Cuts: ${g.cuts.map(c => `${c.label} ${c.mm.toLocaleString()}mm`).join('   ·   ')}`, CHART_W + 50),
        CHART_X, y + 3)
      y += 9
      return
    }

    let barNo = 0
    plan.sources.forEach((src) => {
      if (y + BAR_H + 3 > MB) newPage()
      const isOffcut = src.kind === 'offcut'
      if (!isOffcut) barNo++

      // Every row is drawn against the FULL BAR width, so a short offcut
      // reads as short. Scaling each row to its own length would draw a
      // 1,200mm offcut the same size as a 6,000mm bar and make a plan that
      // reuses scrap look like one that opens bars.
      setFill(WARM_100)
      doc.rect(CHART_X, y, CHART_W, BAR_H, 'F')
      // The part of the row that does not physically exist on an offcut.
      if (isOffcut && src.capacityMm < barLengthMm) {
        const ux = CHART_X + src.capacityMm * scaleX
        setFill(WHITE)
        doc.rect(ux, y, CHART_W - src.capacityMm * scaleX, BAR_H, 'F')
      }

      let offsetMm = 0
      src.cuts.forEach(cut => {
        const px = CHART_X + offsetMm * scaleX
        const pw = cut.mm * scaleX

        setFill(GREEN_BG)
        doc.rect(px, y, pw, BAR_H, 'F')
        doc.setDrawColor(...ACCENT_DARK); doc.setLineWidth(0.35)
        doc.rect(px, y, pw, BAR_H, 'S')

        setColor(ACCENT_DARK)
        if (pw >= 24) {
          doc.setFontSize(8); doc.setFont('helvetica', 'bold')
          doc.text(fit(cut.label || DASH, pw - 3), px + 1.8, y + BAR_H / 2 - 0.4)
          doc.setFontSize(6.8); doc.setFont('helvetica', 'normal')
          doc.text(fit(`${cut.mm.toLocaleString()}mm`, pw - 3), px + 1.8, y + BAR_H / 2 + 3.6)
        } else if (pw >= 5) {
          // Too narrow to read across — stand the label up rather than clip
          // it away to nothing.
          doc.setFontSize(6.2); doc.setFont('helvetica', 'bold')
          doc.text(fit(`${cut.label || DASH} ${cut.mm}`, BAR_H - 2),
            px + pw / 2 + 2, y + BAR_H - 1, { angle: 90 })
        }
        offsetMm += cut.mm
      })

      // What's left on the end of the bar — the piece worth putting back on
      // the rack rather than in the bin.
      if (src.remainderMm > 0) {
        const ox = CHART_X + offsetMm * scaleX
        const ow = src.remainderMm * scaleX
        setFill([248, 250, 245])
        doc.rect(ox, y, ow, BAR_H, 'F')
        doc.setDrawColor(...WARM_300); doc.setLineWidth(0.25)
        doc.setLineDashPattern([1, 1], 0)
        doc.rect(ox, y, ow, BAR_H, 'S')
        doc.setLineDashPattern([], 0)
        if (ow >= 22) {
          setColor(WARM_300); doc.setFontSize(6.8); doc.setFont('helvetica', 'normal')
          doc.text(fit(`left over ${Math.round(src.remainderMm).toLocaleString()}mm`, ow - 3),
            ox + 1.8, y + BAR_H / 2 + 1.2)
        }
      }

      setColor(INK); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
      doc.text(isOffcut ? `OFFCUT ${src.label}` : `Bar ${barNo}`, LEGEND_X, y + BAR_H / 2 - 0.6)
      setColor(WARM_300); doc.setFontSize(7); doc.setFont('helvetica', 'normal')
      doc.text(
        `${isOffcut ? `${Math.round(src.capacityMm).toLocaleString()}mm · ` : ''}`
        + `${src.cuts.length} cut${src.cuts.length !== 1 ? 's' : ''} · ${Math.round(src.remainderMm).toLocaleString()}mm left`,
        LEGEND_X, y + BAR_H / 2 + 3.4)

      y += BAR_H + 2.5
    })

    if (plan.oversized.length > 0) {
      if (y + 8 > MB) newPage()
      setFill(DANGER_BG)
      doc.rect(CHART_X, y, CHART_W + 60, 7, 'F')
      setColor(DANGER); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
      doc.text(fit(
        `NOT IN THE PLAN — longer than a ${barLengthMm.toLocaleString()}mm bar: `
        + plan.oversized.map(c => `${c.label || DASH} ${c.mm.toLocaleString()}mm`).join('   ·   '),
        CHART_W + 54), CHART_X + 3, y + 4.8)
      y += 9
    }

    y += 3
  })

  y = footnote(doc,
    'Lengths are to scale along the bar. Cuts are shown in packing order, not the order they are listed above — '
    + 'always cut to the figures, not the drawing, and allow for your own blade width between cuts.',
    CHART_X, y + 2, CHART_W + 50) + 6

  return { y, pageNum, CHART_X, CHART_W }
}

/**
 * Draw the track cut sheet into an existing landscape document.
 *
 * Takes the document rather than making one so the same sheet can be a
 * standalone print and a section of the job pack without being written twice.
 * `drawHeader(title, pageNum)` and the page number come from the caller, so
 * numbering runs continuously through a document with other sections in it.
 *
 * Returns the page number it finished on.
 */
export function drawTrackCutSheet(doc, {
  windowsWithBOM = [], optionDefsFor = () => [], suppliers = [], kinds = [],
  drawHeader, pageNum = 1, startOnNewPage = false, stock = {},
}) {
  const MX = 12, MXR = 285, CW = MXR - MX
  const MB = 196            // start a new page before this
  let y = 0

  const setColor = rgb => doc.setTextColor(...rgb)
  const setFill  = rgb => doc.setFillColor(...rgb)
  const fit      = (text, maxW) => clip(doc, text, maxW)

  const newPage = (title = 'Cut Sheet · Tracks') => {
    doc.addPage(); pageNum++
    y = drawHeader(title, pageNum)
  }

  if (startOnNewPage) { doc.addPage(); pageNum++ }
  y = drawHeader('Cut Sheet · Tracks', pageNum)

  /* ---------------------------------------------------------------- table --
   * Column widths are computed rather than fixed, because the number of count
   * columns is whatever the Kinds admin says it is. The four figures that get
   * acted on keep constant width; the track name absorbs whatever is left, so
   * a job with one count column gets a readable part name instead of a third
   * of a page of white space.
   * ---------------------------------------------------------------------- */
  const countKinds = trackCountKinds(windowsWithBOM, kinds)
  // The window name is a room, and rooms have names like "Rumpus A Wall to
  // Wall". It gets the width; the track name is a short profile code and
  // takes what is left.
  const W_WINDOW = 44, W_ORDERED = 24, W_CUT = 26, W_OPENING = 34
  const fixedW   = W_WINDOW + W_ORDERED + W_CUT + W_OPENING
  const countW   = countKinds.length > 0
    ? Math.min(62, (CW - fixedW - 44) / countKinds.length)
    : 0
  const trackW   = CW - fixedW - countW * countKinds.length

  const COLS = [
    { key: 'window',    title: 'Window',      w: W_WINDOW },
    { key: 'track',     title: 'Track',       w: trackW },
    { key: 'orderedW',  title: 'Ordered W',   w: W_ORDERED, align: 'right' },
    { key: 'cutLength', title: 'Cut length',  w: W_CUT,     align: 'right' },
    ...countKinds.map(kind => ({ key: `count:${kind}`, title: kind, w: countW, count: kind })),
    { key: 'opening',   title: 'Opening',     w: W_OPENING },
  ]
  let runningX = MX
  COLS.forEach(c => { c.x = runningX; runningX += c.w })

  const drawTableHeader = () => {
    setFill(ACCENT_DARK)
    doc.rect(MX, y, CW, 7, 'F')
    setColor(WHITE)
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
    COLS.forEach(c => {
      const tx = c.align === 'right' ? c.x + c.w - 2 : c.x + 2
      doc.text(fit(c.title, c.w - 4), tx, y + 4.8, { align: c.align || 'left' })
    })
    y += 7
  }

  drawTableHeader()

  const rows = windowsWithBOM.map(win =>
    trackSheetRow(win, optionDefsFor(win.product_id), kinds, countKinds))

  rows.forEach((r, i) => {
    // A count cell is as tall as the parts in it — two lines each, the part
    // and the figure it was read off. The row takes the tallest.
    const maxEntries = Math.max(1, ...r.counts.map(c => Math.max(1, c.entries.length)))
    const ROW_H  = Math.max(9, 3 + maxEntries * 7)
    const specH  = r.specs.length > 0 ? SPEC_H : 0

    // Break before the row, counting its spec line — a spec stranded at the
    // top of the next page belongs to a window nobody can see.
    if (y + ROW_H + specH > MB) { newPage(); drawTableHeader() }

    setFill(i % 2 === 0 ? WARM_100 : WHITE)
    doc.rect(MX, y, CW, ROW_H + specH, 'F')

    COLS.forEach(c => {
      const tx = c.align === 'right' ? c.x + c.w - 2 : c.x + 2

      if (c.count) {
        const entries = r.counts.find(x => x.kind === c.count)?.entries || []
        if (entries.length === 0) {
          setColor(WARM_300); doc.setFontSize(8); doc.setFont('helvetica', 'normal')
          doc.text(DASH, tx, y + 6)
          return
        }
        entries.forEach((e, n) => {
          const ey = y + 5 + n * 7
          // The part carries the weight — it is what gets picked off the rack;
          // the figure under it is the check, not the instruction.
          setColor(INK); doc.setFontSize(7.2); doc.setFont('helvetica', 'bold')
          doc.text(fit(e.name, c.w - 4), tx, ey)
          setColor(WARM_300); doc.setFontSize(7); doc.setFont('helvetica', 'normal')
          doc.text(
            fit(e.formula ? `${e.formula} = ${e.qty}` : String(e.qty), c.w - 4),
            tx, ey + 3.4)
        })
        return
      }

      // What gets acted on carries the weight — the window, the cut length and
      // the side it stacks to; the rest is supporting.
      const strong = c.key === 'window' || c.key === 'cutLength' || c.key === 'opening'
      setColor(c.key === 'orderedW' ? WARM_300 : INK)
      doc.setFontSize(strong ? 9 : 8)
      doc.setFont('helvetica', strong ? 'bold' : 'normal')
      doc.text(fit(r[c.key], c.w - 4), tx, y + 6.2, { align: c.align || 'left' })
    })

    // The spec line, indented under the track name it belongs to. A part that
    // moved off the recipe is bold and carries its role in full; the rest stay
    // light, so the eye lands on the exceptions without having to read the
    // line to find them.
    if (specH) {
      let x = COLS[1].x + 2
      doc.setFontSize(7)
      r.specs.forEach((spec, n) => {
        if (n > 0) {
          setColor(WARM_300); doc.setFont('helvetica', 'normal')
          doc.text('·', x, y + ROW_H + 3.6)
          x += 3
        }
        const text = `${spec.role}: ${spec.value}`
        doc.setFont('helvetica', spec.changed ? 'bold' : 'normal')
        setColor(spec.changed ? INK : WARM_300)
        doc.text(text, x, y + ROW_H + 3.6)
        x += doc.getTextWidth(text) + 2
      })
      if (r.specs.some(sp => sp.changed)) {
        setColor(WARM_300); doc.setFont('helvetica', 'normal')
        doc.text('(bold = not the standard part)', x + 2, y + ROW_H + 3.6)
      }
    }

    // Hairline between rows, so a finger tracking across a wide row stays put.
    doc.setDrawColor(...WARM_200); doc.setLineWidth(0.1)
    doc.line(MX, y + ROW_H + specH, MXR, y + ROW_H + specH)

    y += ROW_H + specH
  })

  y = footnote(doc,
    'Cut length is final — the recipe\'s deduction is already applied. Opening is as ordered, with the direction '
    + 'on a one-way track; a dash means the option was never answered, not that it has no answer.',
    MX, y + 5, CW)

  /* ----------------------------------------------------------- bar charts --
   * One bar per row, drawn to scale along its length, because along-the-bar is
   * the only axis a track has and it is exactly the axis that decides how many
   * bars come off the rack.
   * ---------------------------------------------------------------------- */
  const groups = trackCutGroups(windowsWithBOM, stock)

  if (groups.length > 0) {
    const charts = drawBarCutCharts(doc, { groups, drawHeader, pageNum, title: 'Track Cut Charts' })
    y = charts.y; pageNum = charts.pageNum
    const CHART_X = charts.CHART_X, CHART_W = charts.CHART_W

    /* ------------------------------------------------------------ summary --
     * The charts say how to cut; this says what to pull off the rack or put on
     * an order. The track counterpart of the blind sheet's fabric summary.
     * -------------------------------------------------------------------- */
    const SUM = TRACK_SUMMARY_COLS.map((c, i) => ({
      ...c,
      x: CHART_X + TRACK_SUMMARY_COLS.slice(0, i).reduce((s, p) => s + p.w, 0),
    }))
    const SUM_W = TRACK_SUMMARY_COLS.reduce((s, c) => s + c.w, 0)
    const SUM_ROW_H = 8

    const { rows: sumRows, barCount, totalCutM } = trackSummary(windowsWithBOM, suppliers, stock)

    const drawSumHeader = () => {
      setFill(ACCENT_DARK)
      doc.rect(CHART_X, y, SUM_W, 7, 'F')
      setColor(WHITE); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
      SUM.forEach(c => {
        const tx = c.align === 'right' ? c.x + c.w - 2 : c.x + 2
        doc.text(c.title, tx, y + 4.8, { align: c.align || 'left' })
      })
      y += 7
    }

    // Keep the title with at least its header and first row rather than
    // stranding it at the foot of a page.
    if (y + 6 + 7 + SUM_ROW_H > MB) newPage('Track Cut Charts')

    setColor(INK); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
    doc.text('Track Summary', CHART_X, y)
    y += 4
    drawSumHeader()

    sumRows.forEach((r, i) => {
      if (y + SUM_ROW_H > MB) { newPage('Track Cut Charts'); drawSumHeader() }
      setFill(i % 2 === 0 ? WARM_100 : WHITE)
      doc.rect(CHART_X, y, SUM_W, SUM_ROW_H, 'F')
      SUM.forEach(c => {
        const strong = c.key === 'bars'
        setColor(c.key === 'offcut' ? WARM_300 : INK)
        doc.setFontSize(strong ? 9 : 8)
        doc.setFont('helvetica', strong ? 'bold' : 'normal')
        const tx = c.align === 'right' ? c.x + c.w - 2 : c.x + 2
        doc.text(fit(r[c.key], c.w - 4), tx, y + SUM_ROW_H / 2 + 1.4, { align: c.align || 'left' })
      })
      doc.setDrawColor(...WARM_200); doc.setLineWidth(0.1)
      doc.line(CHART_X, y + SUM_ROW_H, CHART_X + SUM_W, y + SUM_ROW_H)
      y += SUM_ROW_H
    })

    // The two numbers that go onto an order.
    if (y + SUM_ROW_H + 8 > MB) newPage('Track Cut Charts')
    setFill(WARM_200)
    doc.rect(CHART_X, y, SUM_W, SUM_ROW_H, 'F')
    setColor(INK); doc.setFontSize(8); doc.setFont('helvetica', 'bold')
    doc.text(`${barCount} bar${barCount !== 1 ? 's' : ''} across ${sumRows.length} profile${sumRows.length !== 1 ? 's' : ''}`,
      CHART_X + 2, y + SUM_ROW_H / 2 + 1.4)
    doc.setFontSize(9)
    doc.text(`${totalCutM.toFixed(2)} m`, SUM[3].x + SUM[3].w - 2, y + SUM_ROW_H / 2 + 1.4, { align: 'right' })
    y += SUM_ROW_H + 4

    footnote(doc,
      'Bars required is whole bars off the rack, offcut included — order this, not the total cut. '
      + 'Offcut is what is left on the end of those bars, which goes back into stock rather than into the job.',
      CHART_X, y, SUM_W)
  }

  return pageNum
}
