/**
 * romanBlind
 *
 * The arithmetic behind a roman blind: how big a piece of fabric to cut, and
 * where to mark it so the dowel pockets land in the right places.
 *
 * ---------------------------------------------------------------------------
 * The blind, top to bottom
 *
 *   HEADBOARD FOLD        fabric folded over the top of the headboard and fixed
 *                         down. Above the drop, so not part of it.
 *   HEADBOARD FACE        fabric covering the front face of the headboard. The
 *                         drop is measured from the top of the headboard, so
 *                         the face IS part of the drop.
 *   FIRST PANEL           a main panel plus the top panel allowance, so the
 *                         stack clears the mechanisms under the headboard.
 *   MAIN PANELS  × n      all the same drop, d. "Main panels" never includes
 *                         the first panel or the bottom panel.
 *   BOTTOM PANEL          half a main panel plus the bottom panel allowance.
 *   BOTTOM HEM            turned up below the finished bottom edge.
 *
 * with a dowel pocket at every join: first|main, main|main, main|bottom — so
 * n + 1 pockets and n + 1 dowels.
 *
 * Why the bottom panel is half a main panel: a raised blind folds at the half
 * of every main panel, so each fold hangs d / 2 deep. A bottom panel of d / 2
 * sits level with that stack; the allowance on top of it keeps the hem clear of
 * the lowest fold.
 *
 * ---------------------------------------------------------------------------
 * Solving it
 *
 * The finished drop runs from the top of the headboard to the hemmed bottom
 * edge: the headboard face, the first panel, the main panels and the bottom
 * panel. The headboard fold, the pockets and the hem are all extra fabric on
 * top of it:
 *
 *   drop = face + (d + topExtra) + n·d + (d/2 + bottomExtra)
 *
 * so for any n,
 *
 *   d = (drop − face − topExtra − bottomExtra) / (n + 1.5)
 *
 * Leaving the face out of that — measuring as though the drop started under
 * the headboard — makes every panel long by a share of the face, and the whole
 * blind long by the full face depth.
 *
 * n is tried from the minimum upward, and the n whose d sits closest to the
 * middle of the allowable range wins. The others that fit are still offered,
 * and when none fits the nearest are offered instead — a blind that can't be
 * split evenly inside the range is a decision for a person, not a default.
 *
 * And the cut:
 *
 *   cut width = finished width + 2 × side allowance
 *   cut drop  = headboard fold + drop + (n + 1) × pocket + hem
 *
 * (the face is already inside the drop.)
 *
 * ---------------------------------------------------------------------------
 * The pockets are tucks, so the marks are not the panel positions
 *
 * Each pocket is three lines on the flat fabric — top, fold, bottom — a pocket
 * width apart top to bottom. Fold on the middle line, bring the top and bottom
 * lines together, stitch. That uses the whole pocket width of fabric, and it
 * uses it ahead of everything below, so every pocket pushes all the later marks
 * one pocket further down the cloth. The panels between pockets are the
 * finished panels; the pockets are in addition.
 *
 * ---------------------------------------------------------------------------
 * Units
 *
 * Millimetres inside, like every other cut dimension in the app; the page and
 * the sheet show centimetres to one decimal, which is the same millimetre.
 *
 * Rounding: the main panel is rounded to the millimetre ONCE, and every main
 * panel is made exactly that. They must be identical — they fold onto each
 * other, and one that is a millimetre short shows in the stack. (Rounding each
 * mark from its exact position instead keeps every mark within half a
 * millimetre, but lets neighbouring panels differ by one: 354, 354, 353, 354.)
 * The bottom panel is then half that main panel plus its allowance, rounded;
 * and the first panel takes whatever is left so the drop still adds up to the
 * millimetre. That leftover is at most a few millimetres, and the first panel
 * is the one place it is invisible — its whole top panel allowance is there to
 * clear the mechanisms under the headboard.
 */

/* --------------------------------------------------------------------------
 * Dowel types
 *
 * The type picks which pocket width applies. Both widths are assumptions — a
 * change of dowel supplier is an edit, not a code change.
 * ------------------------------------------------------------------------ */
export const DOWEL_TYPES = [
  { code: 'timber',    label: 'Timber dowel',  pocketKey: 'timberPocketMm' },
  { code: 'aluminium', label: 'Aluminium rod', pocketKey: 'aluminiumPocketMm' },
]

export const dowelType = (code) =>
  DOWEL_TYPES.find(d => d.code === code) || DOWEL_TYPES[0]

/* --------------------------------------------------------------------------
 * Assumptions — the workroom's standing numbers, all editable on the page.
 * Millimetres, except minMainPanels, which is a count.
 * ------------------------------------------------------------------------ */
