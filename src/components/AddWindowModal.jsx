import { useState } from 'react'
import { XIcon, CheckIcon } from './Icons'
import CustomiseWindowModal from './CustomiseWindowModal'

const DEFAULT = { label: '', product_id: '', width_mm: '', drop_mm: '' }

const TYPES = [
  { val: 'track', label: 'Tracks' },
  { val: 'blind', label: 'Blinds' },
]

/**
 * Two steps: pick the product and size, then answer what decides the build.
 * A product is one identifier now — a profile code or a fabric category — so
 * the picker is a plain list rather than a grid of name-segment filters.
 */
export default function AddWindowModal({
  open, windowNumber, products, productComponentsMap = {}, productOptions = {},
  onClose, onAdd,
}) {
  const [form, setForm]     = useState(DEFAULT)
  const [type, setType]     = useState('track')
  const [search, setSearch] = useState('')
  const [step, setStep]     = useState(1)

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const filtered = products.filter(p =>
    (p.product_type || 'track') === type &&
    (!search || String(p.name).toLowerCase().includes(search.toLowerCase())))

  const selected  = products.find(p => p.id === form.product_id)
  const optionDefs = productOptions[selected?.product_type] || []
  const recipe     = productComponentsMap[form.product_id] || []

  const reset = () => { setForm(DEFAULT); setSearch(''); setStep(1) }
  const handleClose = () => { reset(); onClose() }

  const canContinue = form.product_id && form.width_mm && form.drop_mm

  const handleSave = (config) => {
    onAdd({ ...form, label: form.label || `Window ${windowNumber}`, config })
    reset()
    onClose()
  }

  if (!open) return null

  // Step 2 hands off to the shared customise modal, so adding a window and
  // editing one later ask exactly the same questions.
  if (step === 2 && selected) {
    return (
      <CustomiseWindowModal
        open
        product={selected}
        productComponents={recipe}
        optionDefs={optionDefs}
        widthMm={form.width_mm}
        dropMm={form.drop_mm}
        config={null}
        onClose={() => setStep(1)}
        onSave={handleSave}
        saveLabel="Add window"
      />
    )
  }

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">Add window</div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="field-label">Label (optional)</label>
            <input className="field-input" value={form.label}
              onChange={e => set('label', e.target.value)}
              placeholder={`Window ${windowNumber}`} />
          </div>

          <div style={{ display: 'flex', background: 'var(--warm-100)', borderRadius: 9, padding: 3, marginBottom: 12 }}>
            {TYPES.map(t => (
              <button key={t.val} type="button"
                onClick={() => { setType(t.val); set('product_id', '') }}
                style={{
                  flex: 1, border: 'none', padding: 8, borderRadius: 7, cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: type === t.val ? '#fff' : 'transparent',
                  color: type === t.val ? 'var(--accent-dark)' : 'var(--warm-300)',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="field">
            <label className="field-label">
              Product
              {selected && <span style={{ color: 'var(--accent)', marginLeft: 8, fontWeight: 400 }}>{selected.name}</span>}
            </label>

            <input className="field-input" placeholder="Search…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ fontSize: 13, marginBottom: 8 }} />

            <div style={{
              border: '1px solid var(--warm-200)', borderRadius: 'var(--radius-sm)',
              maxHeight: 200, overflowY: 'auto', background: '#fff',
            }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 13, color: 'var(--warm-300)' }}>
                  No {type === 'track' ? 'tracks' : 'blinds'} match
                </div>
              ) : filtered.map(p => {
                const isSel = p.id === form.product_id
                return (
                  <button key={p.id} type="button" onClick={() => set('product_id', p.id)}
                    style={{
                      width: '100%', textAlign: 'left', cursor: 'pointer',
                      padding: '10px 12px', border: 'none',
                      borderBottom: '1px solid var(--warm-100)',
                      background: isSel ? 'var(--accent-bg)' : '#fff',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      border: `2px solid ${isSel ? 'var(--accent)' : 'var(--warm-200)'}`,
                      background: isSel ? 'var(--accent)' : '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSel && <CheckIcon size={12} color="#fff" />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: isSel ? 700 : 600, color: isSel ? 'var(--accent-dark)' : 'var(--ink)' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 1 }}>
                        {p.component_count ?? 0} recipe line{p.component_count !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid-2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Width (mm)</label>
              <input className="field-input" type="number" value={form.width_mm}
                onChange={e => set('width_mm', e.target.value)}
                placeholder="e.g. 1800" style={{ textAlign: 'right' }} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Drop (mm)</label>
              <input className="field-input" type="number" value={form.drop_mm}
                onChange={e => set('drop_mm', e.target.value)}
                placeholder="e.g. 2100" style={{ textAlign: 'right' }} />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handleClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }}
            onClick={() => optionDefs.length ? setStep(2) : handleSave({ options: {} })}
            disabled={!canContinue}>
            {optionDefs.length ? 'Customise →' : 'Add window'}
          </button>
        </div>
      </div>
    </div>
  )
}
