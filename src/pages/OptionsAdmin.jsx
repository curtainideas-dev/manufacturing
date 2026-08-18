import { useState } from 'react'
import { PlusIcon, TrashIcon, ChevronRightIcon, ChevronLeftIcon } from '../components/Icons'
import OptionModal from '../components/OptionModal'

const TYPES = [
  { val: 'track', label: 'Tracks' },
  { val: 'blind', label: 'Blinds' },
]

/**
 * Defines the questions asked when a window is created — one set per product
 * type. Which components each answer supplies is set on the product's recipe,
 * because that is per product: TCO51's face-fix bracket isn't TCO52's.
 */
export default function OptionsAdmin({
  productOptions, onBack, onSaveOption, onDeleteOption,
  onSaveChoice, onDeleteChoice, saving,
}) {
  const [type, setType]           = useState('track')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [newChoice, setNewChoice] = useState({})   // optionId -> label being typed

  const options = productOptions[type] || []

  const openNew  = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (o) => { setEditing(o); setModalOpen(true) }

  const handleSave = async (data) => {
    await onSaveOption({ ...data, id: editing?.id, product_type: type })
    setModalOpen(false)
  }

  const handleDelete = async (o) => {
    if (!window.confirm(`Delete "${o.name}"?\n\nIts answers and any recipe lines attached to them are removed too.`)) return
    await onDeleteOption(o.id)
    setModalOpen(false)
  }

  const addChoice = async (option) => {
    const label = (newChoice[option.id] || '').trim()
    if (!label) return
    const value = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    await onSaveChoice({
      option_id:  option.id,
      value,
      label,
      sort_order: (option.choices || []).length + 1,
    })
    setNewChoice(p => ({ ...p, [option.id]: '' }))
  }

  return (
    <>
      <div className="header">
        <button className="header-back" onClick={onBack}>
          <ChevronLeftIcon size={18} /> Admin
        </button>
        <div className="header-title" style={{ fontSize: 15 }}>Options</div>
        <div className="header-actions">
          <button onClick={openNew} style={{
            padding: '6px 12px', fontSize: 13, fontWeight: 600,
            background: 'rgba(255,255,255,0.15)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer',
          }}>+ New</button>
        </div>
      </div>

      <div className="scroll-area">
        <div style={{ padding: 16 }}>

          <div style={{ display: 'flex', background: 'var(--warm-100)', borderRadius: 9, padding: 3, marginBottom: 14 }}>
            {TYPES.map(t => (
              <button key={t.val} onClick={() => setType(t.val)}
                style={{
                  flex: 1, border: 'none', padding: 9, borderRadius: 7, cursor: 'pointer',
                  fontSize: 13.5, fontWeight: 600,
                  background: type === t.val ? '#fff' : 'transparent',
                  color: type === t.val ? 'var(--accent-dark)' : 'var(--warm-300)',
                  boxShadow: type === t.val ? 'var(--shadow-sm)' : 'none',
                }}>
                {t.label} ({(productOptions[t.val] || []).length})
              </button>
            ))}
          </div>

          <div style={{ fontSize: 12.5, color: 'var(--warm-300)', marginBottom: 14, lineHeight: 1.5 }}>
            These are the questions asked when a {type === 'track' ? 'track' : 'blind'} window is added.
            Which parts each answer supplies is set on the product's recipe.
          </div>

          {options.length === 0 ? (
            <div className="card">
              <div className="empty-state" style={{ padding: '32px 20px' }}>
                <div className="empty-icon" style={{ fontSize: 32 }}>🎛️</div>
                <div className="empty-title" style={{ fontSize: 17 }}>No options yet</div>
                <div className="empty-desc">
                  Add the questions that decide what goes into a {type === 'track' ? 'track' : 'blind'}
                </div>
                <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={openNew}>
                  <PlusIcon size={15} /> New option
                </button>
              </div>
            </div>
          ) : options.map(o => {
            const parent = options.find(x => x.code === o.depends_on_code)
            const forced = o.forced_values || {}
            return (
              <div key={o.id} className="card" style={{ marginBottom: 12 }}>
                <div style={{
                  padding: '12px 14px', borderBottom: '1px solid var(--warm-100)',
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                }} onClick={() => openEdit(o)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {o.name}
                      {o.required
                        ? <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'var(--danger-bg)', color: 'var(--danger)' }}>required</span>
                        : <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'var(--warm-100)', color: 'var(--warm-300)' }}>optional</span>}
                      {o.spec_only &&
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'var(--blue-bg)', color: 'var(--blue)' }}>spec only</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 2 }}>
                      <code>{o.code}</code>
                      {parent && ` · asked when ${parent.name} is ${(parent.choices || []).find(c => c.value === o.depends_on_value)?.label || o.depends_on_value}`}
                    </div>
                    {parent && Object.keys(forced).length > 0 && (
                      <div style={{ fontSize: 11.5, color: 'var(--accent-dark)', marginTop: 3 }}>
                        otherwise: {Object.entries(forced).map(([pv, mv]) => {
                          const pl = (parent.choices || []).find(c => c.value === pv)?.label || pv
                          const ml = (o.choices || []).find(c => c.value === mv)?.label || mv
                          return `${pl} → ${ml}`
                        }).join(' · ')}
                      </div>
                    )}
                  </div>
                  <ChevronRightIcon size={16} color="var(--warm-200)" />
                </div>

                {/* Answers */}
                <div style={{ padding: '10px 14px 12px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--warm-300)', marginBottom: 7 }}>
                    Answers ({(o.choices || []).length})
                  </div>
                  {(o.choices || []).map(c => (
                    <div key={c.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                      borderBottom: '1px solid var(--warm-100)',
                    }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--warm-300)', marginLeft: 6 }}><code>{c.value}</code></span>
                        {c.selectable === false && (
                          <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '1px 5px', borderRadius: 4, background: 'var(--warm-100)', color: 'var(--warm-300)' }}>
                            auto only
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => onSaveChoice({ ...c, selectable: c.selectable === false })}
                        title={c.selectable === false
                          ? 'Offer this as a button in the customise modal'
                          : 'Hide the button — reachable only when another answer decides it'}
                        style={{
                          background: 'none', border: '1px solid var(--warm-200)', borderRadius: 5,
                          cursor: 'pointer', fontSize: 11, color: 'var(--warm-300)', padding: '2px 7px',
                        }}>
                        {c.selectable === false ? 'Offer as button' : 'Hide button'}
                      </button>
                      <button onClick={() => {
                        if (window.confirm(`Delete answer "${c.label}"?\n\nRecipe lines attached to it are removed too.`)) onDeleteChoice(c.id)
                      }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 2 }}>
                        <TrashIcon size={13} />
                      </button>
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                    <input className="field-input" style={{ flex: 1, fontSize: 13, padding: '7px 10px' }}
                      placeholder="Add an answer…"
                      value={newChoice[o.id] || ''}
                      onChange={e => setNewChoice(p => ({ ...p, [o.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addChoice(o) }} />
                    <button className="btn btn-secondary btn-sm" onClick={() => addChoice(o)} disabled={saving}>Add</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <OptionModal
        open={modalOpen}
        option={editing}
        siblings={options}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
        saving={saving}
      />
    </>
  )
}
