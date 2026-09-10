import { useState } from 'react'
import { ChevronLeftIcon, PlusIcon, TrashIcon } from '../components/Icons'

/**
 * The vocabulary of component kinds — what a part IS, as opposed to how it is
 * bought (that is order_type, and it stays on the component).
 *
 * Open CRUD rather than a fixed list like Fabric Categories, because nobody
 * knows in advance which parts turn out to have alternatives worth naming.
 *
 * Two things make this more than a list of words:
 *
 *   the default order type   picking a kind on a component pre-selects it, so
 *                            "every Winder is a pack" is answered once here
 *                            instead of on every winder.
 *
 *   the rename              components store the kind's NAME, so renaming has
 *                           to carry across to every part using it. That is
 *                           done in one write rather than left to be noticed.
 */

function Tick({ on, title, body, onChange }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
      marginTop: 9, padding: '8px 10px', borderRadius: 'var(--radius-sm)',
      border: `1.5px solid ${on ? 'var(--accent)' : 'var(--warm-200)'}`,
      background: on ? 'var(--accent-bg)' : '#fff',
    }}>
      <input type="checkbox" checked={!!on}
        onChange={e => onChange(e.target.checked)} style={{ marginTop: 2 }} />
      <span>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--warm-300)', marginTop: 2 }}>
          {body}
        </span>
      </span>
    </label>
  )
}

const ORDER_TYPES = [
  { val: '',       label: 'No default',      note: 'ask each time' },
  { val: 'pack',   label: '📦 Pack',          note: 'counted' },
  { val: 'bar',    label: '📏 Bar',           note: 'cut to length' },
  { val: 'fabric', label: '🧵 Fabric',        note: 'off a roll' },
  { val: 'labour', label: '🕐 Labour',        note: 'hours' },
]

