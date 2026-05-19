import { useState, useEffect, useRef } from 'react'
import { XIcon, TrashIcon } from './Icons'
import { formulaDescription } from '../lib/bomEngine'

const COST_TYPES = [
  { val: 'fixed',            label: 'Fixed',     note: 'Same qty always' },
  { val: 'width_based',      label: 'Width',     note: 'Based on width' },
  { val: 'drop_based',       label: 'Drop',      note: 'Based on drop' },
  { val: 'width_drop_based', label: 'W × D',     note: 'Fabric / area' },
  { val: 'per_interval',     label: 'Interval',  note: 'Base + per Xmm' },
  { val: 'perimeter',        label: 'Perimeter', note: '2×(W+D)' },
  { val: 'labour',           label: 'Labour',    note: 'Hours per unit' },
]

const DEFAULT = {
  component_id: '',
  cost_type: 'fixed',
  formula_deduction: 0,
  formula_buffer: 1,
  formula_divisor: 75,
  formula_interval: 500,
  colour_variant: null,
}

export default function ProductComponentModal({
  open, productComponent, allComponents, onClose, onSave, onRemove, saving
}) {
  const [form, setForm]               = useState(DEFAULT)
  const [dirty, setDirty]             = useState(false)
  const [showUnsaved, setShowUnsaved] = useState(false)
  const initialForm                   = useRef(DEFAULT)

  useEffect(() => {
    if (open) {
      const initial = productComponent ? { ...DEFAULT, ...productComponent } : DEFAULT
      setForm(initial)
      initialForm.current = initial
      setDirty(false)
      setShowUnsaved(false)
    }
  }, [open, productComponent])

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setDirty(true) }

  const handleClose = () => { dirty ? setShowUnsaved(true) : onClose() }
  const handleOverlayClick = (e) => { if (e.target === e.currentTarget) handleClose() }

  const selectedComp    = allComponents.find(c => c.id === form.component_id)
  const displayComp     = selectedComp || productComponent?.component
  const unit            = displayComp?.unit || 'each'
  const colourVariants  = displayComp?.colour_variants || []
  const hasColours      = colourVariants.length > 0

  // Build live formula preview using the shared helper
  const previewPc = { ...form, component: displayComp }
  const preview   = formulaDescription(previewPc)

  const NumField = ({ id, label, hint, step = '0.1', min }) => (
    <div className="field" style={{ marginBottom: hint ? 14 : 10 }}>
      <label className="field-label">{label}</label>
      <input className="field-input" type="number" step={step} min={min}
        value={form[id]} onChange={e => set(id, e.target.value)} />
      {hint && <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 5 }}>{hint}</div>}
    </div>
  )

  const FormulaFields = () => {
    switch (form.cost_type) {
      case 'fixed':
        return <NumField id="formula_buffer" label="Quantity per unit" step="1" min="0"
          hint="How many of this component per unit — e.g. 2 for a centre open" />

      case 'width_based':
        return <NumField id="formula_deduction" label="Deduction (mm)"
          hint="Subtracted from window width — e.g. 13mm means result = width − 13mm" />

      case 'drop_based':
        return <NumField id="formula_deduction" label="Deduction (mm)"
          hint="Subtracted from window drop" />

      case 'width_drop_based':
        return (
          <div className="grid-2">
            <NumField id="formula_deduction" label="Width deduction (mm)" />
            <NumField id="formula_buffer"    label="Drop deduction (mm)" />
          </div>
        )

      case 'per_interval':
        return (
          <>
            <div className="grid-2">
              <NumField id="formula_buffer"   label="Base qty" step="1" min="0"
                hint="Starting quantity before intervals are counted" />
              <NumField id="formula_interval" label="Interval (mm)" step="50" min="1"
                hint="Add 1 unit per this many mm of width" />
            </div>
            <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>
              e.g. {Number(form.formula_buffer)} base + floor(width ÷ {Number(form.formula_interval)}mm)
            </div>
          </>
        )

      case 'perimeter':
        return (
          <>
            <div style={{ fontSize: 11, color: 'var(--warm-300)', marginBottom: 10 }}>
              Starts with 2 × (width + drop), then apply offsets below.
            </div>
            <div className="grid-2">
              <NumField id="formula_deduction" label="Deduction (mm)"
                hint="Subtract from perimeter — e.g. 200mm" />
              <NumField id="formula_buffer"    label="Addition (mm)"
                hint="Add to perimeter — e.g. 500mm tail allowance" />
            </div>
          </>
        )

      case 'labour':
        return <NumField id="formula_buffer" label="Hours per unit" step="0.25"
          hint="Labour hours per unit produced" />

      default: return null
    }
  }

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={handleOverlayClick}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />

        {/* Unsaved changes banner */}
        {showUnsaved && (
          <div style={{
            background: 'var(--warning-bg)', borderBottom: '1px solid #fed7aa',
            padding: '12px 20px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--warning)' }}>
              You have unsaved changes
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm btn-secondary"
                onClick={() => { setShowUnsaved(false); setDirty(false); onClose() }}>
                Discard
              </button>
              <button className="btn btn-sm btn-primary"
                onClick={() => { setShowUnsaved(false); onSave(form) }}>
                Save
              </button>
            </div>
          </div>
        )}

        <div className="modal-header">
          <div className="modal-title">
            {productComponent ? 'Edit Component' : 'Add Component to Recipe'}
            {dirty && <span style={{ fontSize: 11, color: 'var(--warning)', marginLeft: 8, fontWeight: 500 }}>• Unsaved</span>}
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body">

          {/* Component picker — only when adding */}
          {!productComponent && (
            <div className="field">
              <label className="field-label">Component</label>
              <select className="field-input" value={form.component_id}
                onChange={e => { set('component_id', e.target.value); set('colour_variant', null) }}>
                <option value="">— Select a component —</option>
                {allComponents.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} (${Number(c.unit_cost).toFixed(2)}/{c.unit})
                    {(c.colour_variants || []).length > 0 ? ` · ${c.colour_variants.length} colours` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Component display when editing */}
          {productComponent && (
            <div style={{
              background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
              padding: '10px 12px', marginBottom: 16,
              fontSize: 15, fontWeight: 600
            }}>
              {productComponent.component?.name}
              <div style={{ fontSize: 12, color: 'var(--warm-300)', fontWeight: 400, marginTop: 2 }}>
                ${Number(productComponent.component?.unit_cost || 0).toFixed(2)} per {productComponent.component?.unit}
              </div>
            </div>
          )}

          {/* Colour variant picker — shown when the component has colours defined */}
          {hasColours && (
            <div className="field">
              <label className="field-label">Colour</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {colourVariants.map((v, i) => {
                  const selected = form.colour_variant?.suffix === v.suffix
                  return (
                    <button key={i} type="button"
                      onClick={() => set('colour_variant', selected ? null : v)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                        border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--warm-200)'}`,
                        background: selected ? 'var(--accent-bg)' : 'var(--warm-100)',
                        fontWeight: selected ? 700 : 500, fontSize: 13,
                        color: selected ? 'var(--accent-dark)' : 'var(--ink)',
                      }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: 4,
                        background: colourPreview(v.name),
                        border: '1px solid var(--warm-200)', flexShrink: 0,
                      }} />
                      {v.name}
                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--warm-300)' }}>
                        {v.suffix}
                      </span>
                    </button>
                  )
                })}
              </div>
              {form.colour_variant && (
                <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 6 }}>
                  Part no: {displayComp?.supplier_pn ? `${displayComp.supplier_pn}-${form.colour_variant.suffix}` : form.colour_variant.suffix}
                </div>
              )}
            </div>
          )}

          {/* Cost type */}
          <div className="field" style={{ marginBottom: 8 }}>
            <label className="field-label">Cost Type</label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
            {COST_TYPES.map(ct => (
              <button key={ct.val} type="button"
                className={`cost-type-btn ${form.cost_type === ct.val ? 'selected' : ''}`}
                onClick={() => set('cost_type', ct.val)}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{ct.label}</div>
                <div style={{ fontSize: 10, color: 'var(--warm-300)', fontWeight: 400 }}>{ct.note}</div>
              </button>
            ))}
          </div>

          {/* Formula fields */}
          <div className="formula-box">
            <div className="formula-box-title">Formula Settings</div>
            <FormulaFields />
            {preview && <div className="formula-preview">{preview}</div>}
          </div>

          {/* Remove when editing */}
          {productComponent && onRemove && (
            <>
              <div className="divider" />
              <button className="btn btn-danger btn-block" onClick={onRemove}>
                <TrashIcon size={15} /> Remove from Recipe
              </button>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handleClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }}
            onClick={() => { onSave(form); setDirty(false) }}
            disabled={saving || (!productComponent && !form.component_id)}>
            {saving ? 'Saving...' : productComponent ? 'Save Changes' : 'Add to Recipe'}
          </button>
        </div>
      </div>
    </div>
  )
}

function colourPreview(name) {
  const n = name.toLowerCase()
  if (n.includes('white') || n.includes('wht')) return '#f8f8f8'
  if (n.includes('black') || n.includes('blk')) return '#1a1a1a'
  if (n.includes('silver') || n.includes('sil')) return '#c0c0c0'
  if (n.includes('grey') || n.includes('gray')) return '#808080'
  if (n.includes('bronze') || n.includes('brz')) return '#8B6914'
  if (n.includes('gold')) return '#FFD700'
  if (n.includes('cream')) return '#FFFDD0'
  if (n.includes('brown')) return '#8B4513'
  return 'var(--warm-200)'
}
