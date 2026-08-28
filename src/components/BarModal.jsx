import { useState, useEffect } from 'react'
import { XIcon, TrashIcon } from './Icons'

const DEFAULT = { label: '', length_mm: '', roll_width_mm: '' }

/**
 * One stocked piece of linear material — a track offcut, or a piece of fabric.
 *
 * Fabric reuses the same table and the same modal because a roll IS a bar with
 * a width: the thing that decides whether a cut fits is length for a track and
 * length AND width for fabric. So the only difference here is the extra width
 * field, which fabric can't do without — a 900mm-wide strip and a 3000mm-wide
 * roll of the same length are not interchangeable, and a piece saved without
 * its width could never be matched to a cut again.
 */
export default function BarModal({ open, bar, component, colourVariant, onClose, onSave, onDelete, saving }) {
  const [form, setForm] = useState(DEFAULT)

  const isFabric = component?.order_type === 'fabric'

  useEffect(() => {
    if (!open) return
    setForm(bar
      ? { label: bar.label || '', length_mm: bar.length_mm ?? '', roll_width_mm: bar.roll_width_mm ?? '' }
      : DEFAULT)
  }, [open, bar])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  if (!component) return null

  const isEdit      = !!bar
  const colourLabel = colourVariant ? ` · ${colourVariant.name}` : ''
  const noun        = isFabric ? 'Fabric Piece' : 'Offcut'
  // A fabric piece is only usable if both dimensions are known.
  const complete    = form.label.trim() && Number(form.length_mm) > 0 &&
                      (!isFabric || Number(form.roll_width_mm) > 0)

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div className="modal-title">
            {isEdit ? `Edit ${noun}` : `Add ${noun}`}
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
            <label className="field-label">Label (written on the {isFabric ? 'roll' : 'bar'})</label>
            <input className="field-input" value={form.label}
              onChange={e => set('label', e.target.value)}
              placeholder={isFabric
                ? `e.g. ${form.roll_width_mm || '900'}w offcut`
                : `e.g. ${form.length_mm || '3600'}`}
              autoFocus />
            <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>
              Write this on the physical {isFabric ? 'piece' : 'offcut'} so the {isFabric ? 'cutter' : 'assembler'} can find it
            </div>
          </div>

          {isFabric && (
            <div className="field">
              <label className="field-label">Width (mm)</label>
              <input className="field-input" type="number" step="1" min="1"
                value={form.roll_width_mm}
                onChange={e => set('roll_width_mm', e.target.value)}
                placeholder="e.g. 3000"
                style={{ fontSize: 22, fontWeight: 700, textAlign: 'right' }} />
              <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>
                Across the roll. A blind can't be railroaded, so nothing wider than this can
                ever be cut from this piece however much length it has.
              </div>
            </div>
          )}

          <div className="field">
            <label className="field-label">Length (mm)</label>
            <input className="field-input" type="number" step="1" min="1"
              value={form.length_mm}
              onChange={e => set('length_mm', e.target.value)}
              placeholder={isFabric ? 'e.g. 12000' : 'e.g. 3600'}
              style={{ fontSize: isFabric ? 22 : 28, fontWeight: 700, textAlign: 'right' }} />
            {isFabric && (
              <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>
                Down the roll — how much is left on it.
              </div>
            )}
          </div>

          {isFabric && Number(form.roll_width_mm) > 0 && Number(form.length_mm) > 0 && (
            <div style={{
              padding: '8px 12px', background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
              fontSize: 11.5, color: 'var(--warm-300)',
            }}>
              <strong style={{ color: 'var(--ink)' }}>
                {Number(form.roll_width_mm).toLocaleString()} × {Number(form.length_mm).toLocaleString()}mm
              </strong>
              {' '}· {((Number(form.roll_width_mm) / 1000) * (Number(form.length_mm) / 1000)).toFixed(2)}m²
            </div>
          )}

          {isEdit && (
            <>
              <div className="divider" />
              <button className="btn btn-danger btn-block" onClick={() => onDelete(bar.id)}>
                <TrashIcon size={15} /> Remove {noun}
              </button>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }}
            onClick={() => onSave({
              label:         form.label,
              length_mm:     Number(form.length_mm),
              roll_width_mm: isFabric ? Number(form.roll_width_mm) : null,
            })}
            disabled={saving || !complete}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : `Add ${noun}`}
          </button>
        </div>
      </div>
    </div>
  )
}
