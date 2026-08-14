/**
 * Purchase Order Engine
 *
 * Pure functions for reorder quantities and pricing — no React, no Supabase.
 */

import { getStock } from './stockEngine'

// How a component is packaged when ordering from its supplier. Labour
// components aren't physical stock and should be filtered out before calling this.
export function orderUnitInfo(component) {
  const discount = Number(component?.discount) || 0
  if (component?.order_type === 'bar') {
    const price = Number(component?.bar_price) || 0
    return { label: 'bar', price: price * (1 - discount / 100) }
  }
  const packQty = Number(component?.pack_qty) || 1
  const price   = Number(component?.pack_price) || 0
  return { label: `pack of ${packQty}`, price: price * (1 - discount / 100) }
}

// Suggested reorder quantity (in order units — packs or bars) to bring
// stock back up to its minimum. Defaults to 1 when there's no shortfall.
export function suggestReorderQty(component, colourVariant, stockMap) {
  const stock     = getStock(stockMap, component, colourVariant)
  const onHand    = Number(stock?.qty_on_hand) || 0
  const minimum   = Number(stock?.qty_minimum) || 0
  const shortfall = minimum - onHand
  if (shortfall <= 0) return 1
  if (component?.order_type === 'bar') return Math.ceil(shortfall)
  const packQty = Number(component?.pack_qty) || 1
  return Math.ceil(shortfall / packQty)
}

export function displayPN(component, colourVariant) {
  const base   = component?.supplier_pn || ''
  const suffix = colourVariant?.suffix || ''
  if (base && suffix) return `${base}-${suffix}`
  return base || suffix || ''
}

// Short human-friendly PO reference derived from creation date + id — no
// dedicated sequence column in the DB, so it stays stable without a migration.
export function poDisplayNumber(po) {
  const d  = po?.created_at ? new Date(po.created_at) : new Date()
  const ym = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`
  const short = (po?.id || '').replace(/-/g, '').slice(0, 4).toUpperCase()
  return `PO-${ym}-${short}`
}

export function poLineTotal(line) {
  return (Number(line?.qty_ordered) || 0) * (Number(line?.unit_cost) || 0)
}

export function poGrandTotal(lines) {
  return (lines || []).reduce((s, l) => s + poLineTotal(l), 0)
}
