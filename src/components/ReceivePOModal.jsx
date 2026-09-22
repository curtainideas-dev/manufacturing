import { useState, useEffect } from 'react'
import { XIcon, CheckIcon } from './Icons'
import { displayPN, orderUnitInfo, outstandingQty, receivedToStockQty } from '../lib/poEngine'
import { orderableWidths } from '../lib/fabricEngine'

/**
 * Book a delivery in against its order.
 *
 * An order arriving all at once is the exception, so this is per LINE: tick
 * what turned up, correct the quantity where it differs from what was ordered,
 * and only that goes onto the shelf. What is still owed stays on the order.
 *
 * The quantity is in ORDER units, matching the order itself — you count boxes
 * and bars off a delivery docket, not metres. What that becomes in stock is
 * shown beside it, because the two are not the same number and assuming they
 * are is the unit mistake this app has made before: three packs of a 50m
 * spline is 150 metres, not three.
 *
 * Fabric is the exception that arithmetic cannot cover. A roll's width and
 * length are facts about the roll that only the delivery knows, and stock
 * holds each roll as its own piece — so a fabric line asks for them per roll
 * rather than inventing them.
 */
export default function ReceivePOModal({ open, po, lines = [], onClose, onReceive, saving }) {
  const [picked, setPicked] = useState({})   // lineId -> true
  const [qtys,   setQtys]   = useState({})   // lineId -> order units
  const [rolls,  setRolls]  = useState({})   // lineId -> [{ width_mm, length_mm }]

  const open_ = open && !!po

  useEffect(() => {
    if (!open_) return
    const p = {}, q = {}, r = {}
    lines.forEach(l => {
      const out = outstandingQty(l)
      p[l.id] = out > 0          // everything still owed is ticked by default
      q[l.id] = out
      if (l.component?.order_type === 'fabric') {
        const w = orderableWidths(l.component)
        r[l.id] = Array.from({ length: Math.max(0, Math.round(out)) }, () => ({
          width_mm: w[w.length - 1] || '', length_mm: '',
        }))
      }
    })
    setPicked(p); setQtys(q); setRolls(r)
  }, [open_, po?.id, lines])

  if (!open_) return null

  const setQty = (id, v) => {
    setQtys(s => ({ ...s, [id]: v }))
    // Keep the roll rows in step with how many rolls are said to have arrived.
    setRolls(s => {
      if (!s[id]) return s
      const n = Math.max(0, Math.round(Number(v) || 0))
      const cur = s[id]
      const next = Array.from({ length: n }, (_, i) => cur[i] || { width_mm: cur[0]?.width_mm || '', length_mm: '' })
      return { ...s, [id]: next }
    })
  }

  const setRoll = (id, i, patch) => setRolls(s => ({
    ...s, [id]: (s[id] || []).map((r, n) => n === i ? { ...r, ...patch } : r),
  }))

  const lineReady = (l) => {
    if (!picked[l.id]) return false
    const q = Number(qtys[l.id]) || 0
    if (q <= 0) return false
    if (l.component?.order_type !== 'fabric') return true
    // Every roll needs real dimensions or the piece is unusable in stock.
    return (rolls[l.id] || []).every(r => Number(r.width_mm) > 0 && Number(r.length_mm) > 0)
  }

  const ready      = lines.filter(lineReady)
  const incomplete = lines.filter(l => picked[l.id] && !lineReady(l))

  const handleReceive = () => onReceive(ready.map(l => ({
    line:  l,
    qty:   Number(qtys[l.id]) || 0,
    rolls: l.component?.order_type === 'fabric'
      ? (rolls[l.id] || []).map(r => ({
          roll_width_mm: Math.round(Number(r.width_mm)),
          length_mm:     Math.round(Number(r.length_mm)),
        }))
      : null,
  })))

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <div>
            <div className="modal-title">Receive Delivery</div>
            <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>
              {po.supplier?.name || 'Supplier'} · tick what turned up
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div style={{ maxHeight: '62vh', overflowY: 'auto' }}>
          {lines.map(l => {
            const out      = outstandingQty(l)
            const done     = out <= 0
            const info     = l.component ? orderUnitInfo(l.component) : null
            const isFabric = l.component?.order_type === 'fabric'
            const qty      = Number(qtys[l.id]) || 0
            const toStock  = l.component ? receivedToStockQty(l.component, qty) : 0
            const on       = !!picked[l.id]

            return (
              <div key={l.id} style={{
                padding: '12px 20px', borderBottom: '1px solid var(--warm-100)',
                background: done ? '#f0fdf4' : on ? 'var(--success-bg)' : '#fff',
                opacity: done ? 0.75 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={() => !done && setPicked(s => ({ ...s, [l.id]: !s[l.id] }))}
                    disabled={done}
                    style={{
                      width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                      border: `2px solid ${(on || done) ? 'var(--success)' : 'var(--warm-200)'}`,
                      background: (on || done) ? 'var(--success)' : '#fff',
                      cursor: done ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    {(on || done) && <CheckIcon size={13} color="#fff" />}
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {l.component?.name || 'Component removed'}
                      {l.colour_variant?.name && (
                        <span style={{ fontSize: 12, color: 'var(--warm-300)', fontWeight: 400, marginLeft: 6 }}>
                          · {l.colour_variant.name}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 2 }}>
                      {displayPN(l.component, l.colour_variant)}
                      {info ? ` · per ${info.label}` : ''}
                      {' · '}
                      {done
                        ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>all {l.qty_ordered} received</span>
                        : <>ordered {l.qty_ordered}
                            {Number(l.qty_received) > 0 && `, ${l.qty_received} in`}
                            , <strong style={{ color: 'var(--ink)' }}>{out} outstanding</strong></>}
                    </div>
                  </div>

                  {!done && (
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--warm-300)', display: 'block', marginBottom: 2 }}>
                        Arrived
                      </label>
                      <input className="field-input" type="number" step="1" min="0"
                        value={qtys[l.id] ?? ''}
                        onFocus={e => e.target.select()}
                        onChange={e => setQty(l.id, e.target.value)}
                        disabled={!on}
                        style={{ width: 72, padding: '5px 8px', fontSize: 14, textAlign: 'right', fontWeight: 700 }} />
                    </div>
                  )}
                </div>

                {/* What it becomes on the shelf — a different number from the
                    one above whenever a pack holds more than one. */}
                {on && !done && !isFabric && qty > 0 && (
                  <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 6, marginLeft: 38 }}>
                    → adds <strong style={{ color: 'var(--ink)' }}>
                      {Number(toStock).toLocaleString()} {l.component?.order_type === 'bar' ? 'bars' : (l.component?.unit || 'each')}
                    </strong> to stock
                    {l.component?.order_type === 'pack' && Number(l.component?.pack_qty) > 1 &&
                      ` (${qty} × ${l.component.pack_qty})`}
                  </div>
                )}

                {/* Fabric: each roll, as it physically arrived. */}
                {on && !done && isFabric && (
                  <div style={{ marginTop: 8, marginLeft: 38 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginBottom: 6 }}>
                      Each roll goes on the shelf as its own piece — give the width and length that came.
                    </div>
                    {(rolls[l.id] || []).map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11.5, color: 'var(--warm-300)', width: 44 }}>Roll {i + 1}</span>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input className="field-input" type="number" min="1" placeholder="width"
                            style={{ fontSize: 13, paddingRight: 34, textAlign: 'right' }}
                            value={r.width_mm}
                            onChange={e => setRoll(l.id, i, { width_mm: e.target.value })} />
                          <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--warm-300)', pointerEvents: 'none' }}>mm</span>
                        </div>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input className="field-input" type="number" min="1" placeholder="length"
                            style={{ fontSize: 13, paddingRight: 34, textAlign: 'right' }}
                            value={r.length_mm}
                            onChange={e => setRoll(l.id, i, { length_mm: e.target.value })} />
                          <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--warm-300)', pointerEvents: 'none' }}>mm</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--warm-100)', background: 'var(--warm-100)' }}>
          {incomplete.length > 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--warning)', marginBottom: 8, lineHeight: 1.5 }}>
              {incomplete.length} ticked line{incomplete.length !== 1 ? 's need' : ' needs'} a quantity
              {incomplete.some(l => l.component?.order_type === 'fabric') ? ' or roll sizes' : ''} before it can be booked in.
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--warm-300)', marginBottom: 10 }}>
            {ready.length} line{ready.length !== 1 ? 's' : ''} ready ·{' '}
            {lines.filter(l => outstandingQty(l) > 0).length - ready.length} left outstanding
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 2 }}
              onClick={handleReceive} disabled={saving || ready.length === 0}>
              {saving ? 'Booking in…' : `Receive ${ready.length} Line${ready.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
