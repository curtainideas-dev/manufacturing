import { useState, useMemo } from 'react'
import { PlusIcon, ChevronRightIcon } from '../components/Icons'
import { SEGMENTS, NONE, parseProductName, matchesSegments, optionsForSegment } from '../lib/productName'

export default function ProductList({ products, onOpen, onNew }) {
  // One selected value per segment; '' means "any"
  const [filters, setFilters] = useState(['', '', '', '', ''])
  const [search, setSearch]   = useState('')

  const setFilter = (idx, val) =>
    setFilters(f => f.map((v, i) => (i === idx ? val : v)))

  const clearAll = () => { setFilters(['', '', '', '', '']); setSearch('') }

  const matchesSearch = (p) =>
    !search || String(p.name).toLowerCase().includes(search.toLowerCase())

  const filtered = useMemo(
    () => products.filter(p => matchesSegments(p, filters) && matchesSearch(p)),
    [products, filters, search]
  )

  const optionsFor = (idx) => optionsForSegment(products, filters, idx, matchesSearch)

  const activeCount = filters.filter(Boolean).length

  return (
    <>
      <div className="header">
        <div className="header-title">Products</div>
      </div>

      <div className="scroll-area">
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-val">{products.length}</div>
            <div className="summary-lbl">Products</div>
          </div>
          <div className="summary-card">
            <div className="summary-val">{filtered.length}</div>
            <div className="summary-lbl">Matching</div>
          </div>
        </div>

        {/* Search + segment filters */}
        <div style={{ padding: '0 16px 12px' }}>
          <input className="field-input" placeholder="Search product name..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ fontSize: 14, marginBottom: 10 }} />

          <div style={{
            display: 'grid', gap: 8,
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          }}>
            {SEGMENTS.map(seg => {
              const { values, hasBlank } = optionsFor(seg.idx)
              const active = !!filters[seg.idx]
              return (
                <div key={seg.idx}>
                  <label className="field-label" style={{ fontSize: 10 }}>{seg.label}</label>
                  <select
                    className="field-input"
                    value={filters[seg.idx]}
                    onChange={e => setFilter(seg.idx, e.target.value)}
                    style={{
                      fontSize: 13, padding: '8px 10px',
                      borderColor: active ? 'var(--accent)' : undefined,
                      background: active ? 'var(--accent-bg)' : undefined,
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    <option value="">Any</option>
                    {values.map(v => <option key={v} value={v}>{v}</option>)}
                    {hasBlank && <option value={NONE}>— none —</option>}
                  </select>
                </div>
              )
            })}
          </div>

          {(activeCount > 0 || search) && (
            <button
              onClick={clearAll}
              style={{
                marginTop: 10, padding: '6px 12px', fontSize: 12, fontWeight: 600,
                background: 'var(--warm-100)', color: 'var(--ink)',
                border: '1px solid var(--warm-200)', borderRadius: 8, cursor: 'pointer',
              }}>
              Clear filters{activeCount > 0 ? ` (${activeCount})` : ''}
            </button>
          )}
        </div>

        <div style={{ padding: '0 16px' }}>
          <div className="card">
            {products.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🔩</div>
                <div className="empty-title">No products yet</div>
                <div className="empty-desc">Tap + to create your first product and build its component recipe</div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🔍</div>
                <div className="empty-title">No matches</div>
                <div className="empty-desc">No product matches these filters</div>
              </div>
            ) : filtered.map(p => {
              const parts = parseProductName(p.name)
              return (
                <div key={p.id} className="component-item" onClick={() => onOpen(p)}>
                  <div className="component-avatar">{p.category === 'track' ? '🔩' : '🪟'}</div>
                  <div className="component-info">
                    <div className="component-name">{p.name}</div>
                    <div className="component-sub">
                      {parts.length > 1
                        ? SEGMENTS.filter(s => parts[s.idx]).map(s => `${s.label}: ${parts[s.idx]}`).join(' · ')
                        : p.category.charAt(0).toUpperCase() + p.category.slice(1)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 2 }}>
                      {p.component_count ?? 0} component{p.component_count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <ChevronRightIcon size={16} color="var(--warm-200)" style={{ flexShrink: 0 }} />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <button className="fab" onClick={onNew}><PlusIcon size={26} /></button>
    </>
  )
}