export const DEFAULT_ASSUMPTIONS = {
  headboardFaceMm:    80,
  headboardFoldMm:    20,
  topPanelExtraMm:    100,
  bottomPanelExtraMm: 20,
  hemMm:              45,
  sideAllowanceMm:    40,
  timberPocketMm:     32,
  aluminiumPocketMm:  14,
  panelMinMm:         300,
  panelMaxMm:         400,
  minMainPanels:      2,
  dowelDeductionMm:   20,
}

/* A blind needing more main panels than this is a data-entry error — a drop
 * typed in millimetres into a centimetre box, most likely — not a blind. */
const MAX_MAIN_PANELS = 40

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

/* --------------------------------------------------------------------------
 * Solving the panels
 * ------------------------------------------------------------------------ */

/** The exact main panel drop for n main panels. May be outside the range. */
const panelFor = (dropMm, n, a) =>
  (dropMm - a.headboardFaceMm - a.topPanelExtraMm - a.bottomPanelExtraMm) / (n + 1.5)

/**
 * Every main panel count from the minimum up, with the main panel drop it would
 * give and whether that drop is inside the range.
 */
export function panelOptions(dropMm, a) {
  const all = []
  for (let n = Math.max(1, a.minMainPanels); n <= MAX_MAIN_PANELS; n++) {
    const panelMm = panelFor(dropMm, n, a)
    if (!(panelMm > 0)) break
    all.push({ mainPanels: n, panelMm, inRange: panelMm >= a.panelMinMm && panelMm <= a.panelMaxMm })
  }
  return all
}

/** How far a panel drop is outside the range; 0 when it is inside. */
const distanceFromRange = (panelMm, a) =>
  panelMm < a.panelMinMm ? a.panelMinMm - panelMm
    : panelMm > a.panelMaxMm ? panelMm - a.panelMaxMm
    : 0

/** The in-range count closest to the middle of the range, or null. */
function chooseMainPanels(options, a) {
  const valid = options.filter(o => o.inRange)
  if (!valid.length) return null
  const middle = (a.panelMinMm + a.panelMaxMm) / 2
  return valid.reduce((best, o) =>
    Math.abs(o.panelMm - middle) < Math.abs(best.panelMm - middle) ? o : best
  )
}

/**
 * When nothing fits the range, the counts that come closest to it — the answer
 * to offer instead of a dead end. Two, in order of main panel count: past the
 * second, the panels are so far out of range that offering them is noise.
 */
export function nearestOptions(options, a, count = 2) {
  return [...options]
    .sort((x, y) => distanceFromRange(x.panelMm, a) - distanceFromRange(y.panelMm, a))
    .slice(0, count)
    .sort((x, y) => x.mainPanels - y.mainPanels)
}

/* --------------------------------------------------------------------------
 * The calculation
 * ------------------------------------------------------------------------ */

/**
 * Work out a roman blind.
 *
 *   input  { widthMm, dropMm, dowelType, mainPanels }
 *          mainPanels optional — forces the count instead of solving for it.
 *   a      assumptions, defaulted from DEFAULT_ASSUMPTIONS.
 *
 * Always returns an object. `ok: false` carries `errors`, plus `options` when
 * the only problem is that nothing fits the range.
 */
