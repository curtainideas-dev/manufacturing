import { useState, useEffect } from 'react'
import { ChevronLeftIcon, TrashIcon, PlusIcon } from '../components/Icons'
import {
  orderUnitInfo, displayPN, poDisplayNumber, poLineTotal, poGrandTotal,
  priceBreakdown, outstandingQty, isFullyReceived, derivedDescription, lineColour,
} from '../lib/poEngine'

const STATUS_META = {
  draft:     { label: 'Draft',     pill: 'pill-orange' },
  sent:      { label: 'Sent',      pill: 'pill-blue'   },
  received:  { label: 'Received',  pill: 'pill-green'  },
  cancelled: { label: 'Cancelled', pill: 'pill-red'    },
}

const fmtMoney = n => Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * A text cell that commits on blur rather than on every keystroke.
 *
 * Writing per letter would be a round trip per character and, worse, would
 * hand the input a value the parent had already trimmed — so a trailing space
 * disappeared as you typed and the next letter landed against the wrong word.
 * The draft is local until focus leaves; Enter commits, Escape abandons.
 */
function TextCell({ value, placeholder, disabled, onCommit, style }) {
  const [draft, setDraft] = useState(value || '')
  useEffect(() => { setDraft(value || '') }, [value])

  const commit = () => { if (draft !== (value || '')) onCommit(draft) }

  return (
    <input
      className="field-input"
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setDraft(value || ''); e.currentTarget.blur() }
      }}
      style={style} />
  )
}

