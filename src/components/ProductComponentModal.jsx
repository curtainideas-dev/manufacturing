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
  option_choice_id: null,
  group_key: null,
  group_by_kind: false,
  active_min_width: null,
  active_max_width: null,
  active_min_drop: null,
  active_max_drop: null,
  drop_limit: null,
  drop_limit_mode: 'above',
  job_role: null,
  job_alternatives: [],
}

// Roles that come up constantly. Only a seed for the input below — anything
// can be typed, and a role is just its name.
const ROLE_SUGGESTIONS = ['Base rail', 'Winder', 'Bracket', 'Tube', 'Chain', 'Motor']

export default function ProductComponentModal({
  open, productComponent, allComponents, suppliers = [], optionDefs = [],
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

  // Search box over the curated alternatives list
  const [altSearch, setAltSearch] = useState('')

  useEffect(() => {
    if (open) {
      const initial = productComponent
        ? {
            ...DEFAULT, ...productComponent,
            width_schedule_id: productComponent.width_schedule_id || '',
            job_alternatives:  productComponent.job_alternatives || [],
          }
        : DEFAULT
      setForm(initial)
      initialForm.current = initial
      setDirty(false)
      setShowUnsaved(false)
      setSelectedSupplierId(productComponent?.component?.supplier_id || '')
      setEditingSchedule(null)
      setAltSearch('')
    }
  }, [open, productComponent])

  const selectedSchedule = widthSchedules.find(s => s.id === form.width_schedule_id)

  const startNewSchedule  = () => setEditingSchedule({ id: null, name: '', qty_map: {} })
  const startEditSchedule = () => selectedSchedule && setEditingSchedule({
    id: selectedSchedule.id, name: selectedSchedule.name, qty_map: { ...(selectedSchedule.qty_map || {}) },
  })

  // The grid itself — an explicit list of { width up to → qty } bands, same
  // free-form shape as the drop-limit table below. Not tied to GRID_WIDTHS,
  // so a supplier's own chart (e.g. a wave-slider carrier count every 120mm)
  // can be entered at its real breakpoints instead of being approximated.
  const scheduleRows = Object.entries(editingSchedule?.qty_map || {})
    .map(([w, q]) => [Number(w), Number(q)])
    .sort((a, b) => a[0] - b[0])

  const writeScheduleRows = (pairs) => {
    const next = {}
    pairs.forEach(([w, q]) => { if (w > 0) next[w] = Number(q) || 0 })
    setEditingSchedule(s => ({ ...s, qty_map: next }))
  }
  const setScheduleQty    = (w, q)  => writeScheduleRows(scheduleRows.map(r => (r[0] === w ? [w, q] : r)))
  const renameScheduleRow = (w, nw) => writeScheduleRows(scheduleRows.map(r => (r[0] === w ? [Number(nw), r[1]] : r)))
  const removeScheduleRow = (w)     => writeScheduleRows(scheduleRows.filter(r => r[0] !== w))
  const addScheduleRow    = () => {
    const last = scheduleRows[scheduleRows.length - 1]
    writeScheduleRows([...scheduleRows, [last ? last[0] + 120 : 300, last ? last[1] + 2 : 1]])
  }
  // Convenience seed for a schedule that does follow the standard grid —
  // fills in any band not already present, leaves existing rows alone.
  const loadStandardGrid = () => {
    const next = { ...(editingSchedule?.qty_map || {}) }
    GRID_WIDTHS.forEach(w => { if (!(w in next)) next[w] = 0 })
    setEditingSchedule(s => ({ ...s, qty_map: next }))
  }

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

  // Drop-limit table: { <width up to>: <drop limit> }, kept sorted by width.
  const limitRows = Object.entries(form.drop_limit || {})
    .map(([w, d]) => [Number(w), Number(d)])
    .sort((a, b) => a[0] - b[0])

  const writeLimits = (pairs) => {
    const next = {}
    pairs.forEach(([w, d]) => { if (w > 0) next[w] = Number(d) || 0 })
    set('drop_limit', Object.keys(next).length ? next : null)
  }
  const setLimit    = (w, d)  => writeLimits(limitRows.map(r => (r[0] === w ? [w, d] : r)))
  const removeLimit = (w)     => writeLimits(limitRows.filter(r => r[0] !== w))
  const renameLimit = (w, nw) => writeLimits(limitRows.map(r => (r[0] === w ? [Number(nw), r[1]] : r)))
  const addLimit    = ()      => {
    const last = limitRows[limitRows.length - 1]
    writeLimits([...limitRows, [last ? last[0] + 100 : 2000, last ? last[1] : 1800]])
  }

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

  /* ---- Curated alternatives for a job role -------------------------------
   * Defaults to the same kind of part as the line itself — a base rail is
   * replaced by another bar, not by a labour line — because that is nearly
   * always the intent, and an unfiltered library is too long to pick from.
   * Anything already ticked stays visible whatever the search says, so a
   * chosen alternative can never be silently un-pickable.
   * --------------------------------------------------------------------- */
  const altChoices = (() => {
    const q    = altSearch.trim().toLowerCase()
    const kind = displayComp?.order_type || 'pack'
    return allComponents
      .filter(c => c.id !== form.component_id)
      .filter(c => form.job_alternatives.includes(c.id) || (c.order_type || 'pack') === kind)
      .filter(c => form.job_alternatives.includes(c.id) || !q
        || c.name.toLowerCase().includes(q)
        || (c.supplier_pn || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const pick = form.job_alternatives
        const d = (pick.includes(b.id) ? 1 : 0) - (pick.includes(a.id) ? 1 : 0)
        return d || a.name.localeCompare(b.name)
      })
  })()

  const toggleAlternative = (id) => set('job_alternatives',
    form.job_alternatives.includes(id)
      ? form.job_alternatives.filter(x => x !== id)
      : [...form.job_alternatives, id])

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

          {/* Supplier filter + component picker. Editable in both add and
              edit mode — swapping a line to a different component keeps its
              cost type, formula and option/group linkage untouched, which is
              what makes it useful for rebuilding a product skeleton onto a
              different series. */}
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
            {displayComp && (
              <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 6 }}>
                {displayComp.supplier && `${displayComp.supplier} · `}
                ${Number(displayComp.unit_cost || 0).toFixed(2)} per {displayComp.unit}
              </div>
            )}
          </div>

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
                      {selectedSchedule && (
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
                      return (
                        <div style={{
                          marginTop: 8, padding: '8px 10px', background: '#fff',
                          border: '1px solid var(--warm-200)', borderRadius: 'var(--radius-sm)',
                          fontSize: 11, color: 'var(--warm-300)', lineHeight: 1.7,
                        }}>
                          {bands.length === 0
                            ? 'This schedule has no quantities set yet.'
                            : bands.length > 8
                            ? `${bands.length} width bands, ${bands[0].toLocaleString()}–${bands[bands.length - 1].toLocaleString()}mm · qty ${selectedSchedule.qty_map[bands[0]]}–${selectedSchedule.qty_map[bands[bands.length - 1]]} · Edit to see every band`
                            : bands.map(w => `≤${w.toLocaleString()}: ${selectedSchedule.qty_map[w]}`).join('   ·   ')}
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
                      Width up to → quantity, read straight off a supplier's chart. A window uses
                      the first band its width fits into — bands don't have to be evenly spaced.
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 28px', gap: 6, marginBottom: 4 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--warm-300)' }}>Width up to (mm)</div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--warm-300)' }}>Quantity</div>
                      <div />
                    </div>

                    <div style={{ maxHeight: 280, overflowY: 'auto', paddingRight: 2 }}>
                      {scheduleRows.map(([w, q]) => (
                        <div key={w} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 28px', gap: 6, marginBottom: 5 }}>
                          <input className="field-input" style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right' }}
                            type="number" value={w} onChange={e => renameScheduleRow(w, e.target.value)} />
                          <input className="field-input" style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right' }}
                            type="number" step="1" min="0" value={q} onChange={e => setScheduleQty(w, e.target.value)} />
                          <button type="button" onClick={() => removeScheduleRow(w)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>
                            <TrashIcon size={14} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button type="button" onClick={addScheduleRow}
                        style={{
                          flex: 1, padding: '7px', borderRadius: 6, fontSize: 12.5,
                          fontWeight: 600, cursor: 'pointer', border: '1.5px dashed var(--warm-200)',
                          background: 'none', color: 'var(--warm-300)',
                        }}>+ Add band</button>
                      <button type="button" onClick={loadStandardGrid}
                        style={{
                          flex: 1, padding: '7px', borderRadius: 6, fontSize: 12.5,
                          fontWeight: 600, cursor: 'pointer', border: '1.5px dashed var(--warm-200)',
                          background: 'none', color: 'var(--warm-300)',
                        }}>+ Standard 300mm grid</button>
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

          {/* When does this line apply? — the link between an option's answer
              and the parts it actually supplies. */}
          {form.component_id && (
            <>
              <div className="divider" />
              <label className="field-label">When is this used?</label>

              <select className="field-input" style={{ marginBottom: 10 }}
                value={form.option_choice_id || ''}
                onChange={e => set('option_choice_id', e.target.value || null)}>
                <option value="">Always — part of the base recipe</option>
                {optionDefs.filter(o => !o.spec_only).map(o => (
                  <optgroup key={o.id} label={o.name}>
                    {(o.choices || []).map(c => (
                      <option key={c.id} value={c.id}>{o.name} is {c.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {optionDefs.length === 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: -4, marginBottom: 10 }}>
                  No options defined for this product type yet — add them under Products → Options.
                </div>
              )}

              {/* Alternatives — named by the part's kind, decided by the
                  recipe. A shared kind is deliberately not enough on its own:
                  Track Return FF Wave L and R are the same kind and a
                  "Both ends" track takes both, so grouping has to be asked
                  for, never assumed. */}
              <div className="field" style={{ marginBottom: 10 }}>
                <label className="field-label">Alternatives</label>

                {displayComp?.kind ? (
                  <>
                    <label style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
                      padding: '9px 11px', borderRadius: 'var(--radius-sm)',
                      border: `1.5px solid ${form.group_by_kind ? 'var(--accent)' : 'var(--warm-200)'}`,
                      background: form.group_by_kind ? 'var(--accent-bg)' : '#fff',
                    }}>
                      <input type="checkbox" checked={!!form.group_by_kind}
                        onChange={e => set('group_by_kind', e.target.checked)}
                        style={{ marginTop: 2 }} />
                      <span>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>
                          One of the {displayComp.kind}s
                        </span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--warm-300)', marginTop: 2 }}>
                          Competes with the other {displayComp.kind} lines in this recipe — exactly
                          one reaches the window. Leave off for parts that are used together.
                        </span>
                      </span>
                    </label>
                    <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 5 }}>
                      The group is named by the part's kind, set in the component library.
                      Rename it there and every recipe follows.
                    </div>
                  </>
                ) : (
                  <div style={{
                    background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
                    padding: '9px 12px', fontSize: 11.5, color: 'var(--warm-300)',
                  }}>
                    {displayComp?.name || 'This part'} has no <strong>Kind</strong> yet. Set one on it in
                    the component library — Tube, Winder, Base Rail — and it can then be
                    grouped with its alternatives here.
                  </div>
                )}

                {/* Anything named by hand before kinds existed still works and
                    still wins, so it is shown rather than silently overridden. */}
                {form.group_key && (
                  <div style={{
                    background: 'var(--warning-bg)', borderLeft: '3px solid var(--warning)',
                    borderRadius: 'var(--radius-sm)', padding: '8px 11px', marginTop: 8,
                    fontSize: 11.5, color: 'var(--warning)',
                  }}>
                    Grouped by hand as <strong>{form.group_key}</strong>, which overrides the kind.
                    <button type="button" onClick={() => set('group_key', null)}
                      style={{ background: 'none', border: 'none', padding: 0, marginLeft: 6, cursor: 'pointer', font: 'inherit', fontWeight: 700, textDecoration: 'underline', color: 'inherit' }}>
                      clear it
                    </button>
                  </div>
                )}
              </div>

              {/* Customisable on the job — see supabase_job_role_slots.sql.
                  Naming the line turns it into a question asked while the job
                  is being entered; the list below is what that question offers
                  as answers. Left unnamed (the default) nothing changes. */}
              <div className="divider" />
              <div className="field" style={{ marginBottom: 10 }}>
                <label className="field-label">Ask about this on the job (optional)</label>
                <input className="field-input" value={form.job_role || ''}
                  onChange={e => set('job_role', e.target.value || null)}
                  placeholder="e.g. Base rail, Winder, Bracket" list="job-role-suggestions" />
                <datalist id="job-role-suggestions">
                  {ROLE_SUGGESTIONS.map(r => <option key={r} value={r} />)}
                </datalist>
                <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>
                  Named, this part becomes a question when a window is added — answered
                  alongside the fabric, not hunted down on the BOM afterwards. Leave blank
                  and it stays a plain recipe line.
                </div>
              </div>

              {form.job_role && (
                <div className="field" style={{ marginBottom: 12 }}>
                  <label className="field-label">
                    Alternatives offered
                    {altChoices.length > 0 && (
                      <span style={{ color: 'var(--warm-300)', fontWeight: 400, marginLeft: 6 }}>
                        {form.job_alternatives.length} picked
                      </span>
                    )}
                  </label>

                  <input className="field-input" value={altSearch}
                    onChange={e => setAltSearch(e.target.value)}
                    placeholder="Search components…"
                    style={{ fontSize: 13, marginBottom: 8 }} />

                  <div style={{
                    border: '1px solid var(--warm-200)', borderRadius: 'var(--radius-sm)',
                    maxHeight: 190, overflowY: 'auto', background: '#fff',
                  }}>
                    {altChoices.length === 0 ? (
                      <div style={{ padding: '16px 14px', textAlign: 'center', fontSize: 12.5, color: 'var(--warm-300)' }}>
                        No other components match.
                      </div>
                    ) : altChoices.map(c => {
                      const on = form.job_alternatives.includes(c.id)
                      return (
                        <button key={c.id} type="button" onClick={() => toggleAlternative(c.id)}
                          style={{
                            width: '100%', textAlign: 'left', cursor: 'pointer',
                            padding: '8px 12px', border: 'none',
                            borderBottom: '1px solid var(--warm-100)',
                            background: on ? 'var(--accent-bg)' : '#fff',
                            display: 'flex', alignItems: 'center', gap: 10,
                          }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                            border: `2px solid ${on ? 'var(--accent)' : 'var(--warm-200)'}`,
                            background: on ? 'var(--accent)' : '#fff',
                          }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: on ? 700 : 600, color: on ? 'var(--accent-dark)' : 'var(--ink)' }}>
                              {c.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 1 }}>
                              {c.unit}
                              {c.supplier_pn ? ` · ${c.supplier_pn}` : ''}
                              {(c.colour_variants || []).length > 0 ? ` · ${c.colour_variants.length} colours` : ''}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 5 }}>
                    {displayComp?.name || 'The recipe’s own part'} is always offered first
                    and is the default — no need to list it. Picking none is fine: the part stays
                    fixed and only its colour is the job's to choose.
                  </div>
                </div>
              )}

              <label className="field-label">Only for sizes in this range (optional)</label>
              <div className="grid-2" style={{ marginBottom: 8 }}>
                <input className="field-input" type="number" placeholder="min width" style={{ textAlign: 'right' }}
                  value={form.active_min_width ?? ''}
                  onChange={e => set('active_min_width', e.target.value === '' ? null : Number(e.target.value))} />
                <input className="field-input" type="number" placeholder="max width" style={{ textAlign: 'right' }}
                  value={form.active_max_width ?? ''}
                  onChange={e => set('active_max_width', e.target.value === '' ? null : Number(e.target.value))} />
              </div>
              <div className="grid-2">
                <input className="field-input" type="number" placeholder="min drop" style={{ textAlign: 'right' }}
                  value={form.active_min_drop ?? ''}
                  onChange={e => set('active_min_drop', e.target.value === '' ? null : Number(e.target.value))} />
                <input className="field-input" type="number" placeholder="max drop" style={{ textAlign: 'right' }}
                  value={form.active_max_drop ?? ''}
                  onChange={e => set('active_max_drop', e.target.value === '' ? null : Number(e.target.value))} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4, marginBottom: 12 }}>
                Leave blank for no limit. This is how a wider blind swaps to a heavier tube.
              </div>

              {/* Width → drop threshold. A table rather than a formula, because
                  real thresholds don't move in one direction. */}
              <label className="field-label">Drop limit per width (optional)</label>
              <div style={{
                border: '1px solid var(--warm-200)', borderRadius: 'var(--radius-sm)',
                padding: 10, background: '#fff',
              }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {[
                    { val: 'above',       label: 'Applies over the limit' },
                    { val: 'at_or_below', label: 'Applies up to the limit' },
                  ].map(m => (
                    <button key={m.val} type="button"
                      onClick={() => set('drop_limit_mode', m.val)}
                      style={{
                        flex: 1, padding: '7px 6px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                        fontWeight: 600,
                        border: `1.5px solid ${(form.drop_limit_mode || 'above') === m.val ? 'var(--accent)' : 'var(--warm-200)'}`,
                        background: (form.drop_limit_mode || 'above') === m.val ? 'var(--accent-bg)' : '#fff',
                        color: (form.drop_limit_mode || 'above') === m.val ? 'var(--accent-dark)' : 'var(--ink)',
                      }}>{m.label}</button>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 28px', gap: 6, marginBottom: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--warm-300)' }}>Width up to</div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--warm-300)' }}>Drop limit</div>
                  <div />
                </div>

                {limitRows.map(([w, d]) => (
                  <div key={w} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 28px', gap: 6, marginBottom: 5 }}>
                    <input className="field-input" style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right' }}
                      type="number" value={w} onChange={e => renameLimit(w, e.target.value)} />
                    <input className="field-input" style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right' }}
                      type="number" value={d} onChange={e => setLimit(w, e.target.value)} />
                    <button type="button" onClick={() => removeLimit(w)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>
                      <TrashIcon size={14} />
                    </button>
                  </div>
                ))}

                <button type="button" onClick={addLimit}
                  style={{
                    width: '100%', marginTop: 4, padding: '7px', borderRadius: 6, fontSize: 12.5,
                    fontWeight: 600, cursor: 'pointer', border: '1.5px dashed var(--warm-200)',
                    background: 'none', color: 'var(--warm-300)',
                  }}>+ Add width band</button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 6, lineHeight: 1.5 }}>
                Read as: up to that width, the limit is that drop. A width past the last band uses
                the last band's figure. Thresholds don't have to rise or fall in order —
                2000&nbsp;→&nbsp;1800, 2100&nbsp;→&nbsp;1600, 2200&nbsp;→&nbsp;1800 is fine, which is
                why it's a table and not a formula.
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
            disabled={saving || !form.component_id}>
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