/**
 * exportProductPricingXLSX
 *
 * One workbook per product: every valid combination of its options, priced
 * across the width (and drop, for blinds) grid. Combinations that land on
 * the exact same price share a single tab rather than one each — see
 * pricingCombos.js for why that happens (spec-only choices, qty options
 * never gate a recipe line).
 *
 * A blind is exported FOR ONE FABRIC, because both halves of its economics
 * belong to the fabric and not to the product: cost is the fabric's own
 * wholesale rate, and sell is the wholesaler's list for the category that
 * fabric is tagged with. The sell figures are those list prices, not cost
 * times a markup — a markup is an assumption, and the whole point of this
 * workbook is to show the real margin per size.
 *
 * Same runtime-CDN SheetJS pattern as exportPO.js.
 */

import { computePricingGroups } from './pricingCombos'
import { fabricLineFor, buildFabricSelection, GRID_WIDTHS, GRID_BLIND_WIDTHS, GRID_BLIND_DROPS } from './bomEngine'
import { gridPrice, grossProfit } from './sellEngine'

const loadXLSX = () => new Promise((resolve, reject) => {
  if (window.XLSX) return resolve(window.XLSX)
  const s = document.createElement('script')
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
  s.onload = () => resolve(window.XLSX)
  s.onerror = reject
  document.head.appendChild(s)
})

const sanitizeSheetName = name => (name || '').replace(/:/g, '').replace(/[\\/?*[\]]/g, '-').slice(0, 31) || 'Sheet'

function uniqueSheetName(base, used) {
  const name = sanitizeSheetName(base)
  if (!used.has(name)) { used.add(name); return name }
  let i = 2, next
  do { next = `${name.slice(0, 28)} ${i++}` } while (used.has(next))
  used.add(next)
  return next
}

export async function exportProductPricingXLSX(product, productComponents, optionDefs, fabricCategories = [], fabric = null) {
  const XLSX = await loadXLSX()

  const isBlind = (product.product_type || product.category) === 'blind'
  const isTrack = (product.product_type || product.category) === 'track'

  // The fabric the blind is costed in — the same synthetic line ProductDetail
  // folds into its own grid, built from the real component so the workbook
  // and the screen can't quote different costs.
  const fabricLine = (isBlind && fabric)
    ? fabricLineFor(buildFabricSelection(fabric, null, product))
    : null
  const pricedComponents = fabricLine ? [fabricLine, ...productComponents] : productComponents

  // And the list it sells off, via the category that fabric is tagged with.
  const category = isBlind && fabric?.fabric_category
    ? fabricCategories.find(c => c.code === fabric.fabric_category) || null
    : null

  const { groups, truncated } = computePricingGroups({ productComponents, optionDefs, isBlind, pricedComponents })

  const wb = XLSX.utils.book_new()
  const used = new Set()

  groups.forEach((group, gi) => {
    const primary = group.combos[0]
    const label = primary.description.join(' · ') || 'Standard'
    const rows = [[product.name || 'Product'], [label]]
    if (isBlind && fabric) {
      rows.push([`Fabric: ${fabric.fabric_code ? fabric.fabric_code + ' — ' : ''}${fabric.name}`
        + ` · $${Number(fabric.unit_cost || 0).toFixed(2)}/m`
        + (category ? ` · sells on ${category.name || category.code}` : ' · no sell category')])
    }

    if (group.combos.length > 1) {
      group.combos.slice(1).forEach(c => rows.push([`Same price as: ${c.description.join(' · ') || 'Standard'}`]))
    }
    rows.push([])

    if (isTrack) {
      rows.push(['Width (mm)', ...GRID_WIDTHS])
      rows.push(['Cost ($)', ...group.grid])
      ;(group.bracketRows || []).forEach(r => rows.push([`Brackets — ${r.name}`, ...r.values]))
      ;(group.carrierRows || []).forEach(r => rows.push([`Carriers — ${r.name}`, ...r.values]))
    } else if (isBlind) {
      const cols = GRID_BLIND_WIDTHS.length
      rows.push(['Cost ($)'])
      rows.push(['Drop \\ Width', ...GRID_BLIND_WIDTHS])
      GRID_BLIND_DROPS.forEach((d, di) => rows.push([d, ...group.grid.slice(di * cols, di * cols + cols)]))
      // Sell and margin off the real list. A size the list doesn't reach is
      // left blank rather than filled with the corner price — see
      // sellEngine.bandIndex.
      const sellAt = (w, d) => category ? gridPrice(category, w, d).price : null

      rows.push([])
      rows.push(['Sell ($)' + (category ? ` — ${category.name || category.code} list` : ' — no price list')])
      rows.push(['Drop \\ Width', ...GRID_BLIND_WIDTHS])
      GRID_BLIND_DROPS.forEach(d =>
        rows.push([d, ...GRID_BLIND_WIDTHS.map(w => sellAt(w, d))]))

      rows.push([])
      rows.push(['Gross margin (%)'])
      rows.push(['Drop \\ Width', ...GRID_BLIND_WIDTHS])
      GRID_BLIND_DROPS.forEach((d, di) =>
        rows.push([d, ...GRID_BLIND_WIDTHS.map((w, wi) => {
          const g = grossProfit(group.grid[di * cols + wi], sellAt(w, d))
          return g.priced && g.gpPct !== null ? Math.round(g.gpPct * 10) / 10 : null
        })]))
    }

    const ws = XLSX.utils.aoa_to_sheet(rows)
    const dataCols = (isTrack ? GRID_WIDTHS : GRID_BLIND_WIDTHS).length
    ws['!cols'] = [{ wch: 16 }, ...Array(dataCols).fill({ wch: 10 })]
    XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(label || `Combo ${gi + 1}`, used))
  })

  const safeName = [product.name || 'Product', isBlind && fabric ? fabric.name : null]
    .filter(Boolean).join('_').replace(/[^a-zA-Z0-9]+/g, '_')
  XLSX.writeFile(wb, `Pricing_${safeName}.xlsx`)

  return { groupCount: groups.length, truncated }
}
