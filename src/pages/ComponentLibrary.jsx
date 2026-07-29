import { useState } from 'react'
import { PlusIcon, ChevronRightIcon } from '../components/Icons'
import { exportComponentsCSV } from '../lib/exportCSV'
import { exportComponentLabels } from '../lib/exportLabels'
import ComponentLabelsModal from '../components/ComponentLabelsModal'

export default function ComponentLibrary({ components, suppliers, componentUsage = {}, stockMap = {}, onEdit, onAdd }) {
  const [search, setSearch] = useState('')
  const [showLabels, setShowLabels] = useState(false)
  const [printing, setPrinting]     = useState(false)

  const handlePrintLabels = async (items) => {
    setPrinting(true)
    try {
      await exportComponentLabels(items)
      setShowLabels(false)
    } finally {
      setPrinting(false)
    }
  }

  const getSupplierName = (c) => {
    if (c.supplier_id) {
      const s = suppliers.find(s => s.id === c.supplier_id)
      return s?.name || c.supplier || '—'
    }
    return c.supplier || '—'
  }

  const filter = (list) => !search
    ? list
    : list.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        getSupplierName(c).toLowerCase().includes(search.toLowerCase()) ||
        (c.supplier_pn || '').toLowerCase().includes(search.toLowerCase())
      )

  const labour    = filter(components.filter(c => c.order_type === 'labour'))
  const bars      = filter(components.filter(c => c.order_type === 'bar'))
  const pack      = filter(components.filter(c => c.order_type === 'pack' || (!c.order_type)))

  const SectionHeader = ({ emoji, title, count }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '16px 0 8px',
    }}>
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <span style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: 'var(--warm-300)',
      }}>{title}</span>
      <span style={{
        fontSize: 11, fontWeight: 600, color: 'var(--warm-300)',
        background: 'var(--warm-100)', borderRadius: 99,
        padding: '1px 8px',
      }}>{count}</span>
    </div>
  )

  const ComponentRow = ({ c }) => (
    <div className="component-item" onClick={() => onEdit(c)}>
      <div className="component-avatar" style={{
        background: c.order_type === 'labour' ? 'var(--blue-bg)'
          : c.order_type === 'bar' ? '#FFF7ED'
          : 'var(--accent-bg)',
        fontSize: 18,
      }}>
        {c.order_type === 'labour' ? '🕐' : c.order_type === 'bar' ? '📏' : '📦'}
      </div>
      <div className="component-info">
        <div className="component-name">{c.name}</div>
        <div className="component-sub">
          {getSupplierName(c)}
          {c.supplier_pn ? ` · ${c.supplier_pn}` : ''}
          {c.order_type === 'bar' && c.bar_length_mm
            ? ` · ${Number(c.bar_length_mm).toLocaleString()}mm bars`
            : ''}
        </div>
        <div style={{ fontSize: 11, marginTop: 3, color: (componentUsage[c.id]?.length || 0) > 0 ? 'var(--accent)' : 'var(--warm-300)' }}>
          {(componentUsage[c.id]?.length || 0) > 0
            ? `Used in ${componentUsage[c.id].length} product${componentUsage[c.id].length !== 1 ? 's' : ''}`
            : 'Not used in any product'}
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
  )

  const allShown = labour.length + bars.length + pack.length

  return (
    <>
      <div className="header">
        <div className="header-title">Components</div>
        <div className="header-actions">
          <button
            onClick={() => setShowLabels(true)}
            title="Print stock labels — 93 x 29mm DK, name + part no. + QR"
            style={{
              padding: '6px 12px', fontSize: 13, fontWeight: 600,
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            🏷 Print Labels
          </button>
          <button
            onClick={() => exportComponentsCSV(components, suppliers, stockMap)}
            title="Export CSV — one row per colour, for a P-touch Editor database"
            style={{
              padding: '6px 12px', fontSize: 13, fontWeight: 600,
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            ⬇ Export CSV
          </button>
        </div>
      </div>

      <ComponentLabelsModal
        open={showLabels}
        components={components}
        suppliers={suppliers}
        stockMap={stockMap}
        onClose={() => setShowLabels(false)}
        onPrint={handlePrintLabels}
        printing={printing}
      />

      <div className="scroll-area">
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-val">{components.length}</div>
            <div className="summary-lbl">Total</div>
          </div>
          <div className="summary-card">
            <div className="summary-val">{components.filter(c => c.supplier_id || c.supplier).length}</div>
            <div className="summary-lbl">With Supplier</div>
          </div>
        </div>

        <div style={{ padding: '0 16px 12px' }}>
          <input className="field-input" placeholder="Search name, supplier or part no..."
            value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: 14 }} />
        </div>

        {allShown === 0 ? (
          <div style={{ padding: '0 16px' }}>
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon">📦</div>
                <div className="empty-title">{components.length === 0 ? 'No components yet' : 'No results'}</div>
                <div className="empty-desc">{components.length === 0 ? 'Tap + to add your first component' : 'Try a different search'}</div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '0 16px' }}>

            {/* ---- LABOUR ---- */}
            {labour.length > 0 && (
              <>
                <SectionHeader emoji="🕐" title="Labour" count={labour.length} />
                <div className="card" style={{ marginBottom: 4 }}>
                  {labour.map(c => <ComponentRow key={c.id} c={c} />)}
                </div>
              </>
            )}

            {/* ---- TRACKS & TUBES ---- */}
            {bars.length > 0 && (
              <>
                <SectionHeader emoji="📏" title="Tracks & Tubes" count={bars.length} />
                <div className="card" style={{ marginBottom: 4 }}>
                  {bars.map(c => <ComponentRow key={c.id} c={c} />)}
                </div>
              </>
            )}

            {/* ---- PACK COMPONENTS ---- */}
            {pack.length > 0 && (
              <>
                <SectionHeader emoji="📦" title="Components" count={pack.length} />
                <div className="card" style={{ marginBottom: 4 }}>
                  {pack.map(c => <ComponentRow key={c.id} c={c} />)}
                </div>
              </>
            )}

          </div>
        )}
      </div>

      <button className="fab" onClick={onAdd}><PlusIcon size={26} /></button>
    </>
  )
}