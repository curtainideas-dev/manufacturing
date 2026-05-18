import { useState } from 'react'
import { PlusIcon, ChevronRightIcon } from '../components/Icons'

export default function ComponentLibrary({ components, onEdit, onAdd }) {
  const [search, setSearch] = useState('')

  const shown = components.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.supplier || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.supplier_pn || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="header">
        <div className="header-title">Components</div>
      </div>

      <div className="scroll-area">
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-val">{components.length}</div>
            <div className="summary-lbl">Total Components</div>
          </div>
          <div className="summary-card">
            <div className="summary-val">
              {components.filter(c => c.supplier).length}
            </div>
            <div className="summary-lbl">With Supplier</div>
          </div>
        </div>

        <div style={{ padding: '0 16px 12px' }}>
          <input className="field-input" placeholder="Search name, supplier or part no..."
            value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: 14 }} />
        </div>

        <div style={{ padding: '0 16px' }}>
          <div className="card">
            {shown.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📦</div>
                <div className="empty-title">{components.length === 0 ? 'No components yet' : 'No results'}</div>
                <div className="empty-desc">{components.length === 0 ? 'Tap + to add your first component' : 'Try a different search'}</div>
              </div>
            ) : shown.map(c => (
              <div key={c.id} className="component-item" onClick={() => onEdit(c)}>
                <div className="component-avatar">📦</div>
                <div className="component-info">
                  <div className="component-name">{c.name}</div>
                  <div className="component-sub">
                    {c.supplier || '—'}
                    {c.supplier_pn ? ` · ${c.supplier_pn}` : ''}
                  </div>
                </div>
                <div className="component-right">
                  <div className="component-cost">${Number(c.unit_cost).toFixed(2)}</div>
                  <div className="component-unit">
                    per {c.unit}
                    {Number(c.discount) > 0 && (
                      <span style={{ color: 'var(--success)', marginLeft: 4 }}>−{c.discount}%</span>
                    )}
                  </div>
                </div>
                <ChevronRightIcon size={16} color="var(--warm-200)" style={{ flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <button className="fab" onClick={onAdd}><PlusIcon size={26} /></button>
    </>
  )
}
