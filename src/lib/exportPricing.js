/**
 * exportProductPricingXLSX
 *
 * One workbook per product: every valid combination of its options, priced
 * across the width (and drop, for blinds) grid. Combinations that land on
 * the exact same price share a single tab rather than one each — see
 * pricingCombos.js for why that happens (spec-only choices, qty options
 * never gate a recipe line).
 *
 * Same runtime-CDN SheetJS pattern as exportPO.js.
 */

import { computePricingGroups } from './pricingCombos'
import { fabricLineFor, GRID_WIDTHS, GRID_BLIND_WIDTHS, GRID_BLIND_DROPS } from './bomEngine'

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

export async function exportProductPricingXLSX(product, productComponents, optionDefs, fabricCategories = [], markup) {
  const XLSX = await loadXLSX()

  const isBlind = (product.product_type || product.category) === 'blind'
  const isTrack = (product.product_type || product.category) === 'track'
  const mk = Number(markup) || 1.6

  // Blinds price their (per-window-chosen) fabric at the category's flat
  // rate — same synthetic line ProductDetail folds into its own grid.
  const fabricCategory = fabricCategories.find(c => c.code === product.fabric_category)
  const categoryFabricLine = (isBlind && fabricCategory)
    ? fabricLineFor({
        component: { id: 'category-fabric', name: `Category ${fabricCategory.code} Fabric`, unit: 'm²', unit_cost: fabricCategory.max_price, discount: 0 },
        colour_variant: null,
        categoryPrice: Number(fabricCategory.max_price) || 0,
      })
    : null
  const pricedComponents = categoryFabricLine ? [categoryFabricLine, ...productComponents] : productComponents

  const { groups, truncated } = computePricingGroups({ productComponents, optionDefs, isBlind, pricedComponents })

  const wb = XLSX.utils.book_new()
  const used = new Set()

  groups.forEach((group, gi) => {
    const primary = group.combos[0]
    const label = primary.description.join(' · ') || 'Standard'
    const rows = [[product.name || 'Product'], [label]]

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
      rows.push([])
      rows.push(['Sell ($)'])
      rows.push(['Drop \\ Width', ...GRID_BLIND_WIDTHS])
      GRID_BLIND_DROPS.forEach((d, di) =>
        rows.push([d, ...group.grid.slice(di * cols, di * cols + cols).map(c => Math.round(c * mk * 100) / 100)]))
    }

    const ws = XLSX.utils.aoa_to_sheet(rows)
    const dataCols = (isTrack ? GRID_WIDTHS : GRID_BLIND_WIDTHS).length
    ws['!cols'] = [{ wch: 16 }, ...Array(dataCols).fill({ wch: 10 })]
    XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(label || `Combo ${gi + 1}`, used))
  })

  const safeName = (product.name || 'Product').replace(/[^a-zA-Z0-9]+/g, '_')
  XLSX.writeFile(wb, `Pricing_${safeName}.xlsx`)

  return { groupCount: groups.length, truncated }
}
