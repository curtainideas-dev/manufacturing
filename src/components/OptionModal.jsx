import { useState, useEffect } from 'react'
import { XIcon, TrashIcon } from './Icons'

const SELECTIONS = [
  { val: 'single', label: 'Pick one',  note: 'Radio buttons' },
  { val: 'multi',  label: 'Pick any',  note: 'Checkboxes' },
  { val: 'qty',    label: 'Quantity',  note: 'Number entry' },
]

const DEFAULT = {
  code: '', name: '', selection: 'single',
  required: true, spec_only: false, sort_order: 0,
  depends_on_code: '', depends_on_value: '', forced_values: null,
  cost_surcharge: 0, sell_surcharge: 0,
}

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

export default function OptionModal({ open, option, siblings = [], onClose, onSave, onDelete, saving }) {
  const [form, setForm] = useState(DEFAULT)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (open) setForm(option ? { ...DEFAULT, ...option, depends_on_code: option.depends_on_code || '', depends_on_value: option.depends_on_value || '' } : DEFAULT)
  }, [open, option])

  if (!open) return null

  const isNew  = !option
  // Only options that come earlier can be depended on — otherwise the answer
  // this one is gated by might not exist yet when the modal asks.
  const parents = siblings.filter(o => o.id !== option?.id && o.selection === 'single')
  const parent  = parents.find(o => o.code === form.depends_on_code)
  const myChoices = option?.choices || []

  // forced_values maps each *other* value of the parent to an answer here, so
  // a hidden question still resolves instead of blocking the window.
  const forced = form.forced_values || {}
  const setForced = (parentValue, myValue) => {
    const next = { ...forced }
    if (myValue) next[parentValue] = myValue; else delete next[parentValue]
    set('forced_values', Object.keys(next).length ? next : null)
  }

  const canSave = form.name.trim() && (!form.depends_on_code || form.depends_on_value)

  const handleSave = () => {
    if (!canSave) return
    onSave({
      ...form,
      code: (form.code || slug(form.name)).trim(),
      name: form.name.trim(),
      depends_on_code:  form.depends_on_code || null,
      depends_on_value: form.depends_on_code ? form.depends_on_value : null,
      forced_values:    form.depends_on_code ? form.forced_values : null,
      sort_order:       Number(form.sort_order) || 0,
      cost_surcharge:   Number(form.cost_surcharge) || 0,
      sell_surcharge:   Number(form.sell_surcharge) || 0,
    })
  }

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{isNew ? 'New option' : form.name}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="field-label">Question</label>
            <input className="field-input" value={form.name} autoFocus
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Fixing, Control side, Drive" />
            <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>
              Stored as <code>{form.code || slug(form.name) || '…'}</code>
            </div>
          </div>

          <div className="field">
            <label className="field-label">Answer type</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {SELECTIONS.map(s => (
                <button key={s.val} type="button" onClick={() => set('selection', s.val)}
                  style={{
                    padding: '9px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    border: `1.5px solid ${form.selection === s.val ? 'var(--accent)' : 'var(--warm-200)'}`,
                    background: form.selection === s.val ? 'var(--accent-bg)' : '#fff',
                    fontSize: 13, fontWeight: 600,
                    color: form.selection === s.val ? 'var(--accent-dark)' : 'var(--ink)',
                  }}>
                  {s.label}
                  <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--warm-300)', marginTop: 2 }}>{s.note}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button type="button" onClick={() => set('required', !form.required)}
              style={{
                flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
                border: `1.5px solid ${form.required ? 'var(--accent)' : 'var(--warm-200)'}`,
                background: form.required ? 'var(--accent-bg)' : '#fff',
              }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{form.required ? '✓ Required' : 'Optional'}</div>
              <div style={{ fontSize: 11, color: 'var(--warm-300)' }}>
                {form.required ? 'Blocks Add Window' : 'Can be left blank'}
              </div>
            </button>
            <button type="button" onClick={() => set('spec_only', !form.spec_only)}
              style={{
                flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
                border: `1.5px solid ${form.spec_only ? 'var(--blue)' : 'var(--warm-200)'}`,
                background: form.spec_only ? 'var(--blue-bg)' : '#fff',
              }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{form.spec_only ? '✓ Spec only' : 'Affects BOM'}</div>
              <div style={{ fontSize: 11, color: 'var(--warm-300)' }}>
                {form.spec_only ? 'No parts, no cost' : 'Choices supply parts'}
              </div>
            </button>
          </div>

          {/* Conditional visibility */}
          <div style={{ borderTop: '1px solid var(--warm-100)', paddingTop: 14, marginBottom: 14 }}>
            <label className="field-label">Only ask this when…</label>
            <div className="grid-2" style={{ marginBottom: 8 }}>
              <select className="field-input" value={form.depends_on_code}
                onChange={e => { set('depends_on_code', e.target.value); set('depends_on_value', ''); set('forced_values', null) }}>
                <option value="">Always ask</option>
                {parents.map(o => <option key={o.id} value={o.code}>{o.name}</option>)}
              </select>
              <select className="field-input" value={form.depends_on_value} disabled={!parent}
                onChange={e => set('depends_on_value', e.target.value)}>
                <option value="">is…</option>
                {(parent?.choices || []).map(c => <option key={c.id} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            {parent && form.depends_on_value && (
              <div style={{ background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--warm-300)', marginBottom: 6 }}>
                  Otherwise answer it automatically
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginBottom: 8 }}>
                  When it isn't asked, pick the answer that applies — a question answered
                  automatically never blocks the window.
                </div>
                {(parent.choices || []).filter(c => c.value !== form.depends_on_value).map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12.5, flex: 1 }}>{parent.name} is <strong>{c.label}</strong></span>
                    <select className="field-input" style={{ width: 150, fontSize: 12.5, padding: '6px 8px' }}
                      value={forced[c.value] || ''} onChange={e => setForced(c.value, e.target.value)}>
                      <option value="">— leave unanswered —</option>
                      {myChoices.map(mc => <option key={mc.id} value={mc.value}>{mc.label}</option>)}
                    </select>
                  </div>
                ))}
                {myChoices.length === 0 && (
                  <div style={{ fontSize: 11.5, color: 'var(--warning)' }}>
                    Save this option and add its answers first, then come back to set these.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid-2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Sort order</label>
              <input className="field-input" type="number" value={form.sort_order}
                onChange={e => set('sort_order', e.target.value)} style={{ textAlign: 'right' }} />
            </div>
            {form.selection === 'qty' && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-label">Cost per unit ($)</label>
                <input className="field-input" type="number" step="0.01" value={form.cost_surcharge}
                  onChange={e => set('cost_surcharge', e.target.value)} style={{ textAlign: 'right' }} />
              </div>
            )}
          </div>

          {!isNew && (
            <button className="btn btn-danger btn-block" style={{ marginTop: 18 }}
              onClick={() => onDelete(option)}>
              <TrashIcon size={15} /> Delete option
            </button>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving…' : isNew ? 'Create option' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
