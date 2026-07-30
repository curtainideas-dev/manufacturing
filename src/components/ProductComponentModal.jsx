import { useState, useEffect, useRef } from 'react'
import { XIcon, TrashIcon } from './Icons'
import { formulaDescription, GRID_WIDTHS } from '../lib/bomEngine'

const COST_TYPES = [
  { val: 'fixed',            label: 'Fixed',     note: 'Same qty always' },
  { val: 'width_based',      label: 'Width',     note: 'Based on width' },
  { val: 'drop_based',       label: 'Drop',      note: 'Based on drop' },
  { val: 'width_drop_based', label: 'W × D',     note: 'Fabric / area' },
  { val: 'per_interval',     label: 'Interval',  note: 'Base + per Xmm' },
  { val: 'perimeter',        label: 'Perimeter', note: '2×(W+D)' },
  { val: 'labour',           label: 'Labour',    note: 'Hours per unit' },
  { val: 'fixed_per_width',  label: 'Per width', note: 'Qty per width band' },
]

const DEFAULT = {
  component_id: '',
  cost_type: 'fixed',
  formula_deduction: 0,
  formula_buffer: 1,
  formula_divisor: 75,
  formula_interval: 500,
  colour_variant: null,
  width_schedule_id: '',
}

export default function ProductComponentModal({
  open, productComponent, allComponents, suppliers = [],
  widthSchedules = [], onSaveSchedule, onDeleteSchedule,
  onClose, onSave, onRemove, saving
}) {
  const [form, setForm]               = useState(DEFAULT)
  const [dirty, setDirty]             = useState(false)
  const [showUnsaved, setShowUnsaved] = useState(false)
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const initialForm                   = useRef(DEFAULT)

  // Inline schedule editor
  const [editingSchedule, setEditingSchedule] = useState(null) // { id, name, qty_map } | null
  const [scheduleSaving, setScheduleSaving]   = useState(false)

  useEffect(() => {
    if (open) {
      const initial = productComponent
        ? { ...DEFAULT, ...productComponent, width_schedule_id: productComponent.width_schedule_id || '' }
        : DEFAULT
      setForm(initial)
      initialForm.current = initial
      setDirty(false)
      setShowUnsaved(false)
      setSelectedSupplierId('')
      setEditingSchedule(null)
    }
  }, [open, productComponent])

  const selectedSchedule = widthSchedules.find(s => s.id === form.width_schedule_id)

  const startNewSchedule  = () => setEditingSchedule({ id: null, name: '', qty_map: {} })
  // The inline editor below only offers the standard 18-band grid — safe for
  // schedules built from it, but opening it on a schedule with its own finer
  // custom bands (e.g. a supplier chart) would show them all as blank and risk
  // adding unrelated standard-grid entries alongside the real data. Block that.
  const isCustomSchedule = (s) => {
    const keys = Object.keys(s?.qty_map || {}).map(Number)
    return keys.some(k => !GRID_WIDTHS.includes(k))
  }
  const startEditSchedule = () => selectedSchedule && !isCustomSchedule(selectedSchedule) && setEditingSchedule({
    id: selectedSchedule.id, name: selectedSchedule.name, qty_map: { ...(selectedSchedule.qty_map || {}) },
  })

  const setScheduleQty = (w, v) => setEditingSchedule(s => {
    const next = { ...(s.qty_map || {}) }
    if (v === '' || Number(v) === 0) delete next[w]
    else next[w] = Number(v)
    return { ...s, qty_map: next }
  })

  const saveSchedule = async () => {
    if (!editingSchedule?.name.trim()) return
    setScheduleSaving(true)
    const saved = await onSaveSchedule(editingSchedule)
    setScheduleSaving(false)
    if (saved) {
      setForm(p => ({ ...p, width_schedule_id: saved.id }))
      setDirty(true)
      setEditingSchedule(null)
    }
  }

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setDirty(true) }

  const handleClose = () => { dirty ? setShowUnsaved(true) : onClose() }
  const handleOverlayClick = (e) => { if (e.target === e.currentTarget) handleClose() }

  // Filter components by selected supplier — "All" shows everything
  const filteredComponents = selectedSupplierId
    ? allComponents.filter(c => c.supplier_id === selectedSupplierId)
    : allComponents

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
      case 'fixed_per_width':
        return <NumField id="formula_buffer" label="Multiplier" step="1" min="0"
          hint="Applied on top of the schedule's looked-up quantity — e.g. 2 for a centre-open track needing twice the per-leaf figure. Leave at 1 for a single leaf." />
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
      // fixed_per_width renders its own grid below (kept outside this inline
      // component so the inputs don't lose focus on every keystroke)
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

          {/* ---- ADDING: supplier filter then component picker ---- */}
          {!productComponent && (
            <>
              {/* Step 1 — Supplier filter */}
              <div className="field">
                <label className="field-label">Supplier</label>
                <select className="field-input" value={selectedSupplierId}
                  onChange={e => {
                    setSelectedSupplierId(e.target.value)
                    // Reset component selection when supplier changes
                    set('component_id', '')
                    set('colour_variant', null)
                  }}>
                  <option value="">All suppliers</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Step 2 — Component picker (filtered) */}
              <div className="field">
                <label className="field-label">
                  Component
                  {selectedSupplierId && (
                    <span style={{ fontSize: 11, color: 'var(--warm-300)', marginLeft: 6, fontWeight: 400, textTransform: 'none' }}>
                      ({filteredComponents.length} available)
                    </span>
                  )}
                </label>
                <select className="field-input" value={form.component_id}
                  onChange={e => { set('component_id', e.target.value); set('colour_variant', null) }}>
                  <option value="">— Select a component —</option>
                  {filteredComponents.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} · ${Number(c.unit_cost).toFixed(2)}/{c.unit}
                      {(c.colour_variants || []).length > 0 ? ` · ${c.colour_variants.length} colours` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* ---- EDITING: show component name as read-only ---- */}
          {productComponent && (
            <div style={{
              background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
              padding: '10px 12px', marginBottom: 16,
              fontSize: 15, fontWeight: 600
            }}>
              {productComponent.component?.name}
              <div style={{ fontSize: 12, color: 'var(--warm-300)', fontWeight: 400, marginTop: 2 }}>
                {productComponent.component?.supplier && `${productComponent.component.supplier} · `}
                ${Number(productComponent.component?.unit_cost || 0).toFixed(2)} per {productComponent.component?.unit}
              </div>
            </div>
          )}

          {/* Colour variant picker */}
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

          {/* Cost type — only show once a component is selected */}
          {(form.component_id || productComponent) && (
            <>
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

                {/* Width schedule — a shared, named qty-per-width profile.
                    Inline (not inside FormulaFields) so inputs keep focus. */}
                {form.cost_type === 'fixed_per_width' && !editingSchedule && (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--warm-300)', marginBottom: 8 }}>
                      Pick a saved schedule — e.g. Standard, Heavy curtain. A window uses the
                      first width band it fits into. Editing a schedule updates every product
                      that uses it.
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <select className="field-input" value={form.width_schedule_id}
                          onChange={e => set('width_schedule_id', e.target.value)}
                          style={{ fontSize: 13 }}>
                          <option value="">— Select a schedule —</option>
                          {widthSchedules.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      {selectedSchedule && !isCustomSchedule(selectedSchedule) && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={startEditSchedule}>
                          Edit
                        </button>
                      )}
                      <button type="button" className="btn btn-secondary btn-sm" onClick={startNewSchedule}>
                        + New
                      </button>
                    </div>

                    {selectedSchedule && (() => {
                      const bands = Object.keys(selectedSchedule.qty_map || {})
                        .map(Number).filter(n => Number(selectedSchedule.qty_map[n]) > 0).sort((a, b) => a - b)
                      const custom = isCustomSchedule(selectedSchedule)
                      return (
                        <div style={{
                          marginTop: 8, padding: '8px 10px', background: '#fff',
                          border: '1px solid var(--warm-200)', borderRadius: 'var(--radius-sm)',
                          fontSize: 11, color: 'var(--warm-300)', lineHeight: 1.7,
                        }}>
                          {bands.length === 0
                            ? 'This schedule has no quantities set yet.'
                            : custom
                            ? `${bands.length} width bands, ${bands[0].toLocaleString()}–${bands[bands.length - 1].toLocaleString()}mm · qty ${selectedSchedule.qty_map[bands[0]]}–${selectedSchedule.qty_map[bands[bands.length - 1]]}`
                            : bands.map(w => `≤${w.toLocaleString()}: ${selectedSchedule.qty_map[w]}`).join('   ·   ')}
                          {custom && (
                            <div style={{ marginTop: 4, color: 'var(--warning)' }}>
                              Custom bands — not editable here. Ask for the numbers to be updated directly.
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </>
                )}

                {/* Create / edit a schedule */}
                {form.cost_type === 'fixed_per_width' && editingSchedule && (
                  <div style={{
                    padding: 12, background: '#fff', borderRadius: 'var(--radius-sm)',
                    border: '1.5px solid var(--accent)',
                  }}>
                    <div className="field" style={{ marginBottom: 10 }}>
                      <label className="field-label">Schedule name</label>
                      <input className="field-input" autoFocus value={editingSchedule.name}
                        onChange={e => setEditingSchedule(s => ({ ...s, name: e.target.value }))}
                        placeholder="e.g. Heavy curtain" style={{ fontSize: 13 }} />
                    </div>

                    <div style={{ fontSize: 11, color: 'var(--warm-300)', marginBottom: 8 }}>
                      Quantity for each width band. Blank = 0.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {GRID_WIDTHS.map(w => (
                        <div key={w} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontSize: 11, color: 'var(--warm-300)', width: 46,
                            textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums',
                          }}>
                            ≤{w.toLocaleString()}
                          </span>
                          <input className="field-input" type="number" step="1" min="0"
                            value={editingSchedule.qty_map?.[w] ?? ''}
                            onChange={e => setScheduleQty(w, e.target.value)}
                            placeholder="0"
                            style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right' }} />
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }}
                        onClick={() => setEditingSchedule(null)}>Cancel</button>
                      {editingSchedule.id && (
                        <button type="button" className="btn btn-danger btn-sm"
                          onClick={async () => {
                            await onDeleteSchedule(editingSchedule.id)
                            setForm(p => ({ ...p, width_schedule_id: '' }))
                            setEditingSchedule(null)
                          }}>Delete</button>
                      )}
                      <button type="button" className="btn btn-primary btn-sm" style={{ flex: 2 }}
                        onClick={saveSchedule}
                        disabled={scheduleSaving || !editingSchedule.name.trim()}>
                        {scheduleSaving ? 'Saving…' : editingSchedule.id ? 'Save schedule' : 'Create schedule'}
                      </button>
                    </div>
                    {editingSchedule.id && (
                      <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 8 }}>
                        Saving updates every product using this schedule.
                      </div>
                    )}
                  </div>
                )}

                {preview && <div className="formula-preview">{preview}</div>}
              </div>
            </>
          )}

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