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

/* ==========================================================================
 * Ordering straight off the stock page
 *
 * Reordering used to mean going to Orders, finding or starting the right
 * supplier's draft, then picking the part out of a list — which is three
 * screens away from the moment you actually notice you are short, standing in
 * front of the rack. These let the shelf itself put a line on an order.
 * ========================================================================== */

/**
 * The order a stock line would be added to: this supplier's most recent DRAFT.
 *
 * Draft only. 'sent' has gone to the supplier and 'received' is history, so
 * appending to either would add something nobody is going to send — and on
 * this data that is not hypothetical: one supplier's only order is already
 * sent. Null means there is nothing open and one has to be started.
 */
export function openPOFor(purchaseOrders = [], supplierId) {
  if (!supplierId) return null
  return purchaseOrders
    .filter(po => po.supplier_id === supplierId && po.status === 'draft')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null
}

/** Component + colour, the same key purchase order lines are compared on. */
export function poLineKey(componentId, colourVariant) {
  return `${componentId}__${colourVariant?.suffix || ''}`
}

/**
 * Whether a part can be put on an order right now, and if not, why.
 *
 * Returned as a reason rather than a bare false so the button can say what is
 * wrong instead of being mysteriously dead:
 *
 *   no_supplier  nothing to raise an order against — the part has no supplier.
 *   on_po        already a line on the open draft. Changing a quantity belongs
 *                on the order, where the rest of it is visible, not behind a
 *                button on a different screen that can only ever add.
 */
export function addToPOState({ component, colourVariant, purchaseOrders = [], poLinesMap = {} }) {
  if (!component?.supplier_id) return { ok: false, reason: 'no_supplier' }

  const po = openPOFor(purchaseOrders, component.supplier_id)
  if (!po) return { ok: true, po: null, willCreate: true }

  const key   = poLineKey(component.id, colourVariant)
  const lines = poLinesMap[po.id] || []
  const hit   = lines.find(l => poLineKey(l.component_id, l.colour_variant) === key)
  if (hit) return { ok: false, reason: 'on_po', po, line: hit }

  return { ok: true, po, willCreate: false }
}
