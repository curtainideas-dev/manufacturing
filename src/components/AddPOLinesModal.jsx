import { useState, useEffect, useMemo } from 'react'
import { XIcon } from './Icons'
import { orderUnitInfo, suggestReorderQty, poLineKey } from '../lib/poEngine'
import { orderableWidths } from '../lib/fabricEngine'

/**
 * Pick items to add to a draft purchase order — components linked to the
 * order's supplier, expanded one row per colour variant, with a suggested
 * reorder quantity pre-filled from how far each is below its stock minimum.
 *
 * Fabric is the exception to "a quantity of order units". It is bought as a
 * cut length — so many metres off a roll of a chosen width — so a fabric row
 * asks for the width as well, and its quantity is metres. The price follows
 * the width, because the supplier's rate is per square metre.
 */
export default function AddPOLinesModal({ open, supplier, components, stockMap, existingKeys, onClose, onAdd, adding }) {
  const [search, setSearch]   = useState('')
  const [checked, setChecked] = useState({})
  const [qtys, setQtys]       = useState({})
  const [widths, setWidths]   = useState({})   // row key -> roll width, fabric only

  // The widths a row can be ordered in; empty for anything that isn't a
  // fabric with widths on file, which is ordered the old way.
  const widthsFor = (r) => r.component.order_type === 'fabric' ? orderableWidths(r.component) : []
  const widthOf   = (r) => {
    const list = widthsFor(r)
    if (list.length === 0) return null
    return Number(widths[r.key]) || list[list.length - 1]
  }
  // Already on the order — at this width, for a fabric.
  const isOnOrder = (r) => existingKeys?.has(poLineKey(r.component.id, r.colour_variant, widthOf(r)))

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
    setWidths({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supplier?.id])

  const filtered = rows.filter(r => !search || r.component.name.toLowerCase().includes(search.toLowerCase()))

  const toggle = (key) => setChecked(c => ({ ...c, [key]: !c[key] }))
  const setQty = (key, v) => setQtys(q => ({ ...q, [key]: v }))

  const selectedRows = rows.filter(r => checked[r.key] && Number(qtys[r.key]) > 0 && !isOnOrder(r))

  const handleAdd = () => {
    const lines = selectedRows.map(r => {
      const width = widthOf(r)
      const info  = orderUnitInfo(r.component, supplier, width)
      return {
        component_id:   r.component.id,
        colour_variant: r.colour_variant || null,
        qty_ordered:    Number(qtys[r.key]) || 0,
        unit_cost:      info.price,
        // Only sent for a cut length, so every other line is exactly the row
        // it always was.
        ...(width ? { roll_width_mm: width } : {}),
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
            const already   = isOnOrder(r)
            const rowWidths = widthsFor(r)
            const width     = widthOf(r)
            const info      = orderUnitInfo(r.component, supplier, width)
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
                    {already
                      ? (width ? 'Already on this order at this width' : 'Already on this order')
                      : `$${info.price.toFixed(2)} per ${info.label}${width ? ` at ${width.toLocaleString()}mm wide` : ''}`}
                  </div>
                </div>
                {rowWidths.length > 0 && (
                  <select className="field-input" value={width}
                    disabled={!checked[r.key]}
                    onChange={e => setWidths(w => ({ ...w, [r.key]: Number(e.target.value) }))}
                    title="Roll width to order"
                    style={{ width: 104, padding: '6px 8px', fontSize: 13, opacity: checked[r.key] ? 1 : 0.45 }}>
                    {rowWidths.map(w => <option key={w} value={w}>{w.toLocaleString()}mm</option>)}
                  </select>
                )}
                <input type="number" step={width ? '0.1' : '1'} min={width ? '0.1' : '1'} value={qtys[r.key] ?? 1}
                  disabled={already || !checked[r.key]}
                  onChange={e => setQty(r.key, e.target.value)}
                  className="field-input"
                  title={width ? 'Metres' : undefined}
                  style={{ width: 64, textAlign: 'right', padding: '6px 8px', fontSize: 14, opacity: (already || !checked[r.key]) ? 0.45 : 1 }} />
                {width && <span style={{ fontSize: 12, color: 'var(--warm-300)', marginLeft: -4 }}>m</span>}
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
