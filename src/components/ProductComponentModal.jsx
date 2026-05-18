import { useState, useEffect, useRef } from 'react'
import { XIcon, TrashIcon } from './Icons'

const COST_TYPES = [
  { val: 'fixed',            label: 'Fixed',  note: 'Same qty always' },
  { val: 'width_based',      label: 'Width',  note: 'Based on width' },
  { val: 'drop_based',       label: 'Drop',   note: 'Based on drop' },
  { val: 'width_drop_based', label: 'W × D',  note: 'Fabric / area' },
  { val: 'labour',           label: 'Labour', note: 'Hours per unit' },
]

const DEFAULT = {
  component_id: '',
  cost_type: 'fixed',
  formula_deduction: 0,
  formula_buffer: 1,
  formula_divisor: 75,
}

function preview(form, unit = 'each') {
  const d = Number(form.formula_deduction)
  const b = Number(form.formula_buffer)
  switch (form.cost_type) {
    case 'fixed':            return `Quantity = ${b} ${unit} per unit`
    case 'width_based':      return `Quantity = window width − ${d}mm`
    case 'drop_based':       return `Quantity = window drop − ${d}mm`
    case 'width_drop_based': return `Quantity = (width − ${d}mm) × (drop − ${b}mm)`
    case 'labour':           return `Labour = ${b} hours per unit`
    default: return ''
  }
}

export default function ProductComponentModal({
  open, productComponent, allComponents, onClose, onSave, onRemove, saving
}) {
  const [form, setForm]           = useState(DEFAULT)
  const [dirty, setDirty]         = useState(false)
  const [showUnsaved, setShowUnsaved] = useState(false)
  const initialForm               = useRef(DEFAULT)

  useEffect(() => {
    if (open) {
      const initial = productComponent ? { ...DEFAULT, ...productComponent } : DEFAULT
      setForm(initial)
      initialForm.current = initial
      setDirty(false)
      setShowUnsaved(false)
    }
  }, [open, productComponent])

  const set = (k, v) => {
    setForm(p => ({ ...p, [k]: v }))
    setDirty(true)
  }

  // When user tries to close with unsaved changes, show confirmation instead
  const handleClose = () => {
    if (dirty) {
      setShowUnsaved(true)
    } else {
      onClose()
    }
  }

  // Clicking the overlay also goes through handleClose
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) handleClose()
  }

  const selectedComp = allComponents.find(c => c.id === form.component_id)
  const unit         = selectedComp?.unit || productComponent?.component?.unit || 'each'
  const baseUnitCost = selectedComp?.unit_cost ?? productComponent?.component?.unit_cost ?? 0

  const NumField = ({ id, label, hint, step = '0.1' }) => (
    <div className="field" style={{ marginBottom: hint ? 14 : 10 }}>
      <label className="field-label">{label}</label>
      <input className="field-input" type="number" step={step}
        value={form[id]} onChange={e => set(id, e.target.value)} />
      {hint && <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 5 }}>{hint}</div>}
    </div>
  )

  const FormulaFields = () => {
    switch (form.cost_type) {
      case 'fixed':
        return <NumField id="formula_buffer" label="Quantity per unit"
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
      case 'labour':
        return <NumField id="formula_buffer" label="Hours per unit"
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
                onChange={e => set('component_id', e.target.value)}>
                <option value="">— Select a component —</option>
                {allComponents.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} (${Number(c.unit_cost).toFixed(2)}/{c.unit})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Component name display when editing */}
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

          {/* Cost type */}
          <div className="field" style={{ marginBottom: 8 }}>
            <label className="field-label">Cost Type</label>
          </div>
          <div className="cost-type-grid">
            {COST_TYPES.map(ct => (
              <button key={ct.val} type="button"
                className={`cost-type-btn ${form.cost_type === ct.val ? 'selected' : ''}`}
                onClick={() => set('cost_type', ct.val)}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{ct.label}</div>
                <div style={{ fontSize: 10, color: 'var(--warm-300)', fontWeight: 400 }}>{ct.note}</div>
              </button>
            ))}
          </div>

          {/* Formula fields */}
          <div className="formula-box">
            <div className="formula-box-title">Formula Settings</div>
            <FormulaFields />
            <div className="formula-preview">{preview(form, unit)}</div>
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
