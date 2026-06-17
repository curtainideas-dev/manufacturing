import { useState, useEffect } from 'react'
import { XIcon, TrashIcon } from './Icons'

const DEFAULT = { label: '', length_mm: '' }

export default function BarModal({ open, bar, component, colourVariant, onClose, onSave, onDelete, saving }) {
  const [form, setForm] = useState(DEFAULT)

  useEffect(() => {
    if (open) setForm(bar ? { label: bar.label, length_mm: bar.length_mm } : DEFAULT)
  }, [open, bar])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  if (!component) return null

  const isEdit      = !!bar
  const colourLabel = colourVariant ? ` · ${colourVariant.name}` : ''

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div className="modal-title">
            {isEdit ? 'Edit Offcut' : 'Add Offcut'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>
        <div className="modal-body">

          <div style={{
            background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
            padding: '10px 14px', marginBottom: 20, fontSize: 14, fontWeight: 600
          }}>
            {component.name}{colourLabel}
            <div style={{ fontSize: 12, color: 'var(--warm-300)', fontWeight: 400, marginTop: 2 }}>
              {component.supplier_pn
                ? `${component.supplier_pn}${colourVariant ? `-${colourVariant.suffix}` : ''}`
                : 'No part no.'}
            </div>
          </div>

          <div className="field">
            <label className="field-label">Label (written on bar)</label>
            <input className="field-input" value={form.label}
              onChange={e => set('label', e.target.value)}
              placeholder={`e.g. ${form.length_mm || '3600'}`}
              autoFocus />
            <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>
              Write this on the physical offcut so the assembler can find it
            </div>
          </div>

          <div className="field">
            <label className="field-label">Length (mm)</label>
            <input className="field-input" type="number" step="1" min="1"
              value={form.length_mm}
              onChange={e => set('length_mm', e.target.value)}
              placeholder="e.g. 3600"
              style={{ fontSize: 28, fontWeight: 700, textAlign: 'right' }} />
          </div>

          {isEdit && (
            <>
              <div className="divider" />
              <button className="btn btn-danger btn-block" onClick={() => onDelete(bar.id)}>
                <TrashIcon size={15} /> Remove Offcut
              </button>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }}
            onClick={() => onSave({ ...form, length_mm: Number(form.length_mm) })}
            disabled={saving || !form.label.trim() || !form.length_mm}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Offcut'}
          </button>
        </div>
      </div>
    </div>
  )
}