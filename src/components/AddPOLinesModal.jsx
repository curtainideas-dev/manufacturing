import { useState, useEffect, useMemo } from 'react'
import { XIcon } from './Icons'
import { orderUnitInfo, suggestReorderQty } from '../lib/poEngine'

/**
 * Pick items to add to a draft purchase order — components linked to the
 * order's supplier, expanded one row per colour variant, with a suggested
 * reorder quantity pre-filled from how far each is below its stock minimum.
 */
export default function AddPOLinesModal({ open, supplier, components, stockMap, existingKeys, onClose, onAdd, adding }) {
  const [search, setSearch]   = useState('')
  const [checked, setChecked] = useState({})
  const [qtys, setQtys]       = useState({})

  const rows = useMemo(() => {
    if (!supplier) return []
    const list = components.filter(c => c.supplier_id === supplier.id && c.order_type !== 'labour')
    const out = []
    list.forEach(c => {
      const variants = (c.colour_variants || []).length > 0 ? c.colour_variants : [null]
      variants.forEach(v => out.push({ key: `${c.id}__${v?.suffix || ''}`, component: c, colour_variant: v }))
    })
    return out.sort((a, b) => a.component.name.localeCompare(b.component.name))
  }, [supplier, components])

  useEffect(() => {
    if (!open) return
    setSearch('')
    const initChecked = {}, initQty = {}
    rows.forEach(r => {
      initChecked[r.key] = false
      initQty[r.key] = suggestReorderQty(r.component, r.colour_variant, stockMap)
    })
    setChecked(initChecked)
    setQtys(initQty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supplier?.id])

  const filtered = rows.filter(r => !search || r.component.name.toLowerCase().includes(search.toLowerCase()))

  const toggle = (key) => setChecked(c => ({ ...c, [key]: !c[key] }))
  const setQty = (key, v) => setQtys(q => ({ ...q, [key]: v }))

  const selectedRows = rows.filter(r => checked[r.key] && Number(qtys[r.key]) > 0 && !existingKeys?.has(r.key))

  const handleAdd = () => {
    const lines = selectedRows.map(r => {
      const info = orderUnitInfo(r.component)
      return {
        component_id:   r.component.id,
        colour_variant: r.colour_variant || null,
        qty_ordered:    Number(qtys[r.key]) || 0,
        unit_cost:      info.price,
      }
    })
    onAdd(lines)
  }

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div className="modal-title">Add Items{supplier ? ` — ${supplier.name}` : ''}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          <input className="field-input" placeholder="Search components..."
            value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 12 }} />

          {filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 20px' }}>
              <div className="empty-desc">
                {rows.length === 0 ? 'This supplier has no components linked yet.' : 'No matches.'}
              </div>
            </div>
          ) : filtered.map(r => {
            const already = existingKeys?.has(r.key)
            const info = orderUnitInfo(r.component)
            return (
              <div key={r.key} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 0', borderBottom: '1px solid var(--warm-100)',
                opacity: already ? 0.4 : 1,
              }}>
                <input type="checkbox" checked={!!checked[r.key]} disabled={already}
                  onChange={() => toggle(r.key)}
                  style={{ width: 18, height: 18, flexShrink: 0, accentColor: 'var(--accent)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {r.component.name}{r.colour_variant ? ` · ${r.colour_variant.name}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--warm-300)' }}>
                    {already ? 'Already on this order' : `$${info.price.toFixed(2)} per ${info.label}`}
                  </div>
                </div>
                <input type="number" step="1" min="1" value={qtys[r.key] ?? 1}
                  disabled={already || !checked[r.key]}
                  onChange={e => setQty(r.key, e.target.value)}
                  className="field-input"
                  style={{ width: 64, textAlign: 'right', padding: '6px 8px', fontSize: 14, opacity: (already || !checked[r.key]) ? 0.45 : 1 }} />
              </div>
            )
          })}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }}
            disabled={adding || selectedRows.length === 0}
            onClick={handleAdd}>
            {adding ? 'Adding...' : `Add ${selectedRows.length} item${selectedRows.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
