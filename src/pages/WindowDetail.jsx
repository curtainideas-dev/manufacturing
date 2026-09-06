import { useState, useMemo } from 'react'
import { ChevronLeftIcon, TrashIcon } from '../components/Icons'
import { buildWindowBOM, missingAnswers, resolveAnswers, fabricSelectionFor, substitutionsFor, fmt, fmtQty } from '../lib/bomEngine'
import CustomiseWindowModal from '../components/CustomiseWindowModal'
import SwapComponentModal from '../components/SwapComponentModal'

export default function WindowDetail({
  window: win, windowIndex, totalWindows, job, product, productComponents, optionDefs = [],
  allComponents = [], fabricCategories = [], stockMap = {}, nestedFabricQty,
  onBack, onUpdate, onDelete, readOnly,
}) {
  const [overrides, setOverrides] = useState(win.bom_overrides || {})
  const [swapLine, setSwapLine]   = useState(null)

  // Recalculate BOM whenever dimensions or the window's answers change —
  // both feed recipe resolution, not just the quantity formulas.
  //
  // The fabric quantity is the exception: how much roll this blind takes
  // depends on what gets cut beside it, which only the whole job knows. The
  // job-nested figure comes in as a prop rather than being recomputed here,
  // so this page and the job BOM can't disagree.
  const subMap = useMemo(
    () => substitutionsFor(job, win, allComponents),
    [job, win, allComponents])

  const bom = useMemo(() => {
    const lines = buildWindowBOM(productComponents, win, optionDefs, null, null,
      fabricSelectionFor(win, product, allComponents, fabricCategories), subMap)
    if (nestedFabricQty === undefined) return lines
    return lines.map(line => line.fabric_cut
      ? Object.defineProperties({}, {
          ...Object.getOwnPropertyDescriptors(line),
          calculated_qty: { value: nestedFabricQty, enumerable: true, writable: true, configurable: true },
        })
      : line)
  }, [productComponents, optionDefs, win, product, allComponents, fabricCategories, subMap, nestedFabricQty])

  const bomWithOverrides = bom.map(line => {
    const ov = overrides[line.component_id]
    const effectiveQty = (ov !== undefined && ov !== '') ? Number(ov) : line.calculated_qty
    return {
      ...line,
      override_qty: (ov !== undefined && ov !== '') ? Number(ov) : null,
      qty: effectiveQty,
      line_cost: effectiveQty * line.unit_cost_snapshot,
    }
  })

  const windowTotal = bomWithOverrides.reduce((s, l) => s + l.line_cost, 0)

  const category = fabricCategories.find(c => c.code === product?.fabric_category)
  const fabricMissing = product?.product_type === 'blind' && !!category && !win.config?.fabric?.component_id
  const missing = useMemo(() => {
    const base = missingAnswers(optionDefs, win.config)
    return fabricMissing ? [...base, 'Fabric'] : base
  }, [optionDefs, win.config, fabricMissing])

  const [customiseOpen, setCustomiseOpen] = useState(false)

  // "Face fix · Centre open · Both ends" — the answers, in question order.
  const answerSummary = useMemo(() => {
    const effective = resolveAnswers(optionDefs, win.config)
    return optionDefs
      .map(o => (o.choices || []).find(c => String(c.value) === String(effective[o.code]))?.label)
      .filter(Boolean)
      .join(' · ')
  }, [optionDefs, win.config])

  const handleOverride = (componentId, value) => {
    const next = { ...overrides, [componentId]: value }
    setOverrides(next)
    onUpdate({ bom_overrides: next })
  }

  const clearOverride = (componentId) => {
    const next = { ...overrides }
    delete next[componentId]
    setOverrides(next)
    onUpdate({ bom_overrides: next })
  }

  const winSubs = win.substitutions || {}

  // A swap here only ever covers this window. Keyed by the part the recipe
  // asks for, so it sits on top of any job-wide swap of the same part
  // without either one having to know about the other.
  const handleSwap = ({ from_component_id, component_id, colour_variant }) => {
    onUpdate({ substitutions: { ...winSubs, [from_component_id]: { component_id, colour_variant } } })
    setSwapLine(null)
  }

  // Back to whatever applies without this window's own say — the job's swap
  // if there is one, otherwise the recipe.
  const clearSwap = (fromComponentId) => {
    const next = { ...winSubs }
    delete next[fromComponentId]
    onUpdate({ substitutions: next })
  }

  // Two lines pointing at the same component would merge in the job summary
  // and collide in the qty snapshot, so what's already here isn't offered.
  const swapExcludeIds = useMemo(
    () => bom.filter(l => l.component_id !== swapLine?.component_id).map(l => l.component_id),
    [bom, swapLine])

  return (
    <>
      <div className="header">
        <button className="header-back" onClick={onBack}>
          <ChevronLeftIcon size={18} /> Back
        </button>
        <div className="header-title" style={{ fontSize: 15 }}>
          {win.label || `Window ${windowIndex + 1}`}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', paddingRight: 4 }}>
          {windowIndex + 1}/{totalWindows}
        </div>
      </div>

      <div className="scroll-area">
        <div style={{ padding: 16 }}>

          {/* Window details */}
          <div className="card card-body" style={{ marginBottom: 16 }}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="field-label">Label</label>
              <input className="field-input" value={win.label || ''} disabled={readOnly}
                onChange={e => onUpdate({ label: e.target.value })}
                placeholder={`Window ${windowIndex + 1}`} />
            </div>

            {/* Product — shown but not editable after creation */}
            <div style={{
              background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
              padding: '10px 12px', marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 10
            }}>
              <span style={{ fontSize: 20 }}>🔩</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{product?.name || '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--warm-300)' }}>{product?.category}</div>
              </div>
            </div>

            <div className="grid-2">
              <div>
                <label className="field-label">Width (mm)</label>
                <input className="field-input" type="number" value={win.width_mm} disabled={readOnly}
                  onChange={e => onUpdate({ width_mm: e.target.value })}
                  placeholder="e.g. 1800" style={{ textAlign: 'right' }} />
              </div>
              <div>
                <label className="field-label">Drop (mm)</label>
                <input className="field-input" type="number" value={win.drop_mm} disabled={readOnly}
                  onChange={e => onUpdate({ drop_mm: e.target.value })}
                  placeholder="e.g. 2100" style={{ textAlign: 'right' }} />
              </div>
            </div>
          </div>

          {/* Cost banner */}
          <div style={{
            background: 'var(--accent-dark)', color: '#fff', borderRadius: 'var(--radius)',
            padding: '12px 16px', marginBottom: 16,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7 }}>
              Window Cost
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>${fmt(windowTotal)}</div>
          </div>

          {/* Answers live behind the same modal used when the window was
              added, so there is one place these questions are ever asked. */}
          {(optionDefs.length > 0 || product?.product_type === 'blind') && (
            <button className="btn btn-secondary btn-block" style={{ marginBottom: 14 }}
              onClick={() => setCustomiseOpen(true)} disabled={readOnly}>
              🎛️ {readOnly ? 'Answers locked' : 'Customise'}
              {answerSummary && (
                <span style={{ fontWeight: 400, color: 'var(--warm-300)', marginLeft: 6, fontSize: 12.5 }}>
                  {answerSummary}
                </span>
              )}
            </button>
          )}

          {/* Unanswered required options mean the recipe resolved to fewer
              lines than the window actually needs — say so loudly rather than
              showing a cost that is quietly too low. */}
          {missing.length > 0 && (
            <div style={{
              background: 'var(--danger-bg)', border: '1px solid #fecaca',
              borderLeft: '3px solid var(--danger)', borderRadius: 'var(--radius-sm)',
              padding: '10px 13px', marginBottom: 14,
            }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--danger)', marginBottom: 2 }}>
                Incomplete — cost below is not the real cost
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink)' }}>
                {missing.join(', ')} {missing.length === 1 ? 'has' : 'have'} no answer, so the parts they
                decide are missing from this window.
              </div>
            </div>
          )}

          {/* BOM table — this is the assembler's pick list */}
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--warm-300)', marginBottom: 8 }}>
            Bill of Materials
          </div>

          {bom.length === 0 ? (
            <div className="card">
              <div className="empty-state" style={{ padding: '28px 20px' }}>
                <div className="empty-desc">No components in this product's recipe. Add components in the Products tab first.</div>
              </div>
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 16 }}>
              {/* Header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 90px 75px',
                padding: '10px 16px', background: 'var(--warm-100)',
                borderBottom: '1px solid var(--warm-200)',
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'var(--warm-300)'
              }}>
                <div>Component</div>
                <div style={{ textAlign: 'right' }}>Qty</div>
                <div style={{ textAlign: 'right' }}>Cost</div>
              </div>

              {bomWithOverrides.map(line => {
                const isOverridden = line.override_qty !== null
                // The recipe part this line stands for — the key every swap
                // is filed under, whether or not one is in force yet.
                const recipeId = line.substituted_from?.component_id || line.component_id
                const ownSwap  = !!winSubs[recipeId]
                // Fabric is chosen in Customise, not swapped here.
                const canSwap  = !readOnly && !line.fabric_cut
                return (
                  <div key={line.component_id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--warm-100)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 75px', alignItems: 'center', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {line.component?.name}
                          {line.substituted_from && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '1px 6px',
                              borderRadius: 4, background: 'var(--blue-bg)', color: 'var(--blue)',
                            }}>{ownSwap ? 'swapped' : 'job swap'}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 2 }}>
                          {line.component?.unit}
                          {line.component?.supplier_pn ? ` · ${line.component.supplier_pn}` : ''}
                          {line.component?.supplier ? ` · ${line.component.supplier}` : ''}
                        </div>
                        {line.substituted_from && (
                          <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 2 }}>
                            Recipe: {line.substituted_from.component?.name}
                          </div>
                        )}
                      </div>

                      {/* Editable qty — orange when overridden so assembler knows it's manual */}
                      <div>
                        <input
                          type="number" step="0.001" disabled={readOnly}
                          value={overrides[line.component_id] !== undefined
                            ? overrides[line.component_id]
                            : fmtQty(line.calculated_qty)}
                          onChange={e => handleOverride(line.component_id, e.target.value)}
                          style={{
                            width: '100%', textAlign: 'right', padding: '6px 8px',
                            border: `1.5px solid ${isOverridden ? 'var(--warning)' : 'var(--warm-200)'}`,
                            borderRadius: 6, fontSize: 14, fontWeight: 600,
                            background: isOverridden ? 'var(--warning-bg)' : '#fff',
                            color: isOverridden ? 'var(--warning)' : 'var(--ink)',
                          }}
                        />
                      </div>

                      <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 14 }}>
                        ${fmt(line.line_cost)}
                      </div>
                    </div>

                    {/* Show calculated + reset when overridden */}
                    {isOverridden && !readOnly && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--warm-300)' }}>
                          Calculated: {fmtQty(line.calculated_qty)}
                        </span>
                        <button onClick={() => clearOverride(line.component_id)}
                          style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                          Reset
                        </button>
                      </div>
                    )}

                    {canSwap && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5 }}>
                        <button onClick={() => setSwapLine(line)}
                          style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                          ⇄ {line.substituted_from ? 'Change swap' : 'Swap component'}
                        </button>
                        {ownSwap && (
                          <button onClick={() => clearSwap(recipeId)}
                            style={{ fontSize: 11, color: 'var(--warm-300)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                            Revert
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Total */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 90px 75px',
                padding: '12px 16px', background: 'var(--accent-bg)',
                fontSize: 14, fontWeight: 700
              }}>
                <div style={{ color: 'var(--accent-dark)' }}>Total</div>
                <div />
                <div style={{ textAlign: 'right', color: 'var(--accent-dark)' }}>${fmt(windowTotal)}</div>
              </div>
            </div>
          )}

          {!readOnly && (
            <button className="btn btn-danger btn-block" onClick={onDelete}>
              <TrashIcon size={15} /> Remove Window
            </button>
          )}
        </div>
      </div>

      <CustomiseWindowModal
        open={customiseOpen}
        product={product}
        productComponents={productComponents}
        optionDefs={optionDefs}
        allComponents={allComponents}
        categories={fabricCategories}
        subMap={subMap}
        widthMm={win.width_mm}
        dropMm={win.drop_mm}
        config={win.config}
        onClose={() => setCustomiseOpen(false)}
        onSave={(config) => { onUpdate({ config }); setCustomiseOpen(false) }}
        saveLabel="Save answers"
      />

      <SwapComponentModal
        open={!!swapLine}
        scope="window"
        line={swapLine}
        components={allComponents}
        stockMap={stockMap}
        excludeIds={swapExcludeIds}
        onClose={() => setSwapLine(null)}
        onSave={handleSwap}
      />
    </>
  )
}