export default function PurchaseOrderDetail({
  po, lines, onBack, onDelete, onAddLines, onUpdateLine, onRemoveLine,
  onStatusChange, onExport, onExportPdf, onTogglePricing, onReceive, exporting,
}) {
  const supplier = po.supplier
  const total    = poGrandTotal(lines)
  const isDraft  = po.status === 'draft'
  const isSent   = po.status === 'sent'
  const meta     = STATUS_META[po.status] || STATUS_META.draft

  // Quantities-only is a property of the ORDER, not a view toggle, so the
  // screen and every PDF of it say the same thing.
  const showPricing = !po.hide_pricing

  // Columns change shape rather than blanking out: with no money to show, the
  // description takes back the width it was using.
  // The PDF's columns, in the PDF's order. Part No. and Description lead
  // because that is what a supplier scans for; the money trails behind them.
  const grid = showPricing
    ? '86px minmax(140px,1fr) 96px 94px 52px 58px 42px 72px 72px 26px'
    : '104px minmax(170px,1fr) 110px 112px 62px 26px'

  const outstanding = lines.reduce((n, l) => n + (outstandingQty(l) > 0 ? 1 : 0), 0)
  const allIn       = isFullyReceived(lines)

  return (
    <>
      <div className="header">
        <button className="header-back" onClick={onBack}>
          <ChevronLeftIcon size={18} /> Orders
        </button>
        <div className="header-title" style={{ fontSize: 15 }}>{supplier?.name || 'Purchase Order'}</div>
<div className="header-actions" style={{ display: 'flex', gap: 6 }}>
          {[
            { label: 'PDF',   onClick: onExportPdf, primary: true },
            { label: 'Excel', onClick: onExport,    primary: false },
          ].map(b => (
            <button key={b.label}
              onClick={b.onClick}
              disabled={exporting || lines.length === 0}
              style={{
                padding: '6px 12px', fontSize: 13, fontWeight: 600,
                background: b.primary ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.15)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                opacity: (exporting || lines.length === 0) ? 0.6 : 1,
              }}>
              ⬇ {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-area">
        <div style={{ padding: 16 }}>

          {/* Order info */}
          <div className="card card-body" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--warm-300)', fontWeight: 600 }}>{poDisplayNumber(po)}</div>
              <span className={`pill ${meta.pill}`}>{meta.label}</span>
            </div>
            {supplier?.contact_name && <div style={{ fontSize: 13 }}>{supplier.contact_name}</div>}
            {supplier?.email && <div style={{ fontSize: 13, color: 'var(--warm-300)' }}>{supplier.email}</div>}
            {supplier?.phone && <div style={{ fontSize: 13, color: 'var(--warm-300)' }}>{supplier.phone}</div>}
            {po.notes && (
              <div style={{ fontSize: 13, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--warm-100)' }}>
                {po.notes}
              </div>
            )}
          </div>

          {/* What the supplier sees. Saved on the order, so the PDF cannot
              disagree with the screen. */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: '10px 14px', marginBottom: 16,
            background: showPricing ? '#fff' : 'var(--warm-100)',
            border: '1px solid var(--warm-200)', borderRadius: 'var(--radius-sm)',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {showPricing ? 'Showing prices and discounts' : 'Quantities only'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 2, lineHeight: 1.4 }}>
                {showPricing
                  ? 'List price, discount and line totals appear here and on the PDF.'
                  : 'No money on the order or the PDF — part numbers and quantities only.'}
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
              onClick={() => onTogglePricing(!po.hide_pricing)}>
              {showPricing ? 'Hide pricing' : 'Show pricing'}
            </button>
          </div>

          <div className="section-title" style={{ padding: '0 0 8px' }}>
            Items ({lines.length})
            {!isDraft && outstanding > 0 && (
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--warning)', marginLeft: 8 }}>
                · {outstanding} outstanding
              </span>
            )}
            {!isDraft && allIn && (
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--success)', marginLeft: 8 }}>
                · all received
              </span>
            )}
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            {lines.length === 0 ? (
              <div className="empty-state" style={{ padding: '28px 20px' }}>
                <div className="empty-icon" style={{ fontSize: 32 }}>📦</div>
                <div className="empty-desc" style={{ marginBottom: 16 }}>No items on this order yet.</div>
                {isDraft && (
                  <button className="btn btn-secondary" onClick={onAddLines}>
                    <PlusIcon size={15} /> Add Items
                  </button>
                )}
              </div>
            ) : (
              /* Same columns, same order, same wording as the PDF. The screen
                 and the sheet the supplier receives were two different tables
                 before, so checking one against the other meant translating
                 between them.

                 It scrolls sideways rather than reflowing: eight columns do not
                 fit a phone, and squeezing them makes the numbers unreadable —
                 which on the one screen where a price is proof-read is worse
                 than a scroll. Part No. and Description stay pinned left so a
                 row stays identifiable while the money scrolls past. */
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: showPricing ? 866 : 570 }}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: grid,
                    padding: '10px 16px', background: 'var(--warm-100)',
                    borderBottom: '1px solid var(--warm-200)',
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.06em', color: 'var(--warm-300)', gap: 8,
                  }}>
                    <div>Part No.</div>
                    <div>Description</div>
                    <div>Colour</div>
                    <div>Order unit</div>
                    <div style={{ textAlign: 'right' }}>Qty</div>
                    {showPricing && <div style={{ textAlign: 'right' }}>List</div>}
                    {showPricing && <div style={{ textAlign: 'right' }}>Disc</div>}
                    {showPricing && <div style={{ textAlign: 'right' }}>Unit</div>}
                    {showPricing && <div style={{ textAlign: 'right' }}>Total</div>}
                    <div />
                  </div>

                  {lines.map(l => {
                    const b   = l.component ? priceBreakdown(l, l.component, supplier) : null
                    const out = outstandingQty(l)
                    const received = Number(l.qty_received) || 0
                    // Placeholders show what the line WOULD say, so an empty
                    // box reads as "using the component's own wording" rather
                    // than as missing data.
                    const descPlaceholder = derivedDescription(l)
                    const unitPlaceholder = l.component ? orderUnitInfo(l.component, supplier).label : ''
                    return (
                      <div key={l.id} style={{
                        display: 'grid', gridTemplateColumns: grid,
                        padding: '10px 16px', borderBottom: '1px solid var(--warm-100)',
                        fontSize: 14, alignItems: 'center', gap: 8,
                      }}>
                        <div style={{ minWidth: 0, fontSize: 12, color: 'var(--warm-300)', fontFamily: 'ui-monospace, monospace' }}>
                          {displayPN(l.component, l.colour_variant) || '—'}
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <TextCell
                            value={l.description}
                            placeholder={descPlaceholder}
                            disabled={!isDraft}
                            onCommit={v => onUpdateLine(l.id, { description: v })}
                            style={{ padding: '5px 7px', fontSize: 13, fontWeight: 600, width: '100%' }} />
                          {/* What is really being ordered, when the wording no
                              longer says so. */}
                          {l.description?.trim() && l.description.trim() !== descPlaceholder && (
                            <div style={{ fontSize: 10.5, color: 'var(--warm-300)', marginTop: 2 }}>
                              {descPlaceholder}
                            </div>
                          )}
                          {!isDraft && (
                            <div style={{ fontSize: 10.5, marginTop: 2, color: out > 0 ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>
                              {out > 0
                                ? `${received} of ${l.qty_ordered} received · ${out} outstanding`
                                : `all ${l.qty_ordered} received`}
                            </div>
                          )}
                        </div>

                        {/* Derived, not typed. The colour picks the part
                            number suffix and the stock row this line draws
                            from, so it is structural rather than a label to
                            be reworded the way the description is. */}
                        <div style={{ minWidth: 0, fontSize: 12.5, color: lineColour(l) ? 'var(--ink)' : 'var(--warm-300)' }}>
                          {lineColour(l) || '—'}
                        </div>

                        <TextCell
                          value={l.order_unit}
                          placeholder={unitPlaceholder}
                          disabled={!isDraft}
                          onCommit={v => onUpdateLine(l.id, { order_unit: v })}
                          style={{ padding: '5px 7px', fontSize: 12.5, width: '100%' }} />

                        <input type="number" step="1" min="0" value={l.qty_ordered} disabled={!isDraft}
                          onChange={e => onUpdateLine(l.id, { qty_ordered: e.target.value })}
                          className="field-input"
                          style={{ textAlign: 'right', padding: '5px 6px', fontSize: 13 }} />

                        {showPricing && (
                          <div style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--warm-300)' }}>
                            {b && b.discount > 0 ? `$${fmtMoney(b.list)}` : '—'}
                          </div>
                        )}
                        {showPricing && (
                          <div style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--warm-300)' }}>
                            {b && b.discount > 0 ? `${b.discount}%` : '—'}
                          </div>
                        )}
                        {showPricing && (
                          <div>
                            <input type="number" step="0.01" min="0" value={l.unit_cost} disabled={!isDraft}
                              onChange={e => onUpdateLine(l.id, { unit_cost: e.target.value })}
                              className="field-input"
                              style={{ textAlign: 'right', padding: '5px 6px', fontSize: 13, width: '100%' }} />
                            {b?.drifted && (
                              <div style={{ fontSize: 10, color: 'var(--warning)', marginTop: 2, textAlign: 'right' }}>
                                now ${fmtMoney(b.currentNet)}
                              </div>
                            )}
                          </div>
                        )}
                        {showPricing && (
                          <div style={{ textAlign: 'right', fontWeight: 700 }}>${fmtMoney(poLineTotal(l))}</div>
                        )}

                        {isDraft ? (
                          <button onClick={() => onRemoveLine(l.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4, justifySelf: 'end' }}>
                            <TrashIcon size={14} />
                          </button>
                        ) : <div />}
                      </div>
                    )
                  })}

                  {showPricing && (
                    <div style={{
                      display: 'grid', gridTemplateColumns: grid,
                      padding: '12px 16px', background: 'var(--accent-bg)',
                      fontSize: 14, fontWeight: 700, gap: 8,
                    }}>
                      <div style={{ color: 'var(--accent-dark)', gridColumn: '1 / 9' }}>Estimated Total</div>
                      <div style={{ textAlign: 'right', color: 'var(--accent-dark)' }}>${fmtMoney(total)}</div>
                      <div />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {isDraft && lines.length > 0 && (
            <button className="btn btn-secondary btn-block" onClick={onAddLines}>
              <PlusIcon size={16} /> Add More Items
            </button>
          )}

          {/* Status actions */}
          {isDraft && (
            <button className="btn btn-block"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', marginTop: 12 }}
              disabled={lines.length === 0}
              onClick={() => onStatusChange('sent')}>
              Mark as Sent to Supplier
            </button>
          )}
          {isSent && (
            <>
              {/* Receiving is per line and puts the goods straight into stock.
                  "Mark Received" is left as the way to close an order off
                  without booking anything in — a delivery that was already
                  put away by hand, say. */}
              <button className="btn btn-block"
                style={{ background: 'var(--success)', color: '#fff', border: 'none', marginTop: 12 }}
                disabled={lines.length === 0 || allIn}
                onClick={onReceive}>
                📥 {allIn ? 'Everything received' : `Receive Delivery${outstanding ? ` (${outstanding} outstanding)` : ''}`}
              </button>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => onStatusChange('draft')}>
                  Reopen
                </button>
                <button className="btn btn-secondary" style={{ flex: 1 }}
                  onClick={() => onStatusChange('received')}>
                  Close without receiving
                </button>
              </div>
            </>
          )}
          {po.status === 'received' && (
            <button className="btn btn-secondary btn-block" style={{ marginTop: 12 }} onClick={() => onStatusChange('sent')}>
              Reopen
            </button>
          )}

          <div className="divider" />
          <button className="btn btn-danger btn-block" onClick={onDelete}>
            <TrashIcon size={15} /> Delete Order
          </button>
        </div>
      </div>
    </>
  )
}
