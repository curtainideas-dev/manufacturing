import { useState, useEffect } from 'react'
import { XIcon, TrashIcon, PlusIcon } from './Icons'

const UNITS = ['each', 'metres', 'mm', 'm²', 'hours']

const DEFAULT = {
  name: '',
  unit: 'each',
  unit_cost: 0,
  discount: 0,
  supplier_id: '',
  supplier_pn: '',
  notes: '',
  colour_variants: [],
  order_type: 'pack',  // 'pack' | 'bar' | 'labour'
  pack_price: 0,
  pack_qty: 1,
  bar_length_mm: 6000,
  bar_price: 0,
}

export default function ComponentModal({ open, component, suppliers, onClose, onSave, onDelete, saving }) {
  const [form, setForm]                   = useState(DEFAULT)
  const [newColourName, setNewColourName]  = useState('')
  const [newColourSuffix, setNewColourSuffix] = useState('')

  // isEditing = true only when we have an existing saved component (has an id)
  const isEditing = !!component?.id

  useEffect(() => {
    if (open) {
      if (component) {
        setForm({ ...DEFAULT, ...component, colour_variants: component.colour_variants || [] })
      } else {
        setForm(DEFAULT)
      }
      setNewColourName('')
      setNewColourSuffix('')
    }
  }, [open, component])

  const set = (k, v) => setForm(p => {
    const next = { ...p, [k]: v }
    // Lock unit to hours for labour components
    if (k === 'order_type' && v === 'labour') next.unit = 'hours'
    return next
  })

  // When supplier changes, default the discount to the supplier's discount
  const handleSupplierChange = (supplierId) => {
    set('supplier_id', supplierId)
    if (!isEditing) {
      // Only auto-fill discount on new components, not when editing
      const supplier = suppliers.find(s => s.id === supplierId)
      if (supplier && Number(supplier.discount) > 0) {
        set('discount', supplier.discount)
      }
    }
  }

  const addColour = () => {
    if (!newColourName.trim() || !newColourSuffix.trim()) return
    set('colour_variants', [...form.colour_variants, {
      name: newColourName.trim(),
      suffix: newColourSuffix.trim().toUpperCase()
    }])
    setNewColourName('')
    setNewColourSuffix('')
  }

  const removeColour = (idx) => {
    set('colour_variants', form.colour_variants.filter((_, i) => i !== idx))
  }

  // Derive unit cost from pack or bar pricing
  const derivedUnitCost = form.order_type === 'labour'
    ? Number(form.unit_cost) || 0   // entered directly as hourly rate
    : form.order_type === 'pack'
    ? (Number(form.pack_qty) > 0 ? Number(form.pack_price) / Number(form.pack_qty) : 0)
    : (Number(form.bar_length_mm) > 0 ? (Number(form.bar_price) / Number(form.bar_length_mm)) * 1000 : 0)

  const selectedSupplier = suppliers.find(s => s.id === form.supplier_id)
  const supplierDiscount = Number(selectedSupplier?.discount) || 0
  const componentDiscount = Number(form.discount) || 0
  const effectiveDiscount = componentDiscount  // component overrides supplier
  const discountedCost = derivedUnitCost * (1 - effectiveDiscount / 100)

  // Build save payload merging derived unit cost
  const handleSave = () => {
    const unit_cost = form.order_type === 'labour' ? Number(form.unit_cost) || 0 : derivedUnitCost
    onSave({ ...form, unit_cost })
  }

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div className="modal-title">{isEditing ? 'Edit Component' : 'Add Component'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body">
          {/* Name */}
          <div className="field">
            <label className="field-label">Component Name</label>
            <input className="field-input" value={form.name} autoFocus
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Bracket, Flick Stick, Cord" />
          </div>

          {/* Unit — locked to hours for labour */}
          {form.order_type !== 'labour' && (
            <div style={{ marginBottom: 16, maxWidth: '50%' }}>
              <label className="field-label">Unit</label>
              <select className="field-input" value={form.unit} onChange={e => set('unit', e.target.value)}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          )}
          {form.order_type === 'labour' && (
            <div style={{ marginBottom: 16, maxWidth: '50%' }}>
              <label className="field-label">Unit</label>
              <div className="field-input" style={{ background: 'var(--warm-100)', color: 'var(--warm-300)', cursor: 'not-allowed' }}>
                hours
              </div>
            </div>
          )}

          {/* Supplier dropdown */}
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div>
              <label className="field-label">Supplier</label>
              <select className="field-input" value={form.supplier_id} onChange={e => handleSupplierChange(e.target.value)}>
                <option value="">— No supplier —</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{Number(s.discount) > 0 ? ` (${s.discount}% off)` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Base Part No.</label>
              <input className="field-input" value={form.supplier_pn}
                onChange={e => set('supplier_pn', e.target.value)} placeholder="e.g. ACM-BKT" />
            </div>
          </div>

          {/* Order type toggle */}
          <div className="field" style={{ marginBottom: 8 }}>
            <label className="field-label">Order Type</label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[
              { val: 'labour', label: '🕐 Labour', note: 'Hourly rate' },
              { val: 'pack',   label: '📦 Pack',   note: 'Fixed qty per order' },
              { val: 'bar',    label: '📏 Bar',     note: 'Cut to length' },
            ].map(ot => (
              <button key={ot.val} type="button"
                onClick={() => set('order_type', ot.val)}
                style={{
                  padding: '10px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  border: `1.5px solid ${form.order_type === ot.val ? 'var(--accent)' : 'var(--warm-200)'}`,
                  background: form.order_type === ot.val ? 'var(--accent-bg)' : 'var(--warm-100)',
                  textAlign: 'left',
                }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: form.order_type === ot.val ? 'var(--accent-dark)' : 'var(--ink)' }}>
                  {ot.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 2 }}>{ot.note}</div>
              </button>
            ))}
          </div>

          {/* Labour pricing — just a direct hourly rate */}
          {form.order_type === 'labour' && (
            <div style={{ background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--warm-300)', marginBottom: 12 }}>
                Labour Rate
              </div>
              <div>
                <label className="field-label">Hourly Rate ($)</label>
                <input className="field-input" type="number" step="0.01" min="0"
                  value={form.unit_cost} onChange={e => set('unit_cost', e.target.value)} />
                <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 8 }}>
                  Hours per unit are set in the product recipe formula
                </div>
              </div>
            </div>
          )}

          {/* Pack pricing */}
          {form.order_type === 'pack' && (
            <div style={{ background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--warm-300)', marginBottom: 12 }}>
                Pack Pricing
              </div>
              <div className="grid-2">
                <div>
                  <label className="field-label">Pack Price ($)</label>
                  <input className="field-input" type="number" step="0.01" min="0"
                    value={form.pack_price} onChange={e => set('pack_price', e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Units per Pack</label>
                  <input className="field-input" type="number" step="1" min="1"
                    value={form.pack_qty} onChange={e => set('pack_qty', e.target.value)} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 8 }}>
                Unit cost = ${Number(form.pack_price).toFixed(2)} ÷ {Number(form.pack_qty)} = <strong>${derivedUnitCost.toFixed(4)}</strong> per {form.unit}
              </div>
            </div>
          )}

          {/* Bar pricing */}
          {form.order_type === 'bar' && (
            <div style={{ background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--warm-300)', marginBottom: 12 }}>
                Bar / Length Pricing
              </div>
              <div className="grid-2">
                <div>
                  <label className="field-label">Bar Length (mm)</label>
                  <input className="field-input" type="number" step="100" min="1"
                    value={form.bar_length_mm} onChange={e => set('bar_length_mm', e.target.value)}
                    placeholder="e.g. 6000" />
                </div>
                <div>
                  <label className="field-label">Bar Price ($)</label>
                  <input className="field-input" type="number" step="0.01" min="0"
                    value={form.bar_price} onChange={e => set('bar_price', e.target.value)} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 8 }}>
                Unit cost = ${Number(form.bar_price).toFixed(2)} ÷ {Number(form.bar_length_mm)}mm × 1000 = <strong>${derivedUnitCost.toFixed(4)}</strong> per metre
              </div>
            </div>
          )}

          {/* Discount — defaults from supplier, editable per component */}
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div>
              <label className="field-label">
                Discount (%)
                {supplierDiscount > 0 && componentDiscount === supplierDiscount && (
                  <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 6, fontWeight: 400 }}>
                    from supplier
                  </span>
                )}
              </label>
              <input className="field-input" type="number" step="0.1" min="0" max="100"
                value={form.discount} onChange={e => set('discount', e.target.value)} />
              {supplierDiscount > 0 && (
                <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>
                  Supplier default: {supplierDiscount}%
                  {componentDiscount !== supplierDiscount && (
                    <button onClick={() => set('discount', supplierDiscount)}
                      style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>
            {effectiveDiscount > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 2 }}>
                <label className="field-label">Discounted Cost</label>
                <div style={{
                  padding: '10px 12px', background: 'var(--success-bg)',
                  border: '1px solid #a7f3d0', borderRadius: 'var(--radius-sm)',
                  fontSize: 15, fontWeight: 700, color: 'var(--success)'
                }}>
                  ${discountedCost.toFixed(4)}
                  <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 4 }}>per {form.unit}</span>
                </div>
              </div>
            )}
          </div>

          {/* Colour variants */}
          <div className="field" style={{ marginBottom: 8 }}>
            <label className="field-label">Colour Variants</label>
            <div style={{ fontSize: 11, color: 'var(--warm-300)', marginBottom: 8 }}>
              Each variant appends a suffix to the base part no. — e.g. ACM-BKT-<strong>WHT</strong>
            </div>
            {form.colour_variants.map((v, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', background: 'var(--warm-100)',
                borderRadius: 6, marginBottom: 6, border: '1px solid var(--warm-200)'
              }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: colourPreview(v.name), border: '1px solid var(--warm-200)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{v.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--warm-300)', fontFamily: 'monospace' }}>
                    {form.supplier_pn ? `${form.supplier_pn}-` : ''}{v.suffix}
                  </div>
                </div>
                <button onClick={() => removeColour(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
                  <XIcon size={16} />
                </button>
              </div>
            ))}
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

          {isEditing && (
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
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave}
            disabled={saving || !form.name.trim()}>
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Component'}
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