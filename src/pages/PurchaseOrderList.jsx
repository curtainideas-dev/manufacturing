import { PlusIcon, ChevronRightIcon } from '../components/Icons'
import { poDisplayNumber, poGrandTotal } from '../lib/poEngine'

const STATUS_META = {
  draft:     { label: 'Draft',     pill: 'pill-orange' },
  sent:      { label: 'Sent',      pill: 'pill-blue'   },
  received:  { label: 'Received',  pill: 'pill-green'  },
  cancelled: { label: 'Cancelled', pill: 'pill-red'    },
}

const fmtMoney = n => Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const formatDate = d => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export default function PurchaseOrderList({ purchaseOrders, onOpen, onNew }) {
  const draft     = purchaseOrders.filter(p => p.status === 'draft')
  const sent      = purchaseOrders.filter(p => p.status === 'sent')
  const received  = purchaseOrders.filter(p => p.status === 'received')
  const cancelled = purchaseOrders.filter(p => p.status === 'cancelled')

  const outstandingValue = [...draft, ...sent].reduce((s, po) => s + poGrandTotal(po.lines), 0)

  const Section = ({ title, list }) => {
    if (list.length === 0) return null
    return (
      <>
        <div className="section-title" style={{ padding: '8px 16px' }}>{title}</div>
        <div style={{ padding: '0 16px', marginBottom: 16 }}>
          <div className="card">
            {list.map(po => {
              const meta  = STATUS_META[po.status] || STATUS_META.draft
              const total = poGrandTotal(po.lines)
              const count = (po.lines || []).length
              return (
                <div key={po.id} className="component-item" onClick={() => onOpen(po)}>
                  <div className="component-avatar">🧾</div>
                  <div className="component-info">
                    <div className="component-name">{po.supplier?.name || 'No supplier'}</div>
                    <div className="component-sub">
                      {poDisplayNumber(po)} · {formatDate(po.created_at)}
                      {count > 0 && ` · ${count} item${count !== 1 ? 's' : ''}`}
                    </div>
                  </div>
                  <div className="component-right">
                    <div className="component-cost">${fmtMoney(total)}</div>
                  </div>
                  <span className={`pill ${meta.pill}`}>{meta.label}</span>
                  <ChevronRightIcon size={16} color="var(--warm-200)" style={{ flexShrink: 0 }} />
                </div>
              )
            })}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="header">
        <div className="header-title">Purchase Orders</div>
      </div>

      <div className="scroll-area">
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{
            background: 'var(--accent-dark)', color: '#fff',
            borderRadius: 'var(--radius)', padding: '14px 18px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7, marginBottom: 4 }}>
                Outstanding Orders
              </div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>${fmtMoney(outstandingValue)}</div>
            </div>
            <div style={{ textAlign: 'right', opacity: 0.75, fontSize: 12 }}>
              {draft.length} draft · {sent.length} sent
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <Section title="Draft"     list={draft} />
          <Section title="Sent"      list={sent} />
          <Section title="Received"  list={received} />
          <Section title="Cancelled" list={cancelled} />
        </div>

        {purchaseOrders.length === 0 && (
          <div style={{ padding: '0 16px' }}>
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon">🧾</div>
                <div className="empty-title">No purchase orders yet</div>
                <div className="empty-desc">Tap + to reorder stock from a supplier</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <button className="fab" onClick={onNew}><PlusIcon size={26} /></button>
    </>
  )
}