export function calcRomanBlind(input = {}, assumptions = {}) {
  const a = { ...DEFAULT_ASSUMPTIONS, ...assumptions }

  const widthMm = num(input.widthMm)
  const dropMm  = num(input.dropMm)
  const type    = dowelType(input.dowelType)
  const pocketMm = a[type.pocketKey]

  const errors = []
  if (!(widthMm > 0)) errors.push('Enter the finished width.')
  if (!(dropMm  > 0)) errors.push('Enter the finished drop.')
  if (!(a.panelMinMm > 0)) errors.push('The smallest main panel drop must be more than zero.')
  else if (a.panelMinMm > a.panelMaxMm) {
    errors.push('The main panel range is back to front — the smallest is larger than the largest.')
  }
  if (!(a.minMainPanels >= 1)) errors.push('The minimum number of main panels must be at least 1.')
  if (!(pocketMm >= 0)) errors.push(`Enter a ${type.label.toLowerCase()} pocket width.`)
  if (!(a.headboardFaceMm >= 0) || !(a.headboardFoldMm >= 0)) errors.push('Enter the headboard face and fold allowances.')
  if (errors.length) return { ok: false, errors, assumptions: a }

  const options = panelOptions(dropMm, a)
  const forced  = input.mainPanels
    ? options.find(o => o.mainPanels === Number(input.mainPanels))
    : null
  const chosen  = forced || chooseMainPanels(options, a)

  if (!chosen) {
    return {
      ok: false,
      assumptions: a,
      errors: [
        options.length
          ? `No number of main panels gives a main panel drop between ${cm(a.panelMinMm)} and ${cm(a.panelMaxMm)}cm on a ${cm(dropMm)}cm drop. Pick the nearest instead:`
          : `A ${cm(dropMm)}cm drop is too short for the headboard face, first and bottom panels alone.`,
      ],
      options: nearestOptions(options, a),
    }
  }

  const n       = chosen.mainPanels
  const d       = chosen.panelMm
  const pockets = []

  /* Down the flat fabric from the top cut edge: the fold over the top of the
   * headboard, then its face, then the hanging blind. H is where the hanging
   * blind starts — the underside of the headboard. */
  const headboardTopMm = a.headboardFoldMm
  const H              = a.headboardFoldMm + a.headboardFaceMm

  /* The panels as they will be made, in whole millimetres. Every main panel is
   * the same; the first panel takes the rounding (see Units, above). */
  const mainMm        = Math.round(d)
  const bottomPanelMm = Math.round(mainMm / 2 + a.bottomPanelExtraMm)
  const firstPanelMm  = dropMm - a.headboardFaceMm - n * mainMm - bottomPanelMm

  /* Pocket i (1 … n+1) sits after the headboard, the first panel, and i−1 main
   * panels each followed by a pocket. Walked in whole millimetres, so the gap
   * between any two pockets is exactly one main panel; the fold and bottom
   * lines are a fixed distance below each top so every pocket is exactly its
   * own width. */
  let topMm = H + firstPanelMm
  for (let i = 1; i <= n + 1; i++) {
    pockets.push({
      n:            i,
      topMm,
      foldMm:       Math.round(topMm + pocketMm / 2),
      bottomMm:     topMm + pocketMm,
      panelAboveMm: i === 1 ? firstPanelMm : mainMm,
      panelAboveLabel: i === 1 ? 'First panel' : `Main panel ${i - 1}`,
    })
    topMm += pocketMm + mainMm
  }

  // The drop starts at the top of the headboard, so the face is already in it.
  const hemLineMm  = headboardTopMm + dropMm + (n + 1) * pocketMm
  const cutDropMm  = hemLineMm + a.hemMm
  const cutWidthMm = widthMm + 2 * a.sideAllowanceMm

  /* Where each main panel folds when the blind is raised — its half. Not
   * marked on the fabric, the fold forms itself, but drawn on the diagram so
   * the stack can be pictured. */
  const folds = []
  for (let i = 0; i < n; i++) {
    folds.push({ afterPocket: i + 1, atMm: Math.round((pockets[i].bottomMm + pockets[i + 1].topMm) / 2) })
  }

  const warnings = []
  if (!chosen.inRange) {
    warnings.push(`${n} main panels puts the main panel drop at ${cm(d)}cm, outside the ${cm(a.panelMinMm)}–${cm(a.panelMaxMm)}cm range.`)
  }

  return {
    ok: true,
    assumptions: a,
    widthMm,
    dropMm,
    dowelType: type.code,
    dowelLabel: type.label,
    pocketMm,

    /* What to cut */
    cutWidthMm,
    cutDropMm,

    /* The panels */
    mainPanels:    n,
    panelMm:       mainMm,          // every main panel, as made
    panelExactMm:  d,               // before rounding, for reference
    firstPanelMm,
    bottomPanelMm,
    dowels:        n + 1,
    dowelLengthMm: widthMm - a.dowelDeductionMm,

    /* The marks, from the top cut edge */
    headboardTopMm,             // top of the headboard: where the drop starts
    headboardLineMm: H,         // underside of the headboard: where the panels start
    pockets,
    hemLineMm,
    folds,

    /* The bands down the flat fabric, for the two drawings. Worked out here so
     * the screen and the printed sheet draw one picture, not two. */
    bands: [
      { kind: 'headboardFold', label: 'Headboard fold', fromMm: 0, toMm: headboardTopMm },
      { kind: 'headboardFace', label: 'Headboard face', fromMm: headboardTopMm, toMm: H },
      ...pockets.map(p => ({ kind: 'pocket', label: `Pocket ${p.n}`, fromMm: p.topMm, toMm: p.bottomMm })),
      { kind: 'hem', label: 'Hem', fromMm: hemLineMm, toMm: cutDropMm },
    ],

    /* The counts to offer instead */
    options: options.filter(o => o.inRange || o.mainPanels === n),
    forced:  !!forced,

    warnings,
    errors: [],
  }
}

/* --------------------------------------------------------------------------
 * Formatting — shared so the screen and the sheet print a figure the same way.
 * ------------------------------------------------------------------------ */

/** Millimetres as centimetres to one decimal: 1234 -> "123.4". */
export function cm(v) {
  const n = Number(v)
  return Number.isFinite(n) ? (Math.round(n) / 10).toFixed(1) : '—'
}

/** Centimetres as typed ("3.2") to whole millimetres (32). NaN if not a number. */
export function cmToMm(v) {
  if (v === '' || v === null || v === undefined) return NaN
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 10) : NaN
}
