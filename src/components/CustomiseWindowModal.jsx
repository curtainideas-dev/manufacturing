import { useState, useEffect, useMemo } from 'react'
import { XIcon } from './Icons'
import { resolveAnswers, isOptionVisible, missingAnswers, resolveRecipe, calcWindowBOM, fmt } from '../lib/bomEngine'

/**
 * Step 2 of adding a window — the answers that decide what actually gets built.
 *
 * A question gated by another is hidden when it doesn't apply. If the gating
 * answer decides it anyway (centre open takes both return brackets), that is
 * shown as settled rather than asked, and never blocks.
 */
export default function CustomiseWindowModal({
  open, product, productComponents = [], optionDefs = [],
  widthMm, dropMm, config, onClose, onSave, saveLabel = 'Add window',
}) {
  const [answers, setAnswers] = useState({})

  useEffect(() => {
    if (open) setAnswers((config && config.options) || {})
  }, [open, config])

  const draft = useMemo(() => ({ options: answers }), [answers])

  const effective = useMemo(() => resolveAnswers(optionDefs, draft), [optionDefs, draft])
  const missing   = useMemo(() => missingAnswers(optionDefs, draft), [optionDefs, draft])

  const bom = useMemo(() => {
    const lines = resolveRecipe(productComponents, draft, optionDefs, Number(widthMm), Number(dropMm))
    return calcWindowBOM(lines, Number(widthMm), Number(dropMm))
  }, [productComponents, draft, optionDefs, widthMm, dropMm])

  const cost = bom.reduce((s, l) => s + l.line_cost, 0)

  if (!open) return null

  const set = (code, value) => setAnswers(a => ({ ...a, [code]: value }))

  const labelFor = (option, value) =>
    (option.choices || []).find(c => String(c.value) === String(value))?.label || value

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">{product?.name || 'Customise'}</div>
            <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>
              {widthMm} × {dropMm} mm
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body">
          {optionDefs.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--warm-300)', padding: '8px 0 16px' }}>
              No options are defined for this product type, so there is nothing to answer.
              The full recipe applies as-is.
            </div>
          )}

          {optionDefs.map(o => {
            const visible = isOptionVisible(o, effective)
            const value   = effective[o.code]

            // Hidden but decided — show what it settled on so nobody wonders.
            if (!visible) {
              if (value === undefined || value === null || value === '') return null
              const parent = optionDefs.find(x => x.code === o.depends_on_code)
              return (
                <div key={o.id} style={{
                  background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
                  padding: '9px 12px', marginBottom: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {o.name}: {labelFor(o, value)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--warm-300)' }}>
                      Decided by {parent?.name || 'another answer'}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                    background: '#fff', color: 'var(--warm-300)',
                  }}>automatic</span>
                </div>
              )
            }

            const unanswered = o.required && !value

            if (o.selection === 'qty') {
              return (
                <div className="field" key={o.id}>
                  <label className="field-label">
                    {o.name}
                    {o.spec_only && <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '1px 5px', borderRadius: 4, background: 'var(--blue-bg)', color: 'var(--blue)' }}>spec</span>}
                  </label>
                  <input className="field-input" type="number" min="0" step="0.5"
                    value={value ?? ''} placeholder="0"
                    onChange={e => set(o.code, e.target.value === '' ? undefined : Number(e.target.value))}
                    style={{ textAlign: 'right' }} />
                </div>
              )
            }

            const selectable = (o.choices || []).filter(c => c.selectable !== false)
            return (
              <div className="field" key={o.id}>
                <label className="field-label">
                  {o.name}
                  {unanswered && <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '1px 5px', borderRadius: 4, background: 'var(--danger-bg)', color: 'var(--danger)' }}>required</span>}
                  {o.spec_only && <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '1px 5px', borderRadius: 4, background: 'var(--blue-bg)', color: 'var(--blue)' }}>spec</span>}
                </label>
                <div style={{
                  display: 'flex', gap: 6, flexWrap: 'wrap',
                  outline: unanswered ? '1.5px solid #fca5a5' : 'none',
                  outlineOffset: 3, borderRadius: 8,
                }}>
                  {selectable.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--warm-300)' }}>No answers defined yet.</div>
                  )}
                  {selectable.map(c => {
                    const on = String(value) === String(c.value)
                    return (
                      <button key={c.id} type="button"
                        onClick={() => set(o.code, on && !o.required ? undefined : c.value)}
                        style={{
                          flex: '1 1 30%', minWidth: 90, padding: '9px 8px',
                          borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                          border: `1.5px solid ${on ? 'var(--accent)' : 'var(--warm-200)'}`,
                          background: on ? 'var(--accent-bg)' : '#fff',
                          color: on ? 'var(--accent-dark)' : 'var(--ink)',
                        }}>
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {missing.length > 0 && (
            <div style={{
              background: 'var(--danger-bg)', borderLeft: '3px solid var(--danger)',
              borderRadius: 'var(--radius-sm)', padding: '9px 12px',
              fontSize: 12.5, fontWeight: 600, color: 'var(--danger)', marginBottom: 12,
            }}>
              {missing.join(', ')} still needed.
            </div>
          )}

          <div style={{
            background: 'var(--accent-dark)', color: '#fff', borderRadius: 'var(--radius)',
            padding: '11px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', opacity: 0.7 }}>
                Cost
              </div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 1 }}>
                {bom.length} component{bom.length === 1 ? '' : 's'}
              </div>
            </div>
            <div style={{ fontSize: 21, fontWeight: 700 }}>${fmt(cost)}</div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Back</button>
          <button className="btn btn-primary" style={{ flex: 2 }}
            disabled={missing.length > 0}
            onClick={() => onSave({ ...(config || {}), options: answers })}>
            {missing.length > 0 ? `${missing.length} answer${missing.length === 1 ? '' : 's'} needed` : saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
