import { ChevronLeftIcon, TrashIcon, PlusIcon } from '../components/Icons'
import { orderUnitInfo, displayPN, poDisplayNumber, poLineTotal, poGrandTotal } from '../lib/poEngine'

const STATUS_META = {
  draft:     { label: 'Draft',     pill: 'pill-orange' },
  sent:      { label: 'Sent',      pill: 'pill-blue'   },
  received:  { label: 'Received',  pill: 'pill-green'  },
  cancelled: { label: 'Cancelled', pill: 'pill-red'    },
}

const fmtMoney = n => Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function PurchaseOrderDetail({
  po, lines, onBack, onDelete, onAddLines, onUpdateLine, onRemoveLine,
  onStatusChange, onExport, exporting,
}) {
  const supplier = po.supplier
  const total    = poGrandTotal(lines)
  const isDraft  = po.status === 'draft'
  const meta     = STATUS_META[po.status] || STATUS_META.draft

  return (
    <>
      <div className="header">
        <button className="header-back" onClick={onBack}>
          <ChevronLeftIcon size={18} /> Orders
        </button>
        <div className="header-title" style={{ fontSize: 15 }}>{supplier?.name || 'Purchase Order'}</div>
        <div className="header-actions">
          <button
            onClick={onExport}
            disabled={exporting || lines.length === 0}
            style={{
              padding: '6px 12px', fontSize: 13, fontWeight: 600,
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: (exporting || lines.length === 0) ? 0.6 : 1,
            }}>
            ⬇ {exporting ? 'Generating…' : 'Excel'}
          </button>
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

          <div className="section-title" style={{ padding: '0 0 8px' }}>
            Items ({lines.length})
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
              <>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 56px 70px 75px 26px',
                  padding: '10px 16px', background: 'var(--warm-100)',
                  borderBottom: '1px solid var(--warm-200)',
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: 'var(--warm-300)',
                }}>
                  <div>Component</div>
                  <div style={{ textAlign: 'right' }}>Qty</div>
                  <div style={{ textAlign: 'right' }}>Unit $</div>
                  <div style={{ textAlign: 'right' }}>Total</div>
                  <div />
                </div>

                {lines.map(l => {
                  const info = l.component ? orderUnitInfo(l.component) : null
                  return (
                    <div key={l.id} style={{
                      display: 'grid', gridTemplateColumns: '1fr 56px 70px 75px 26px',
                      padding: '10px 16px', borderBottom: '1px solid var(--warm-100)',
                      fontSize: 14, alignItems: 'center', gap: 6,
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>
                          {l.component?.name || 'Component removed'}
                          {l.colour_variant?.name ? ` · ${l.colour_variant.name}` : ''}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 2 }}>
                          {[displayPN(l.component, l.colour_variant), info ? `per ${info.label}` : null].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <input type="number" step="1" min="0" value={l.qty_ordered} disabled={!isDraft}
                        onChange={e => onUpdateLine(l.id, { qty_ordered: e.target.value })}
                        className="field-input"
                        style={{ textAlign: 'right', padding: '5px 6px', fontSize: 13 }} />
                      <input type="number" step="0.01" min="0" value={l.unit_cost} disabled={!isDraft}
                        onChange={e => onUpdateLine(l.id, { unit_cost: e.target.value })}
                        className="field-input"
                        style={{ textAlign: 'right', padding: '5px 6px', fontSize: 13 }} />
                      <div style={{ textAlign: 'right', fontWeight: 600 }}>${fmtMoney(poLineTotal(l))}</div>
                      {isDraft ? (
                        <button onClick={() => onRemoveLine(l.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4, justifySelf: 'end' }}>
                          <TrashIcon size={14} />
                        </button>
                      ) : <div />}
                    </div>
                  )
                })}

                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 56px 70px 75px 26px',
                  padding: '12px 16px', background: 'var(--accent-bg)',
                  fontSize: 14, fontWeight: 700,
                }}>
                  <div style={{ color: 'var(--accent-dark)' }}>Estimated Total</div>
                  <div /><div />
                  <div style={{ textAlign: 'right', color: 'var(--accent-dark)' }}>${fmtMoney(total)}</div>
                  <div />
                </div>
              </>
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
          {po.status === 'sent' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => onStatusChange('draft')}>
                Reopen
              </button>
              <button className="btn" style={{ flex: 1, background: 'var(--success)', color: '#fff', border: 'none' }}
                onClick={() => onStatusChange('received')}>
                Mark Received
              </button>
            </div>
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
