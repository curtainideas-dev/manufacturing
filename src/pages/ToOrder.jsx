import { useState, useMemo } from 'react'
import { poDisplayNumber, openPOFor } from '../lib/poEngine'
import InfoTip from '../components/InfoTip'

/**
 * Everything at or below its minimum, by supplier, ready to put on an order.
 *
 * Each supplier's lines go onto that supplier's open draft order when there is
 * one — the same draft "+ PO" on the stock page and Order fabric on a job add
 * to — so there's never more than one draft per supplier to send. Anything
 * already on its way shows as on order, and its suggested quantity accounts
 * for it.
 */
export default function ToOrder({ items = [], suppliers = [], purchaseOrders = [], onAdd, onOpenPO, adding }) {
  const [qty, setQty]   = useState({})       // key -> typed qty
  const [skip, setSkip] = useState({})       // key -> true when unticked

  const groups = useMemo(() => {
    const map = new Map()
    items.forEach(it => {
      const id = it.supplier_id || 'none'
      if (!map.has(id)) map.set(id, [])
      map.get(id).push(it)
    })
    return [...map.entries()]
      .map(([id, rows]) => ({ id, supplier: suppliers.find(s => s.id === id) || null, rows }))
      .sort((a, b) => (a.supplier?.name || 'zzz').localeCompare(b.supplier?.name || 'zzz'))
  }, [items, suppliers])

  const qtyOf = (it) => qty[it.key] ?? String(it.suggested)
  const ticked = (it) => !skip[it.key] && Number(qtyOf(it)) > 0

  return (
    <>
      <div className="header">
        <div className="header-title">To order</div>
      </div>
      <div className="scroll-area">
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--warm-300)', marginBottom: 14, display: 'flex', alignItems: 'center' }}>
            {items.length} part{items.length !== 1 ? 's' : ''} at or below minimum
            <InfoTip>
              A part shows here when it has a minimum set on the stock page and what's on the shelf is at
              or below it. The suggested quantity takes it back above the minimum, counting anything
              already on a draft or sent order.
            </InfoTip>
          </div>

          {items.length === 0 && (
            <div className="card"><div className="empty-state">
              <div className="empty-icon">✅</div>
              <div className="empty-title">Nothing to order</div>
              <div className="empty-desc">Every part with a minimum is above it.</div>
            </div></div>
          )}

          {groups.map(g => {
            const draft = g.supplier ? openPOFor(purchaseOrders, g.supplier.id) : null
            const chosen = g.rows.filter(ticked)
            return (
              <div key={g.id} className="card" style={{ marginBottom: 16, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--warm-100)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{g.supplier?.name || 'No supplier set'}</div>
                    <div style={{ fontSize: 12, color: 'var(--warm-300)' }}>
                      {!g.supplier ? 'Set a supplier on these parts to order them.'
                        : draft ? <>Adds to draft <button className="link-btn" onClick={() => onOpenPO(draft)}>{poDisplayNumber(draft)}</button></>
                        : 'Starts a new draft order'}
                    </div>
                  </div>
                  {g.supplier && (
                    <button className="btn btn-primary btn-sm" disabled={adding || chosen.length === 0}
                      onClick={() => onAdd(g.supplier.id, chosen.map(it => ({
                        component: it.component, colour_variant: it.colour_variant, qty: Number(qtyOf(it)),
                      })))}>
                      {adding ? 'Adding…' : `Add ${chosen.length} to order`}
                    </button>
                  )}
                </div>
                <table className="window-grid">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }} />
                      <th>Part</th>
                      <th style={{ textAlign: 'right' }}>On hand</th>
                      <th style={{ textAlign: 'right' }}>Minimum</th>
                      <th>On order</th>
                      <th style={{ width: 150 }}>Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map(it => (
                      <tr key={it.key} style={{ opacity: ticked(it) ? 1 : 0.55 }}>
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={!skip[it.key]} disabled={!g.supplier}
                            onChange={() => setSkip(s => ({ ...s, [it.key]: !s[it.key] }))}
                            aria-label={`Order ${it.component.name}`} style={{ width: 16, height: 16 }} />
                        </td>
                        <td>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{it.component.name}</div>
                          {it.colour_variant?.name && <div style={{ fontSize: 11.5, color: 'var(--warm-300)' }}>{it.colour_variant.name}</div>}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: it.onHand < 0 ? 'var(--danger)' : 'var(--warning)' }}>
                          {it.onHand}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 13, color: 'var(--warm-300)' }}>{it.minimum}</td>
                        <td style={{ fontSize: 12 }}>
                          {it.orders.length === 0 ? <span style={{ color: 'var(--warm-200)' }}>—</span>
                            : it.orders.map(o => (
                              <div key={o.po.id}>
                                {o.qty} on <button className="link-btn" onClick={() => onOpenPO(o.po)}>{poDisplayNumber(o.po)}</button>
                                <span style={{ color: 'var(--warm-300)' }}> ({o.po.status})</span>
                              </div>
                            ))}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input className="field-input" type="number" min="0" step="1"
                              style={{ padding: '5px 8px', fontSize: 13, width: 70, textAlign: 'right' }}
                              value={qtyOf(it)} disabled={!g.supplier}
                              onChange={e => setQty(q => ({ ...q, [it.key]: e.target.value }))} />
                            <span style={{ fontSize: 11.5, color: 'var(--warm-300)' }}>{it.orderUnit}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
