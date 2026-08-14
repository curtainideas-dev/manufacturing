import { useState, useMemo } from 'react'
import { PlusIcon, ChevronRightIcon } from '../components/Icons'

const TYPES = [
  { val: 'track', label: 'Tracks', blank: 'No tracks yet',  hint: 'A track product is just its profile code — TCO51' },
  { val: 'blind', label: 'Blinds', blank: 'No blinds yet',  hint: 'A blind product is a fabric category — Bancoora' },
]

export default function ProductList({ products, onOpen, onNew, onOpenOptions }) {
  const [type, setType]     = useState('track')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => products.filter(p =>
    (p.product_type || 'track') === type &&
    (!search || String(p.name).toLowerCase().includes(search.toLowerCase()))
  ), [products, type, search])

  const meta = TYPES.find(t => t.val === type)
  const countOf = t => products.filter(p => (p.product_type || 'track') === t).length

  return (
    <>
      <div className="header">
        <div className="header-title">Products</div>
        <div className="header-actions">
          <button onClick={onOpenOptions} style={{
            padding: '6px 12px', fontSize: 13, fontWeight: 600,
            background: 'rgba(255,255,255,0.15)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer',
          }}>🎛️ Options</button>
        </div>
      </div>

      <div className="scroll-area">
        <div style={{ padding: 16 }}>

          <div style={{ display: 'flex', background: 'var(--warm-100)', borderRadius: 9, padding: 3, marginBottom: 14 }}>
            {TYPES.map(t => (
              <button key={t.val} onClick={() => setType(t.val)}
                style={{
                  flex: 1, border: 'none', padding: 9, borderRadius: 7, cursor: 'pointer',
                  fontSize: 13.5, fontWeight: 600,
                  background: type === t.val ? '#fff' : 'transparent',
                  color: type === t.val ? 'var(--accent-dark)' : 'var(--warm-300)',
                  boxShadow: type === t.val ? 'var(--shadow-sm)' : 'none',
                }}>
                {t.label} ({countOf(t.val)})
              </button>
            ))}
          </div>

          <input className="field-input" placeholder={`Search ${meta.label.toLowerCase()}…`}
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ fontSize: 14, marginBottom: 14 }} />

          {filtered.length === 0 ? (
            <div className="card">
              <div className="empty-state" style={{ padding: '32px 20px' }}>
                <div className="empty-icon" style={{ fontSize: 32 }}>🔩</div>
                <div className="empty-title" style={{ fontSize: 17 }}>
                  {search ? 'Nothing matches' : meta.blank}
                </div>
                <div className="empty-desc">{search ? 'Try a different search' : meta.hint}</div>
              </div>
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 14 }}>
              {filtered.map(p => (
                <div key={p.id} className="component-item" onClick={() => onOpen(p)}>
                  <div className="component-avatar">🔩</div>
                  <div className="component-info">
                    <div className="component-name">{p.name}</div>
                    <div className="component-sub">
                      {p.component_count ?? 0} recipe line{p.component_count !== 1 ? 's' : ''}
                      {p.fabric_category ? ` · ${p.fabric_category}` : ''}
                    </div>
                  </div>
                  <ChevronRightIcon size={16} color="var(--warm-200)" style={{ flexShrink: 0 }} />
                </div>
              ))}
            </div>
          )}

          <button className="btn btn-primary btn-block" onClick={() => onNew(type)}>
            <PlusIcon size={16} /> New {type === 'track' ? 'track' : 'blind'}
          </button>

          <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 12, lineHeight: 1.5 }}>
            {meta.hint}. Everything else — fixing, opening, colour — is answered per window,
            so one product covers every combination.
          </div>
        </div>
      </div>
    </>
  )
}
