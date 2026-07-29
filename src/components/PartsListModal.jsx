import { useState, useEffect } from 'react'
import { XIcon } from './Icons'

/**
 * Parts-list selection for the parts-bag label.
 * `parts` is the initial list [{ key, name, qty, included }] (from the job BOM).
 * On print, calls onPrint with the chosen rows [{ name, qty }].
 */
export default function PartsListModal({ open, parts, onClose, onPrint, printing }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (open) setRows((parts || []).map(p => ({ ...p })))
  }, [open, parts])

  const toggle = (i) => setRows(r => r.map((x, idx) => idx === i ? { ...x, included: !x.included } : x))
  const setQty = (i, v) => setRows(r => r.map((x, idx) => idx === i ? { ...x, qty: v } : x))

  const selected = rows.filter(x => x.included && Number(x.qty) > 0)

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div className="modal-title">Parts list</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <div style={{ fontSize: 12, color: 'var(--warm-300)', marginBottom: 12 }}>
            Tick the parts that go in the bag and set quantities. The label splits across
            multiple stickers if the list is long.
          </div>

          {rows.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 20px' }}>
              <div className="empty-desc">No components in this job's BOM yet.</div>
            </div>
          ) : rows.map((p, i) => (
            <div key={p.key || i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 0', borderBottom: '1px solid var(--warm-100)',
            }}>
              <input type="checkbox" checked={!!p.included} onChange={() => toggle(i)}
                style={{ width: 18, height: 18, flexShrink: 0, accentColor: 'var(--accent)' }} />
              <div style={{ flex: 1, fontSize: 14, opacity: p.included ? 1 : 0.45 }}>{p.name}</div>
              <input type="number" step="0.001" min="0" value={p.qty} disabled={!p.included}
                onChange={e => setQty(i, e.target.value)}
                className="field-input"
                style={{ width: 72, textAlign: 'right', padding: '6px 8px', fontSize: 14, opacity: p.included ? 1 : 0.45 }} />
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }}
            disabled={printing || selected.length === 0}
            onClick={() => onPrint(selected.map(p => ({ name: p.name, qty: p.qty })))}>
            {printing ? 'Generating…' : `Print ${selected.length} part${selected.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
