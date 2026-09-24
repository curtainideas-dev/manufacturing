/**
 * Purchase Order Engine
 *
 * Pure functions for reorder quantities and pricing — no React, no Supabase.
 */

import { getStock } from './stockEngine'

/**
 * The discount that applies when ordering a component.
 *
 * The component's own if it has one, otherwise its SUPPLIER's. The component
 * figure is seeded from the supplier when the component is created, so the two
 * usually agree — but a component added before that supplier had a discount
 * set keeps a zero, and was being ordered at full list off a supplier who
 * gives 25%. The fallback closes that without letting the supplier override a
 * rate deliberately set on the part.
 *
 * Passing no supplier keeps the old behaviour exactly, so a caller that has
 * not been given one cannot silently start applying a rate it guessed at.
 */
export function effectiveDiscount(component, supplier = null) {
  const own = Number(component?.discount) || 0
  if (own > 0) return own
  return Number(supplier?.discount) || 0
}

/**
 * What one order unit costs, and what it is called.
 *
 * `price` is the NET — what we pay — because that is what a purchase order
 * line stores and what everything downstream totals. The list price and the
 * discount that got us there come back alongside it for anything that wants
 * to show the working (see priceBreakdown).
 */
export function orderUnitInfo(component, supplier = null) {
  const discount = effectiveDiscount(component, supplier)
  const isBar    = component?.order_type === 'bar'
  const list     = Number(isBar ? component?.bar_price : component?.pack_price) || 0
  const packQty  = Number(component?.pack_qty) || 1
  return {
    // Fabric is bought as rolls. It has no pack size, so falling through to
    // the pack branch printed "pack of 1" — on a sheet going to a supplier.
    label:    isBar ? 'bar' : component?.order_type === 'fabric' ? 'roll' : `pack of ${packQty}`,
    price:    list * (1 - discount / 100),
    list,
    discount,
  }
}

/**
 * List price, discount and net for one order LINE.
 *
 * The line stores only what was paid, so the list price and the discount have
 * to be recomputed from the component. That means an order re-reads today's
 * discount rather than the one it was sent with — so when the recomputed net
 * no longer matches what is actually on the line, the line wins and the
 * difference is flagged. Showing a tidy sum that contradicts the price on the
 * order would be worse than admitting they have drifted apart.
 */
export function priceBreakdown(line, component, supplier = null) {
  const info = orderUnitInfo(component, supplier)
  const paid = Number(line?.unit_cost) || 0
  const drifted = info.list > 0 && Math.abs(info.price - paid) > 0.005
  return {
    list:     info.list,
    discount: info.discount,
    net:      paid,
    drifted,
    // What the component says it should be now — only meaningful when drifted.
    currentNet: info.price,
  }
}

/* ==========================================================================
 * Receiving
 * ========================================================================== */

/** How much of a line has not arrived yet, in order units. Never negative. */
export function outstandingQty(line) {
  return Math.max(0, (Number(line?.qty_ordered) || 0) - (Number(line?.qty_received) || 0))
}

/** Every line accounted for — what decides an order is finished. */
export function isFullyReceived(lines = []) {
  return lines.length > 0 && lines.every(l => outstandingQty(l) <= 0)
}

/**
 * What arriving stock does to the shelf, per line.
 *
 * The conversion is the whole point, and getting it wrong is the unit trap
 * this app has hit before:
 *
 *   bar     an order unit IS a bar, and qty_on_hand counts bars. 1:1.
 *   pack    an order unit is a PACK; qty_on_hand counts the component's own
 *           unit. Three packs of a 50m spline is 150 metres, not 3.
 *   fabric  no count at all — every roll is its own piece in stock_bars, with
 *           a width and a length that only the delivery can tell you. Handled
 *           by asking, not by arithmetic.
 *
 * Returns the amount to ADD to stock.qty_on_hand, or null when the line is
 * not something a count can express.
 */
