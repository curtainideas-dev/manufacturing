import { useState, useMemo } from 'react'
import { XIcon, CheckIcon } from './Icons'
import { SEGMENTS, NONE, parseProductName, matchesSegments, optionsForSegment } from '../lib/productName'

const DEFAULT = { label: '', product_id: '', width_mm: '', drop_mm: '' }
const NO_FILTERS = ['', '', '', '', '']

export default function AddWindowModal({ open, windowNumber, products, onClose, onAdd }) {
  const [form, setForm]       = useState(DEFAULT)
  const [filters, setFilters] = useState(NO_FILTERS)
  const [search, setSearch]   = useState('')
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const matchesSearch = (p) =>
    !search || String(p.name).toLowerCase().includes(search.toLowerCase())

  const filtered = useMemo(
    () => products.filter(p => matchesSegments(p, filters) && matchesSearch(p)),
    [products, filters, search]
  )

  const optionsFor = (idx) => optionsForSegment(products, filters, idx, matchesSearch)
  const activeCount = filters.filter(Boolean).length

  const handleAdd = () => {
    if (!form.product_id || !form.width_mm || !form.drop_mm) return
    onAdd({ ...form, label: form.label || `Window ${windowNumber}` })
    setForm(DEFAULT)
    setFilters(NO_FILTERS)
    setSearch('')
    onClose()
  }

  const handleClose = () => {
    setFilters(NO_FILTERS)
    setSearch('')
    onClose()
  }

  if (!open) return null

  const selected = products.find(p => p.id === form.product_id)

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div className="modal-title">Add Window</div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>
        <div className="modal-body">

          <div className="field">
            <label className="field-label">Label (optional)</label>
            <input className="field-input" value={form.label}
              onChange={e => set('label', e.target.value)}
              placeholder={`Window ${windowNumber}`} />
          </div>

          {/* Product picker — filter by the naming-convention segments, then
              tap to select. Scales as the product list grows. */}
          <div className="field">
            <label className="field-label">
              Product
              {selected && <span style={{ color: 'var(--accent)', marginLeft: 8, fontWeight: 400 }}>{selected.name}</span>}
            </label>

            <input className="field-input" placeholder="Search products..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ fontSize: 13, marginBottom: 8 }} />

            <div style={{
              display: 'grid', gap: 6,
              gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
              marginBottom: 8,
            }}>
              {SEGMENTS.map(seg => {
                const { values, hasBlank } = optionsFor(seg.idx)
                const active = !!filters[seg.idx]
                return (
                  <select key={seg.idx}
                    className="field-input"
                    value={filters[seg.idx]}
                    onChange={e => setFilters(f => f.map((v, i) => (i === seg.idx ? e.target.value : v)))}
                    title={seg.label}
                    style={{
                      fontSize: 12, padding: '6px 8px',
                      borderColor: active ? 'var(--accent)' : undefined,
                      background: active ? 'var(--accent-bg)' : undefined,
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    <option value="">{seg.label}</option>
                    {values.map(v => <option key={v} value={v}>{v}</option>)}
                    {hasBlank && <option value={NONE}>— none —</option>}
                  </select>
                )
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--warm-300)' }}>
                {filtered.length} of {products.length} products
              </span>
              {(activeCount > 0 || search) && (
                <button onClick={() => { setFilters(NO_FILTERS); setSearch('') }}
                  style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Clear filters
                </button>
              )}
            </div>

            <div style={{
              border: '1px solid var(--warm-200)', borderRadius: 'var(--radius-sm)',
              maxHeight: 220, overflowY: 'auto', background: '#fff',
            }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 13, color: 'var(--warm-300)' }}>
                  No products match
                </div>
              ) : filtered.map(p => {
                const isSel = p.id === form.product_id
                const parts = parseProductName(p.name).filter(Boolean)
                return (
                  <button key={p.id} type="button" onClick={() => set('product_id', p.id)}
                    style={{
                      width: '100%', textAlign: 'left', cursor: 'pointer',
                      padding: '10px 12px', border: 'none',
                      borderBottom: '1px solid var(--warm-100)',
                      background: isSel ? 'var(--accent-bg)' : '#fff',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      border: `2px solid ${isSel ? 'var(--accent)' : 'var(--warm-200)'}`,
                      background: isSel ? 'var(--accent)' : '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSel && <CheckIcon size={12} color="#fff" />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: isSel ? 700 : 600, color: isSel ? 'var(--accent-dark)' : 'var(--ink)' }}>
                        {parts.join(' · ') || p.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 1 }}>
                        {p.component_count ?? 0} component{p.component_count !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid-2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Width (mm)</label>
              <input className="field-input" type="number" value={form.width_mm}
                onChange={e => set('width_mm', e.target.value)}
                placeholder="e.g. 1800" style={{ textAlign: 'right' }} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Drop (mm)</label>
              <input className="field-input" type="number" value={form.drop_mm}
                onChange={e => set('drop_mm', e.target.value)}
                placeholder="e.g. 2100" style={{ textAlign: 'right' }} />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handleClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleAdd}
            disabled={!form.product_id || !form.width_mm || !form.drop_mm}>
            Add Window
          </button>
        </div>
      </div>
    </div>
  )
}
