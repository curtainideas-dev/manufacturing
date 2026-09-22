/**
 * importPriceList
 *
 * Reads a wholesaler's price-list workbook and pulls out the sell grids.
 *
 * Written against the Inline Blinds list, which is the one we actually buy
 * from, but deliberately not hard-coded to its cell references. That workbook
 * has 41 tabs, several of them near-duplicates of each other, and the prices
 * do not start in the same row on every one — sheet 35 begins three rows lower
 * than the rest. Reading fixed addresses would work until the day they nudge a
 * heading, which is exactly the day nobody would notice the prices were wrong.
 *
 * So each tab is read structurally: find the row whose first cell says "Drop"
 * and whose remaining cells are ascending numbers — that row IS the width
 * header — then take every row under it that starts with a number as a drop
 * band. The grid ends at the first row that isn't one, which is how the
 * footnotes ("For blinds larger than 3000mm...") and the Options blocks
 * beneath every grid get left behind.
 *
 * WHICH TABS. Roller blind grids are named RollerBlindsCat<X>, and most exist
 * twice — "RollerBlindsCatA" and "RollerBlindsCatA (2)". They are not
 * duplicates: the plain one is the 2015 list and the "(2)" is 2026, and the
 * difference is around 7%. The importer reads the YEAR out of each sheet's
 * own title row and keeps the newest, rather than trusting the naming, since
 * "(2)" meaning "newer" is a habit and not a rule.
 *
 * Uses SheetJS loaded from CDN at runtime — no build-time dependency, matching
 * the jsPDF/pdf.js/xlsx pattern used elsewhere (cdnjs, not jsdelivr).
 */

const loadXLSX = () => new Promise((resolve, reject) => {
  if (window.XLSX) return resolve(window.XLSX)
  const s = document.createElement('script')
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
  s.onload = () => resolve(window.XLSX)
  s.onerror = reject
  document.head.appendChild(s)
})

const num = (v) => {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return null
  const cleaned = v.replace(/[$,\s]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  return Number(cleaned)
}

const text = (v) => (v === null || v === undefined) ? '' : String(v).trim()

/* --------------------------------------------------------------------------
 * Which sheets are grids, and which category each belongs to
 * ------------------------------------------------------------------------ */

/**
 * The category code a sheet name announces.
 *
 * Sunscreen grids are named SSRollerBlindsCatG..J, and the sunscreen FABRIC
 * list calls those same tiers Budget/A/B/C — the two halves of the list don't
 * use the same names for the same thing. The letters on the price sheets win,
 * because that is what the grids are actually keyed by and inventing a mapping
 * here would bury a guess in an importer.
 */
export function categoryFromSheetName(name = '') {
  const m = String(name).match(/^(SS)?RollerBlindsCat\s*([A-Za-z]+)\s*(\(\d+\))?$/i)
  if (!m) return null
  const code = m[2]
  return {
    code: /^budget$/i.test(code) ? (m[1] ? 'SS Budget' : 'Budget') : code.toUpperCase(),
    sunscreen: !!m[1],
  }
}

/** The four-digit year in a sheet's own title row, e.g. "2026 Wholesale Price List". */
function sheetYear(rows) {
  for (const row of rows.slice(0, 12)) {
    for (const cell of row) {
      const m = text(cell).match(/\b(20\d{2})\b\s*wholesale/i)
      if (m) return Number(m[1])
    }
  }
  return 0
}

/* --------------------------------------------------------------------------
 * Reading one grid
 * ------------------------------------------------------------------------ */

/**
 * The width header row: "Drop" followed by ascending numbers.
 *
 * The word is matched rather than the position because the header sits in a
 * different column on different tabs. Ascending is checked as well as numeric,
 * so a row of prices that happens to start with the word can't be mistaken for
 * the header.
 */
function findHeader(rows) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || []
    for (let c = 0; c < row.length; c++) {
      if (!/^drop$/i.test(text(row[c]))) continue
      const widths = []
      for (let k = c + 1; k < row.length; k++) {
        const n = num(row[k])
        if (n === null) break
        widths.push({ col: k, mm: n })
      }
      if (widths.length < 3) continue
      const ascending = widths.every((w, i) => i === 0 || w.mm > widths[i - 1].mm)
      if (ascending) return { row: r, dropCol: c, widths }
    }
  }
  return null
}

/**
 * One tab's grid, or null if it hasn't got one.
 *
 * A row is a drop band while its first cell is a number; the first row that
 * isn't ends the grid. Blank price cells stay blank rather than becoming zero
 * — a hole in a price list means "not offered at that size", and a zero there
 * would read as free and show 100% margin.
 */
export function readGrid(rows) {
  const header = findHeader(rows)
  if (!header) return null

  const drops = [], prices = []
  for (let r = header.row + 1; r < rows.length; r++) {
    const row = rows[r] || []
    const drop = num(row[header.dropCol])
    if (drop === null) break
    drops.push(drop)
    prices.push(header.widths.map(w => {
      const n = num(row[w.col])
      return n === null ? null : n
    }))
  }
  if (drops.length === 0) return null

  const flat = prices.flat().filter(p => p !== null)
  return {
    widths: header.widths.map(w => w.mm),
    drops,
    prices,
    cellCount: flat.length,
    minPrice:  flat.length ? Math.min(...flat) : null,
    maxPrice:  flat.length ? Math.max(...flat) : null,
  }
}

/* --------------------------------------------------------------------------
 * The fabric → category map
 * ------------------------------------------------------------------------ */