export function receivedToStockQty(component, qtyReceived) {
  const qty = Number(qtyReceived) || 0
  if (qty <= 0) return 0
  if (component?.order_type === 'fabric') return null
  if (component?.order_type === 'bar')    return qty
  return qty * (Number(component?.pack_qty) || 1)
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

/* ==========================================================================
 * What a line SAYS
 *
 * Both of these are derived from the component unless the line overrides them.
 * Every document that shows a line — the screen, the PDF, the spreadsheet —
 * goes through these, so an order cannot read one way on screen and another
 * way on the sheet the supplier receives.
 * ========================================================================== */

/** The component's own wording for a line, before any override. */
export function derivedDescription(line) {
  // Colour is NOT folded in here any more: it has a column of its own, and a
  // document that prints it twice reads as two different facts. The Excel
  // export always had a Colour column and so always printed it twice; that is
  // fixed by the same change.
  return line?.component?.name || 'Component'
}

/** The colour variant's own name — what the line says unless overridden. */
export function derivedColour(line) {
  return line?.colour_variant?.name || ''
}

/**
 * The colour a line PRINTS, the supplier's word winning over ours.
 *
 * The override is a label and nothing more. colour_variant still decides the
 * part number suffix and which stock row a delivery books into, so typing
 * "SA" over "Anodised Silver" changes the sheet and moves no stock. That
 * separation is deliberate: it lets an order read the supplier's way without
 * touching what the line actually IS.
 */
export function lineColour(line) {
  const override = (line?.colour || '').trim()
  return override || derivedColour(line)
}

/** What the line says, the supplier's words winning over ours. */
export function lineDescription(line) {
  const override = (line?.description || '').trim()
  return override || derivedDescription(line)
}

/** What the line is ordered by — 'bar', 'pack of 50', or whatever was typed. */
export function lineOrderUnit(line, supplier = null) {
  const override = (line?.order_unit || '').trim()
  if (override) return override
  return line?.component ? orderUnitInfo(line.component, supplier).label : ''
}

/* ==========================================================================
 * Where the goods are going
 *
 * An order travels one of two ways, and the document has to say which. Until
 * now every order assumed delivery, to the one address held on the company
 * record — so an order someone was driving over to collect still printed a
 * delivery address, and a delivery to the warehouse printed the workroom's.
 *
 * These read the answer off the ORDER, falling back through the addresses to
 * the company record, so a database where the addresses table does not exist
 * yet still produces exactly the sheet it produced before.
 * ========================================================================== */

/** 'delivery' unless the order says otherwise — including when the column
 *  isn't there yet, which is the whole point of not comparing to 'delivery'. */
export function poFulfilment(po) {
  return po?.fulfilment === 'pickup' ? 'pickup' : 'delivery'
}

/** Where goods land unless an order says otherwise. */
export function defaultAddress(addresses = []) {
  return addresses.find(a => a.is_default) || addresses[0] || null
}

/**
 * The address THIS order delivers to.
 *
 * A null delivery_address_id means "wherever the default is" rather than
 * "nowhere", which is what every existing order and every new draft carries.
 * A pinned id that no longer resolves — the address was deleted — falls back
 * to the default rather than printing nothing.
 */
export function poAddress(po, addresses = []) {
  if (poFulfilment(po) === 'pickup') return null
  const pinned = po?.delivery_address_id
    ? addresses.find(a => a.id === po.delivery_address_id)
    : null
  return pinned || defaultAddress(addresses)
}

/**
 * The block that goes on the documents, as a title and the lines under it.
 *
 * Both exports print the same words from here, because the PDF a supplier
 * reads and the spreadsheet they paste into their system disagreeing about
 * where the goods go is the exact failure this is meant to prevent.
 *
 * The delivery fallback chain ends at company_details.delivery_address — the
 * single field this replaced. It is still populated and still correct on a
 * database where the addresses table hasn't been created, so nothing has to
 * be set up before the next order can be sent.
 */
export function fulfilmentBlock(po, supplier, addresses = [], company = {}) {
  if (poFulfilment(po) === 'pickup') {
    return {
      mode:  'pickup',
      title: 'Pick up',
      lines: [
        `We will collect from ${supplier?.name || 'the supplier'}.`,
        'Please advise when the order is ready.',
        [company.phone, company.email].filter(Boolean).join('  ·  ') || null,
      ].filter(Boolean),
    }
  }

  const addr = poAddress(po, addresses)
  const body = addr
    ? [addr.address, addr.note]
    : [company.delivery_address || company.address, company.delivery_note]

  return {
    mode:  'delivery',
    title: 'Deliver to',
    lines: [company.name || 'Curtain Ideas', ...body]
      .filter(t => t && String(t).trim()),
  }
}
