import { useState, useEffect, useMemo } from 'react'
import { ChevronLeftIcon, PlusIcon, TrashIcon, XIcon } from '../components/Icons'
import ProductComponentModal from '../components/ProductComponentModal'
import { calcCostAtWidth, calcCostAt, calcQty, previewConfig, GRID_WIDTHS, GRID_BLIND_WIDTHS, GRID_BLIND_DROPS, fmt, fmtQty, formulaDescription, fixedPerWidthLabel } from '../lib/bomEngine'

const COST_TYPE_LABELS = {
  fixed: 'Fixed qty', width_based: 'Width-based',
  drop_based: 'Drop-based', width_drop_based: 'W × D', labour: 'Labour',
}



export default function ProductDetail({
  product, productComponents, allComponents, suppliers = [], optionDefs = [],
  widthSchedules = [], onSaveSchedule, onDeleteSchedule,
  onBack, onUpdateProduct, onAddComponent, onUpdateComponent,
  onRemoveComponent, onDuplicate, onDeleteProduct, saving,
}) {
  const [nameDraft, setNameDraft]     = useState(product.name || '')
  const [notesDraft, setNotesDraft]   = useState(product.notes || '')
  useEffect(() => {
    setNameDraft(product.name || '')
    setNotesDraft(product.notes || '')
  }, [product.id, product.name, product.notes])

  const commitName = () => {
    const next = nameDraft.trim()
    if (!next || next === product.name) { setNameDraft(product.name || ''); return }
    onUpdateProduct({ name: next })
  }
  const commitNotes = () => {
    if (notesDraft === (product.notes || '')) return
    onUpdateProduct({ notes: notesDraft })
  }

  const [addOpen, setAddOpen]         = useState(false)
  const [editingPc, setEditingPc]     = useState(null)
  const [showDupMenu, setShowDupMenu] = useState(false)
  const [newName, setNewName]         = useState('')
  const [showBreakdown, setShowBreakdown] = useState(false)

  const handleDuplicate = async () => {
    const name = newName.trim() || `${product.name} (copy)`
    await onDuplicate(name)
    setShowDupMenu(false)
    setNewName('')
  }

  // Grids assume each option's default answer, since a price grid has to pick
  // one build to price. What it assumed is shown above the table.
  const { config: previewCfg, assumed } = useMemo(() => previewConfig(optionDefs), [optionDefs])

  const isTrack = (product.product_type || product.category) === 'track'
  const isBlind = (product.product_type || product.category) === 'blind'

  const gridCosts = useMemo(() => isTrack
    ? GRID_WIDTHS.map(w => ({ width: w, cost: calcCostAtWidth(productComponents, w, optionDefs, previewCfg) }))
    : [], [isTrack, productComponents, optionDefs, previewCfg])

  // Blinds price on both axes, so the grid is a matrix rather than a row.
  const blindGrid = useMemo(() => !isBlind ? [] :
    GRID_BLIND_DROPS.map(drop => ({
      drop,
      cells: GRID_BLIND_WIDTHS.map(width => ({
        width,
        cost: calcCostAt(productComponents, width, drop, optionDefs, previewCfg),
      })),
    })), [isBlind, productComponents, optionDefs, previewCfg])

  const markup = Number(product.markup) || 1.6


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
              <label className="field-label">
                {product.product_type === 'blind' ? 'Fabric category' : 'Profile code'}
              </label>
              {/* Held locally and committed on blur. Writing on every keystroke
                  fired one UPDATE per character, and out-of-order responses
                  could land a half-typed name back in the database. */}
              <input className="field-input" value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                placeholder={product.product_type === 'blind' ? 'e.g. Bancoora' : 'e.g. TCO51'} />
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
                <textarea className="field-input" rows={2} value={notesDraft}
                  onChange={e => setNotesDraft(e.target.value)}
                  onBlur={commitNotes}
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
                  {(() => {
                    const badges = []
                    const choice = pc.option_choice_id && optionDefs
                      .flatMap(o => (o.choices || []).map(c => ({ o, c })))
                      .find(x => x.c.id === pc.option_choice_id)
                    if (choice) badges.push({ t: `${choice.o.name}: ${choice.c.label}`, bg: 'var(--accent-bg)', fg: 'var(--accent-dark)' })
                    if (pc.group_key) badges.push({ t: `alt: ${pc.group_key}`, bg: 'var(--blue-bg)', fg: 'var(--blue)' })
                    const w = [pc.active_min_width, pc.active_max_width]
                    const d = [pc.active_min_drop, pc.active_max_drop]
                    if (w[0] != null || w[1] != null) badges.push({ t: `W ${w[0] ?? '0'}–${w[1] ?? '∞'}`, bg: 'var(--warning-bg)', fg: 'var(--warning)' })
                    if (d[0] != null || d[1] != null) badges.push({ t: `D ${d[0] ?? '0'}–${d[1] ?? '∞'}`, bg: 'var(--warning-bg)', fg: 'var(--warning)' })
                    if (pc.drop_limit && Object.keys(pc.drop_limit).length) {
                      const n = Object.keys(pc.drop_limit).length
                      badges.push({ t: `drop limit · ${n} band${n === 1 ? '' : 's'}`, bg: 'var(--warning-bg)', fg: 'var(--warning)' })
                    }
                    if (!badges.length) return null
                    return (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {badges.map((b, i) => (
                          <span key={i} style={{
                            fontSize: 10, fontWeight: 700, padding: '1px 6px',
                            borderRadius: 4, background: b.bg, color: b.fg,
                          }}>{b.t}</span>
                        ))}
                      </div>
                    )
                  })()}
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


          {/* Blind price grid — width across, drop down */}
          {isBlind && productComponents.length > 0 && (
            <>
              <div className="section-title" style={{ padding: '0 0 8px' }}>Pricing Grid</div>
              {assumed.length > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginBottom: 8 }}>
                  Priced as {assumed.join(' · ')}
                </div>
              )}
              <div style={{
                background: '#fff', border: '1px solid var(--warm-200)',
                borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 10,
              }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620, fontVariantNumeric: 'tabular-nums' }}>
                    <thead>
                      <tr style={{ background: 'var(--accent-dark)' }}>
                        <th style={{
                          padding: '9px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          color: 'rgba(255,255,255,0.7)', position: 'sticky', left: 0,
                          background: 'var(--accent-dark)', zIndex: 1, whiteSpace: 'nowrap',
                        }}>Drop \ Width</th>
                        {GRID_BLIND_WIDTHS.map(w => (
                          <th key={w} style={{
                            padding: '9px 8px', textAlign: 'right', fontSize: 11, fontWeight: 700,
                            color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap',
                          }}>{w}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {blindGrid.map((row, ri) => (
                        <tr key={row.drop} style={{ background: ri % 2 ? 'var(--warm-100)' : '#fff' }}>
                          <td style={{
                            padding: '8px 12px', fontSize: 12, fontWeight: 700,
                            borderTop: '1px solid var(--warm-100)', whiteSpace: 'nowrap',
                            position: 'sticky', left: 0, zIndex: 1,
                            background: ri % 2 ? 'var(--warm-100)' : '#fff',
                          }}>{row.drop}</td>
                          {row.cells.map(cell => (
                            <td key={cell.width} style={{
                              padding: '8px 8px', textAlign: 'right', fontSize: 12,
                              borderTop: '1px solid var(--warm-100)', whiteSpace: 'nowrap',
                            }}>
                              ${fmt(cell.cost)}
                              <div style={{ fontSize: 10, color: 'var(--warm-300)' }}>
                                ${fmt(cell.cost * markup)}
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginBottom: 24 }}>
                Cost on top, cost × {markup} beneath. Sizes in mm.
              </div>
            </>
          )}

          {/* Pricing grid — tracks only */}
          {isTrack && productComponents.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div className="section-title" style={{ padding: 0 }}>Pricing Grid</div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowBreakdown(true)}
                >
                  🔍 See Breakdown
                </button>
              </div>
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
        optionDefs={optionDefs}
        suppliers={suppliers}
        widthSchedules={widthSchedules}
        onSaveSchedule={onSaveSchedule}
        onDeleteSchedule={onDeleteSchedule}
        onClose={() => setAddOpen(false)}
        onSave={(data) => { onAddComponent(data); setAddOpen(false) }}
        saving={saving}
      />

      {editingPc && (
        <ProductComponentModal
          open={!!editingPc}
          productComponent={editingPc}
          allComponents={allComponents}
        optionDefs={optionDefs}
          suppliers={suppliers}
          widthSchedules={widthSchedules}
          onSaveSchedule={onSaveSchedule}
          onDeleteSchedule={onDeleteSchedule}
          onClose={() => setEditingPc(null)}
          onSave={(data) => { onUpdateComponent(editingPc.id, data); setEditingPc(null) }}
          onRemove={() => { onRemoveComponent(editingPc.id); setEditingPc(null) }}
          saving={saving}
        />
      )}

      {/* ---- BREAKDOWN MODAL ---- */}
      {showBreakdown && isTrack && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setShowBreakdown(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 768 }}>
            <div className="modal-handle" />
            <div className="modal-header">
              <div>
                <div className="modal-title">Component Breakdown</div>
                <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>{product.name}</div>
              </div>
              <button onClick={() => setShowBreakdown(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
                <XIcon size={22} />
              </button>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900, fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  {/* Width header row */}
                  <tr style={{ background: 'var(--accent-dark)' }}>
                    <th style={{
                      padding: '10px 12px', textAlign: 'left', fontSize: 11,
                      fontWeight: 700, color: 'rgba(255,255,255,0.7)',
                      position: 'sticky', left: 0, background: 'var(--accent-dark)',
                      minWidth: 140, whiteSpace: 'nowrap',
                    }}>
                      Component
                    </th>
                    {GRID_WIDTHS.map(w => (
                      <th key={w} style={{
                        padding: '10px 8px', textAlign: 'right', fontSize: 11,
                        fontWeight: 700, color: 'rgba(255,255,255,0.85)',
                        whiteSpace: 'nowrap', minWidth: 72,
                      }}>
                        {w.toLocaleString()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {productComponents.map((pc, pcIdx) => {
                    const base     = Number(pc.component?.unit_cost) || 0
                    const discount = Number(pc.component?.discount) || 0
                    const unitCost = base * (1 - discount / 100)
                    return (
                      <tr key={pc.id} style={{ background: pcIdx % 2 === 0 ? 'var(--warm-100)' : '#fff' }}>
                        {/* Component name — sticky left */}
                        <td style={{
                          padding: '9px 12px',
                          position: 'sticky', left: 0,
                          background: pcIdx % 2 === 0 ? 'var(--warm-100)' : '#fff',
                          borderRight: '1px solid var(--warm-200)',
                        }}>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{pc.component?.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--warm-300)', marginTop: 1 }}>
                            ${unitCost.toFixed(4)}/{pc.component?.unit}
                            {pc.colour_variant ? ` · ${pc.colour_variant.name}` : ''}
                          </div>
                        </td>
                        {GRID_WIDTHS.map(w => {
                          const qty      = calcQty(pc, w, 0)
                          const lineCost = qty * unitCost
                          const label    = fixedPerWidthLabel(pc, w)
                          return (
                            <td key={w} style={{
                              padding: '9px 8px', textAlign: 'right',
                              borderLeft: '1px solid var(--warm-100)',
                            }}>
                              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{fmtQty(qty)}</div>
                              {label && (
                                <div style={{ fontSize: 10, color: 'var(--accent-dark)', fontWeight: 600, marginTop: 1 }}>
                                  {label}
                                </div>
                              )}
                              <div style={{ fontSize: 10, color: 'var(--warm-300)', marginTop: 1 }}>
                                ${fmt(lineCost)}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  {/* Total row */}
                  <tr style={{ background: 'var(--accent-bg)', borderTop: '2px solid var(--accent)' }}>
                    <td style={{
                      padding: '10px 12px', fontWeight: 700, fontSize: 13,
                      color: 'var(--accent-dark)',
                      position: 'sticky', left: 0, background: 'var(--accent-bg)',
                      borderRight: '1px solid var(--warm-200)',
                    }}>
                      Total
                    </td>
                    {GRID_WIDTHS.map(w => (
                      <td key={w} style={{
                        padding: '10px 8px', textAlign: 'right',
                        fontWeight: 700, fontSize: 13, color: 'var(--accent-dark)',
                        borderLeft: '1px solid #c8e89a',
                      }}>
                        ${fmt(calcCostAtWidth(productComponents, w))}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-block" onClick={() => setShowBreakdown(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
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