export default function ComponentKindsAdmin({
  kinds = [], components = [], onBack, onSave, onDelete, saving,
}) {
  const [newName, setNewName] = useState('')
  const [drafts, setDrafts]   = useState({})   // id -> edited name, while typing

  const usageOf = (name) => components.filter(c => c.kind === name).length

  const add = () => {
    const name = newName.trim()
    if (!name) return
    if (kinds.some(k => k.name.toLowerCase() === name.toLowerCase())) return
    const last = kinds[kinds.length - 1]
    onSave({ name, default_order_type: null, sort_order: (last?.sort_order || 0) + 10 })
    setNewName('')
  }

  // A rename only commits on blur, and only when it actually changed — the
  // write carries every component using the old name across with it.
  const commitName = (kind) => {
    const next = (drafts[kind.id] ?? '').trim()
    setDrafts(d => { const n = { ...d }; delete n[kind.id]; return n })
    if (!next || next === kind.name) return
    if (kinds.some(k => k.id !== kind.id && k.name.toLowerCase() === next.toLowerCase())) return
    onSave({ ...kind, name: next }, kind.name)
  }

  const duplicate = newName.trim()
    && kinds.some(k => k.name.toLowerCase() === newName.trim().toLowerCase())

  return (
    <>
      <div className="header">
        <button className="header-back" onClick={onBack}>
          <ChevronLeftIcon size={18} /> Admin
        </button>
        <div className="header-title" style={{ fontSize: 15 }}>Component Kinds</div>
      </div>

      <div className="scroll-area">
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 12.5, color: 'var(--warm-300)', marginBottom: 14, lineHeight: 1.5 }}>
            What a part <strong>is</strong> — Tube, Winder, Base Rail — as opposed to how it is
            bought, which stays on the component itself. Naming a kind does nothing on its own:
            it groups the component library, and it lets a recipe line offer the parts of that
            kind as alternatives to each other. A recipe still has to ask for that, because
            parts of one kind are not always alternatives — a track takes a left AND a right
            return bracket.
          </div>

          {/* Add */}
          <div className="card" style={{ padding: 12, marginBottom: 14 }}>
            <label className="field-label">New kind</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="field-input" value={newName} style={{ flex: 1 }}
                placeholder="e.g. Bracket, Motor, End Cap"
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && add()} />
              <button className="btn btn-primary" onClick={add}
                disabled={!newName.trim() || duplicate || saving}
                style={{ flexShrink: 0, paddingLeft: 14, paddingRight: 14 }}>
                <PlusIcon size={15} /> Add
              </button>
            </div>
            {duplicate && (
              <div style={{ fontSize: 11.5, color: 'var(--warning)', marginTop: 6, fontWeight: 600 }}>
                “{newName.trim()}” already exists.
              </div>
            )}
          </div>

          {kinds.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon">🔀</div>
                <div className="empty-title">No kinds yet</div>
                <div className="empty-desc">
                  Add one above, then set it on a component to start grouping parts.
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              {kinds.map(kind => {
                const used = usageOf(kind.name)
                return (
                  <div key={kind.id} style={{
                    padding: '12px 14px', borderBottom: '1px solid var(--warm-100)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 16 }}>🔀</span>
                      <input className="field-input" style={{ flex: 1, fontWeight: 600 }}
                        value={drafts[kind.id] ?? kind.name}
                        onChange={e => setDrafts(d => ({ ...d, [kind.id]: e.target.value }))}
                        onBlur={() => commitName(kind)}
                        onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
                      <button
                        onClick={() => onDelete(kind, used)}
                        title={used > 0
                          ? `Used by ${used} component${used !== 1 ? 's' : ''}`
                          : 'Delete this kind'}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: used > 0 ? 'var(--warm-200)' : 'var(--danger)',
                          padding: 4, flexShrink: 0,
                        }}>
                        <TrashIcon size={16} />
                      </button>
                    </div>

                    {/* Two different questions, deliberately two ticks. "Does
                        someone choose this?" and "does the bench need to see
                        it?" have different answers — a chain length is decided
                        by the drop, so nobody is asked, but the bench still has
                        to pick the right one off the rack. */}
                    <Tick
                      on={kind.ask_on_job}
                      onChange={v => onSave({ ...kind, ask_on_job: v })}
                      title={`Ask about the ${kind.name} when a window is added`}
                      body={used > 0
                        ? `Offers the ${used} ${kind.name} component${used !== 1 ? 's' : ''} and their colours, on every product that uses one.`
                        : 'Nothing carries this kind yet, so nothing would be asked.'} />

                    <Tick
                      on={kind.on_cut_sheet}
                      onChange={v => onSave({ ...kind, on_cut_sheet: v })}
                      title={`Print the ${kind.name} on the cut sheet`}
                      body={`Adds "${kind.name}: <part> · <colour>" under each window, so the bench reads it off the sheet instead of the BOM.`} />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11.5, color: 'var(--warm-300)' }}>
                        Usually bought as
                      </span>
                      <select className="field-input"
                        style={{ width: 'auto', flex: '0 1 190px', fontSize: 12.5, padding: '6px 8px' }}
                        value={kind.default_order_type || ''}
                        onChange={e => onSave({ ...kind, default_order_type: e.target.value || null })}>
                        {ORDER_TYPES.map(t => (
                          <option key={t.val} value={t.val}>{t.label} — {t.note}</option>
                        ))}
                      </select>
                      <span style={{
                        fontSize: 11, fontWeight: 600, marginLeft: 'auto',
                        color: used > 0 ? 'var(--accent)' : 'var(--warm-300)',
                      }}>
                        {used > 0 ? `${used} component${used !== 1 ? 's' : ''}` : 'unused'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 12, lineHeight: 1.5 }}>
            Renaming a kind carries every component using it across, so nothing is orphaned.
            A kind still in use can’t be deleted — clear it off those components first.
            A kind that is asked about is asked on every product that uses one — there is no
            per-product opt-out, which is what keeps it predictable.
          </div>
        </div>
      </div>
    </>
  )
}
