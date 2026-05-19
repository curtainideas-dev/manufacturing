import { useState } from 'react'
import { ChevronLeftIcon, PlusIcon, TrashIcon } from '../components/Icons'
import ProductComponentModal from '../components/ProductComponentModal'
import { calcCostAtWidth, GRID_WIDTHS, fmt, formulaDescription } from '../lib/bomEngine'

const COST_TYPE_LABELS = {
  fixed: 'Fixed qty', width_based: 'Width-based',
  drop_based: 'Drop-based', width_drop_based: 'W × D', labour: 'Labour',
}



export default function ProductDetail({
  product, productComponents, allComponents,
  onBack, onUpdateProduct, onAddComponent, onUpdateComponent,
  onRemoveComponent, onDuplicate, onDeleteProduct, saving,
}) {
  const [addOpen, setAddOpen]         = useState(false)
  const [editingPc, setEditingPc]     = useState(null)
  const [showDupMenu, setShowDupMenu] = useState(false)
  const [newName, setNewName]         = useState('')

  const handleDuplicate = async () => {
    const name = newName.trim() || `${product.name} (copy)`
    await onDuplicate(name)
    setShowDupMenu(false)
    setNewName('')
  }

  // Pricing grid — only meaningful for tracks (width-based, no drop)
  const isTrack = product.category === 'track'
  const gridCosts = isTrack
    ? GRID_WIDTHS.map(w => ({ width: w, cost: calcCostAtWidth(productComponents, w) }))
    : []

  return (
    <>
      <div className="header">
        <button className="header-back" onClick={onBack}>
          <ChevronLeftIcon size={18} /> Products
        </button>
        <div className="header-title" style={{ fontSize: 15 }} />
        <div className="header-actions">
          <button
            style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px' }}
            onClick={() => setShowDupMenu(v => !v)}
          >
            ⧉ Duplicate
          </button>
        </div>
      </div>

      {/* Duplicate panel */}
      {showDupMenu && (
        <div style={{ background: 'var(--accent-bg)', borderBottom: '1px solid #c8e89a', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-dark)' }}>Duplicate "{product.name}"</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="field-input" style={{ fontSize: 14, flex: 1 }}
              placeholder={`${product.name} (copy)`} value={newName}
              onChange={e => setNewName(e.target.value)} />
            <button className="btn btn-primary" onClick={handleDuplicate} disabled={saving}>
              {saving ? 'Copying...' : 'Duplicate'}
            </button>
            <button className="btn btn-secondary" onClick={() => { setShowDupMenu(false); setNewName('') }}>Cancel</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--warm-300)' }}>Creates a new product with the same recipe — edit independently after.</div>
        </div>
      )}

      <div className="scroll-area">
        <div style={{ padding: 16 }}>

          {/* Product details */}
          <div className="card card-body" style={{ marginBottom: 16 }}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="field-label">Product Name</label>
              <input className="field-input" value={product.name}
                onChange={e => onUpdateProduct({ name: e.target.value })}
                placeholder="e.g. Wave Track Centre Open" />
            </div>
            <div className="grid-2">
              <div>
                <label className="field-label">Category</label>
                <select className="field-input" value={product.category}
                  onChange={e => onUpdateProduct({ category: e.target.value })}>
                  <option value="track">Track</option>
                  <option value="blind">Blind</option>
                  <option value="sheer">Sheer</option>
                </select>
              </div>
            </div>
            {product.notes !== undefined && (
              <div style={{ marginTop: 12 }}>
                <label className="field-label">Notes</label>
                <textarea className="field-input" rows={2} value={product.notes || ''}
                  onChange={e => onUpdateProduct({ notes: e.target.value })}
                  placeholder="Optional notes..." />
              </div>
            )}
          </div>

          {/* Recipe */}
          <div className="section-title" style={{ padding: '0 0 8px' }}>
            Component Recipe ({productComponents.length})
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            {productComponents.length === 0 ? (
              <div className="empty-state" style={{ padding: '28px 20px' }}>
                <div className="empty-icon" style={{ fontSize: 32 }}>🧩</div>
                <div className="empty-title" style={{ fontSize: 17 }}>No components yet</div>
                <div className="empty-desc">Add components to build the recipe for this product</div>
              </div>
            ) : productComponents.map(pc => (
              <div key={pc.id} className="component-item" onClick={() => setEditingPc(pc)}>
                <div className="component-avatar" style={{ fontSize: 16 }}>📦</div>
                <div className="component-info">
                  <div className="component-name">{pc.component?.name || '—'}</div>
                  <div className="component-sub">
                    {formulaDescription(pc)}
                    {pc.colour_variant ? ` · ${pc.colour_variant.name}` : ''}
                    {pc.component?.supplier ? ` · ${pc.component.supplier}` : ''}
                  </div>
                </div>
                <div className="component-right">
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                    ${Number(pc.component?.unit_cost || 0).toFixed(2)}
                    {Number(pc.component?.discount) > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--success)', marginLeft: 4 }}>
                        −{pc.component?.discount}%
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 2 }}>
                    {COST_TYPE_LABELS[pc.cost_type]}
                  </div>
                </div>
                <ChevronRightIcon size={16} />
              </div>
            ))}
          </div>

          <button className="btn btn-secondary btn-block" style={{ marginBottom: 24 }} onClick={() => setAddOpen(true)}>
            <PlusIcon size={16} /> Add Component to Recipe
          </button>

          {/* Pricing grid — tracks only */}
          {isTrack && productComponents.length > 0 && (
            <>
              <div className="section-title" style={{ padding: '0 0 8px' }}>Pricing Grid</div>
              <div style={{
                background: '#fff', border: '1px solid var(--warm-200)', borderRadius: 'var(--radius)',
                overflow: 'hidden', marginBottom: 24,
              }}>
                {/* Scrollable table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                    <thead>
                      <tr style={{ background: 'var(--accent-dark)' }}>
                        <th style={{
                          padding: '10px 14px', textAlign: 'left', fontSize: 11,
                          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                          color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap',
                          position: 'sticky', left: 0, background: 'var(--accent-dark)', zIndex: 1,
                        }}>
                          Width (mm)
                        </th>
                        {gridCosts.map(({ width }) => (
                          <th key={width} style={{
                            padding: '10px 10px', textAlign: 'right', fontSize: 11,
                            fontWeight: 700, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap',
                          }}>
                            {width.toLocaleString()}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{
                          padding: '12px 14px', fontSize: 11, fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          color: 'var(--warm-300)', whiteSpace: 'nowrap',
                          position: 'sticky', left: 0, background: '#fff',
                          borderRight: '1px solid var(--warm-200)',
                        }}>
                          Cost ($)
                        </td>
                        {gridCosts.map(({ width, cost }) => (
                          <td key={width} style={{
                            padding: '12px 10px', textAlign: 'right',
                            fontSize: 14, fontWeight: 600, color: 'var(--ink)',
                            borderLeft: '1px solid var(--warm-100)',
                            whiteSpace: 'nowrap',
                          }}>
                            {fmt(cost)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          <div className="divider" />
          <button className="btn btn-danger btn-block" onClick={onDeleteProduct}>
            <TrashIcon size={15} /> Delete Product
          </button>
        </div>
      </div>

      <ProductComponentModal
        open={addOpen}
        productComponent={null}
        allComponents={allComponents}
        onClose={() => setAddOpen(false)}
        onSave={(data) => { onAddComponent(data); setAddOpen(false) }}
        saving={saving}
      />

      {editingPc && (
        <ProductComponentModal
          open={!!editingPc}
          productComponent={editingPc}
          allComponents={allComponents}
          onClose={() => setEditingPc(null)}
          onSave={(data) => { onUpdateComponent(editingPc.id, data); setEditingPc(null) }}
          onRemove={() => { onRemoveComponent(editingPc.id); setEditingPc(null) }}
          saving={saving}
        />
      )}
    </>
  )
}

// Inline since it's only used here
function ChevronRightIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="var(--warm-200)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}
