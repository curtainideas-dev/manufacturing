import { useState, useEffect, useMemo } from 'react'
import { XIcon } from './Icons'
import { getStock } from '../lib/stockEngine'

/**
 * Component picker for stock labels (93 x 29mm DK). Lists pack + bar
 * components (labour has no physical stock to label), one row per
 * component + colour combination. Ticked rows print one label each.
 */
export default function ComponentLabelsModal({ open, components, suppliers, stockMap, onClose, onPrint, printing }) {
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState({})

  useEffect(() => {
    if (open) {
      setSearch('')
      setSelected({})
    }
  }, [open])

  const supplierName = (c) => {
    if (c.supplier_id) return suppliers.find(s => s.id === c.supplier_id)?.name || c.supplier || ''
    return c.supplier || ''
  }

  const rows = useMemo(() => {
    const list = components.filter(c => c.order_type !== 'labour')
    const q = search.trim().toLowerCase()
    const filtered = !q ? list : list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.supplier_pn || '').toLowerCase().includes(q) ||
      supplierName(c).toLowerCase().includes(q)
    )
    const out = []
    filtered.forEach(c => {
      const variants = c.colour_variants || []
      const group = variants.length > 0 ? variants : [null]
      group.forEach(v => {
        const suffix   = v?.suffix || ''
        const basePn   = c.supplier_pn || ''
        const partNumber = basePn && suffix ? `${basePn}-${suffix}` : (basePn || suffix)
        const stock    = getStock(stockMap, c, v)
        out.push({
          key: `${c.id}__${suffix}`,
          name: c.name,
          colour: v?.name || '',
          partNumber,
          supplier: supplierName(c),
          unit: c.unit,
          minQty: Number(stock?.qty_minimum) || 0,
          orderType: c.order_type,
        })
      })
    })
    return out
  }, [components, suppliers, stockMap, search])

  const barSection  = rows.filter(r => r.orderType === 'bar')
  const packSection = rows.filter(r => r.orderType !== 'bar')

  const toggle = (key) => setSelected(s => ({ ...s, [key]: !s[key] }))
  const selectedRows = rows.filter(r => selected[r.key])

  const Section = ({ title, list }) => list.length === 0 ? null : (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--warm-300)', padding: '6px 0',
      }}>{title}</div>
      {list.map(r => (
        <label key={r.key} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 0', borderBottom: '1px solid var(--warm-100)', cursor: 'pointer',
        }}>
          <input type="checkbox" checked={!!selected[r.key]} onChange={() => toggle(r.key)}
            style={{ width: 18, height: 18, flexShrink: 0, accentColor: 'var(--accent)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {r.name}{r.colour && <span style={{ fontWeight: 400, color: 'var(--warm-300)' }}> · {r.colour}</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--warm-300)', fontFamily: 'monospace' }}>
              {r.partNumber || '—'}
            </div>
          </div>
        </label>
      ))}
    </div>
  )

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div className="modal-title">Print component labels</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <div style={{ fontSize: 12, color: 'var(--warm-300)', marginBottom: 10 }}>
            Tick the components to label — one 93 x 29mm sticker per component/colour.
          </div>
          <input className="field-input" placeholder="Search name, supplier or part no..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ fontSize: 14, marginBottom: 8 }} />

          {rows.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 20px' }}>
              <div className="empty-desc">No components found.</div>
            </div>
          ) : (
            <>
              <Section title="Tracks & tubes" list={barSection} />
              <Section title="Components" list={packSection} />
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }}
            disabled={printing || selectedRows.length === 0}
            onClick={() => onPrint(selectedRows)}>
            {printing ? 'Generating…' : `Print ${selectedRows.length} label${selectedRows.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