/**
 * The fabric-category tabs, read into suggestions.
 *
 * Those tabs are prose, not data: one row per supplier reading "Alpha -
 * Bondi, Cottesloe, Dalkeith, Glenelg, Toorak, Vaucluse all B/O and L/F."
 * under a "Category A" heading, with continuation rows that are indented and
 * carry no supplier at all. So each row is split into a supplier and the
 * ranges it lists, and every range becomes a candidate name.
 *
 * These are SUGGESTIONS and named as such. They are matched against the
 * component library by name elsewhere and put in front of someone before
 * anything is saved, because "Tuscany L/F" and "Tuscany B/O" sit in different
 * categories and differ by two characters.
 */
export function readFabricCategories(rows) {
  const out = []
  let current = null
  let lastSupplier = null

  rows.forEach(row => {
    const cell = row.find(c => text(c).length > 0)
    const line = text(cell)
    if (!line) return

    const heading = line.match(/^Category\s+([A-Za-z]+)$/i) || line.match(/^(Budget)$/i)
    if (heading) {
      const code = heading[1]
      current = /^budget$/i.test(code) ? 'Budget' : code.toUpperCase()
      lastSupplier = null
      return
    }
    if (!current) return
    if (/^(fabric categories|width)/i.test(line)) return

    // "Supplier - Range, Range, Range" — or a continuation row, which is
    // indented and belongs to the supplier above it.
    const split = line.match(/^([^-]{2,30}?)\s*-\s*(.+)$/)
    const indented = /^\s{2,}/.test(String(cell))
    const supplier = split && !indented ? split[1].trim() : lastSupplier
    const listing  = split && !indented ? split[2] : line
    if (split && !indented) lastSupplier = supplier

    listing.split(',').forEach(part => {
      // Trailing punctuation and the "all B/O and L/F" tail are prose, not
      // part of the range's name, and both would stop it matching a component.
      const range = part
        .replace(/\(.*?\)/g, '')                 // "(Please Check Swatch...)"
        .replace(/\ball\b.*$/i, '')              // "Vaucluse all B/O and L/F"
        .replace(/[.,;:]+$/, '')
        .trim()
      if (range.length < 2) return
      if (/^POA$/i.test(range)) return
      out.push({ category: current, supplier, range })
    })
  })

  return out
}

/**
 * Suggested category tags, matched against the component library.
 *
 * Matching is on the fabric's own name and code, case-insensitively, and only
 * where the listed range appears as a whole word — so "Kew" doesn't claim
 * "Kewdale". A fabric that matches two categories is reported with both and
 * left for a person; silently taking the first would put a fabric in the wrong
 * price band, which is a wrong sell price on every blind made from it.
 */
export function suggestFabricCategories(listings = [], components = []) {
  const fabrics = components.filter(c => c.order_type === 'fabric')

  return fabrics.map(fabric => {
    const haystack = `${fabric.fabric_code || ''} ${fabric.name || ''}`.toLowerCase()
    const hits = listings.filter(l => {
      const needle = l.range.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`(^|[^a-z0-9])${needle}([^a-z0-9]|$)`, 'i').test(haystack)
    })
    const codes = [...new Set(hits.map(h => h.category))]
    return {
      component: fabric,
      current:   fabric.fabric_category || null,
      suggested: codes.length === 1 ? codes[0] : null,
      ambiguous: codes.length > 1 ? codes : null,
      matchedOn: hits.map(h => h.range),
    }
  }).filter(r => r.suggested || r.ambiguous)
}

/* --------------------------------------------------------------------------
 * The whole workbook
 * ------------------------------------------------------------------------ */

/**
 * Read a price-list workbook into grids and fabric suggestions.
 *
 * `includeSunscreen` is off by default because the sunscreen grids in the
 * current list are still 2015 pricing while the blockout ones are 2026.
 * Loading an eleven-year-old price list would produce GP figures that look
 * authoritative and are not.
 */
export async function importPriceList(file, { includeSunscreen = false } = {}) {
  const XLSX = await loadXLSX()
  const data = await file.arrayBuffer()
  const wb   = XLSX.read(data, { type: 'array' })

  const grids = new Map()     // code -> { ...grid, year, sheet }
  const skipped = []
  let listings = []

  wb.SheetNames.forEach(name => {
    const sheet = wb.Sheets[name]
    const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, defval: null })

    if (/FabricCat/i.test(name)) {
      listings = listings.concat(readFabricCategories(rows))
      return
    }

    const cat = categoryFromSheetName(name)
    if (!cat) return
    if (cat.sunscreen && !includeSunscreen) {
      skipped.push({ sheet: name, reason: 'sunscreen' })
      return
    }

    const grid = readGrid(rows)
    if (!grid) { skipped.push({ sheet: name, reason: 'no grid found' }); return }

    const year = sheetYear(rows)
    const existing = grids.get(cat.code)
    // Newest wins. A tie keeps the first, which only happens when neither
    // sheet states a year — and then they are the same list anyway.
    if (existing && existing.year >= year) {
      skipped.push({ sheet: name, reason: `older than ${existing.sheet} (${existing.year})` })
      return
    }
    if (existing) skipped.push({ sheet: existing.sheet, reason: `superseded by ${name} (${year})` })
    grids.set(cat.code, { ...grid, year, sheet: name, code: cat.code, sunscreen: cat.sunscreen })
  })

  return {
    grids: [...grids.values()].sort((a, b) => a.code.localeCompare(b.code)),
    listings,
    skipped,
    sheetCount: wb.SheetNames.length,
  }
}
