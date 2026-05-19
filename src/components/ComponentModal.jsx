import { useState, useEffect } from 'react'
import { XIcon, TrashIcon, PlusIcon } from './Icons'

const UNITS = ['each', 'metres', 'mm', 'm²', 'hours']
const DEFAULT = {
  name: '', unit: 'each', unit_cost: 0, discount: 0,
  supplier: '', supplier_pn: '', notes: '',
  colour_variants: [], // [{ name: 'White', suffix: 'WHT' }]
}

export default function ComponentModal({ open, component, onClose, onSave, onDelete, saving }) {
  const [form, setForm]               = useState(DEFAULT)
  const [newColourName, setNewColourName] = useState('')
  const [newColourSuffix, setNewColourSuffix] = useState('')

  useEffect(() => {
    if (open) setForm(component
      ? { ...DEFAULT, ...component, colour_variants: component.colour_variants || [] }
      : DEFAULT
    )
    setNewColourName('')
    setNewColourSuffix('')
  }, [open, component])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const addColour = () => {
    if (!newColourName.trim() || !newColourSuffix.trim()) return
    const variant = { name: newColourName.trim(), suffix: newColourSuffix.trim().toUpperCase() }
    set('colour_variants', [...form.colour_variants, variant])
    setNewColourName('')
    setNewColourSuffix('')
  }

  const removeColour = (idx) => {
    set('colour_variants', form.colour_variants.filter((_, i) => i !== idx))
  }

  const discountedCost = Number(form.unit_cost) * (1 - (Number(form.discount) || 0) / 100)
  const hasColours     = form.colour_variants.length > 0

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div className="modal-title">{component ? 'Edit Component' : 'Add Component'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="field-label">Component Name</label>
            <input className="field-input" value={form.name} autoFocus
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Bracket, Flick Stick, Cord" />
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div>
              <label className="field-label">Unit</label>
              <select className="field-input" value={form.unit} onChange={e => set('unit', e.target.value)}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Unit Cost ($)</label>
              <input className="field-input" type="number" step="0.01" min="0"
                value={form.unit_cost} onChange={e => set('unit_cost', e.target.value)} />
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div>
              <label className="field-label">Discount (%)</label>
              <input className="field-input" type="number" step="0.1" min="0" max="100"
                value={form.discount} onChange={e => set('discount', e.target.value)} />
            </div>
            {Number(form.discount) > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 2 }}>
                <label className="field-label">Discounted Cost</label>
                <div style={{
                  padding: '10px 12px', background: 'var(--success-bg)',
                  border: '1px solid #a7f3d0', borderRadius: 'var(--radius-sm)',
                  fontSize: 15, fontWeight: 700, color: 'var(--success)'
                }}>
                  ${discountedCost.toFixed(2)}
                  <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 4 }}>per {form.unit}</span>
                </div>
              </div>
            )}
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div>
              <label className="field-label">Supplier</label>
              <input className="field-input" value={form.supplier}
                onChange={e => set('supplier', e.target.value)} placeholder="e.g. Acmeda" />
            </div>
            <div>
              <label className="field-label">Base Part No.</label>
              <input className="field-input" value={form.supplier_pn}
                onChange={e => set('supplier_pn', e.target.value)} placeholder="e.g. ACM-BKT" />
            </div>
          </div>

          {/* Colour variants */}
          <div className="field" style={{ marginBottom: 8 }}>
            <label className="field-label">Colour Variants</label>
            <div style={{ fontSize: 11, color: 'var(--warm-300)', marginBottom: 8 }}>
              Each variant appends a suffix to the base part no. — e.g. ACM-BKT-<strong>WHT</strong>
            </div>

            {/* Existing variants */}
            {hasColours && (
              <div style={{ marginBottom: 10 }}>
                {form.colour_variants.map((v, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', background: 'var(--warm-100)',
                    borderRadius: 6, marginBottom: 6,
                    border: '1px solid var(--warm-200)'
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 6,
                      background: colourPreview(v.name),
                      border: '1px solid var(--warm-200)', flexShrink: 0
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{v.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--warm-300)', fontFamily: 'monospace' }}>
                        {form.supplier_pn ? `${form.supplier_pn}-` : ''}{v.suffix}
                      </div>
                    </div>
                    <button onClick={() => removeColour(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
                      <XIcon size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new colour */}
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="field-input" style={{ flex: 2, fontSize: 13 }}
                placeholder="Colour name (e.g. White)"
                value={newColourName} onChange={e => setNewColourName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addColour()} />
              <input className="field-input" style={{ flex: 1, fontSize: 13, fontFamily: 'monospace' }}
                placeholder="Suffix"
                value={newColourSuffix} onChange={e => setNewColourSuffix(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addColour()} />
              <button className="btn btn-secondary btn-sm" onClick={addColour}
                disabled={!newColourName.trim() || !newColourSuffix.trim()}>
                <PlusIcon size={14} />
              </button>
            </div>
          </div>

          <div className="field" style={{ marginTop: 8 }}>
            <label className="field-label">Notes</label>
            <textarea className="field-input" rows={2} placeholder="Optional notes..."
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          {component && (
            <>
              <div className="divider" />
              <button className="btn btn-danger btn-block" onClick={() => onDelete(component.id)}>
                <TrashIcon size={15} /> Delete Component
              </button>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => onSave(form)}
            disabled={saving || !form.name.trim()}>
            {saving ? 'Saving...' : component ? 'Save Changes' : 'Add Component'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Simple colour preview — maps common colour names to CSS colours
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
