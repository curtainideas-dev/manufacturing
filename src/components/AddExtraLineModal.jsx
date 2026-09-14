import { useState, useMemo } from 'react'
import { XIcon } from './Icons'
import { getStock } from '../lib/stockEngine'

const TYPE_META = {
  bar:    { emoji: '📏', title: 'Tracks & Tubes' },
  fabric: { emoji: '🧵', title: 'Fabrics' },
  labour: { emoji: '🕐', title: 'Labour' },
  pack:   { emoji: '📦', title: 'Components' },
}

const typeMeta = c => TYPE_META[c?.order_type || 'pack'] || TYPE_META.pack

/**
 * Put a part on the BOM that the recipe never asked for.
 *
 * Deliberately the same shape as the swap modal — search, pick, colour, and
 * what it costs before it is committed — because it is the same act from the
 * user's side: choosing a component off the shelf for this job. The one
 * addition is a quantity, since nothing here derives one; the whole reason a
 * line is ad hoc is that no formula produced it.
 *
 * Stock on hand rides on every row for the same reason it does on the swap:
 * the usual question behind "add a joiner" is whether there is a joiner.
 *
 * Parts already on this BOM are not offered. Two lines pointing at one
 * component would merge in the job summary and collide in the quantity
 * snapshot — and if the intent is more of something already there, the answer
 * is its quantity, not a second line.
 */
export default function AddExtraLineModal({
  open, scope = 'window', components = [], stockMap = {},
  excludeIds = [], onClose, onSave,
}) {
  const [search, setSearch]     = useState('')
  const [pickedId, setPickedId] = useState('')
  const [colour, setColour]     = useState(null)
  const [qty, setQty]           = useState('')
  const [note, setNote]         = useState('')

  // Clear the form as the modal opens. Done while rendering rather than in an
  // effect: the reset depends on a prop changing, and an effect would let the
  // previous part and quantity show for a frame before clearing them.
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { setSearch(''); setPickedId(''); setColour(null); setQty(''); setNote('') }
  }

  const exclude = useMemo(() => new Set(excludeIds), [excludeIds])

  const choices = useMemo(() => {
    const q = search.trim().toLowerCase()
    return components
      .filter(c => !exclude.has(c.id))
      .filter(c => !q
        || c.name.toLowerCase().includes(q)
        || (c.kind || '').toLowerCase().includes(q)
        || (c.supplier_pn || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 60)
  }, [components, search, exclude])

  const picked  = components.find(c => c.id === pickedId) || null
  const colours = picked?.colour_variants || []
  const qtyNum  = Number(qty)
  const valid   = !!picked && qtyNum > 0

  if (!open) return null

  const stockLabel = (component, variant) => {
    const row = getStock(stockMap, component, variant)
    const n   = Number(row?.qty_on_hand)
    if (!row || isNaN(n)) return null
    return `${n % 1 === 0 ? n : n.toFixed(2)} on hand`
  }

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div>
            <div className="modal-title">Add component</div>
            <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>
              {scope === 'job'
                ? 'For the job — not tied to any one window'
                : 'This window only'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body">

          <div className="field" style={{ marginBottom: 10 }}>
            <input className="field-input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, kind or part no…" />
          </div>

          <div style={{
            border: '1px solid var(--warm-200)', borderRadius: 'var(--radius-sm)',
            maxHeight: 240, overflowY: 'auto', marginBottom: 14,
          }}>
            {choices.length === 0 ? (
              <div style={{ padding: '18px 14px', fontSize: 12.5, color: 'var(--warm-300)', textAlign: 'center' }}>
                {search
                  ? 'No components match.'
                  : 'Everything is already on this BOM. To need more of a part that is here, change its quantity.'}
              </div>
            ) : choices.map(c => {
              const on    = c.id === pickedId
              const stock = stockLabel(c, null)
              return (
                <button key={c.id} type="button"
                  onClick={() => { setPickedId(c.id); setColour(null) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '9px 12px', border: 'none', cursor: 'pointer',
                    borderBottom: '1px solid var(--warm-100)',
                    background: on ? 'var(--accent-bg)' : '#fff',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: on ? 'var(--accent-dark)' : 'var(--ink)' }}>
                        {typeMeta(c).emoji} {c.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 2 }}>
                        {c.unit}
                        {c.supplier_pn ? ` · ${c.supplier_pn}` : ''}
                        {(c.colour_variants || []).length > 0 ? ` · ${c.colour_variants.length} colours` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>${Number(c.unit_cost || 0).toFixed(2)}</div>
                      {stock && <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 2 }}>{stock}</div>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {colours.length > 0 && (
            <div className="field">
              <label className="field-label">Colour</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {colours.map((v, i) => {
                  const on = colour?.suffix === v.suffix
                  const stock = stockLabel(picked, v)
                  return (
                    <button key={i} type="button"
                      onClick={() => setColour(on ? null : v)}
                      style={{
                        flex: '1 1 30%', minWidth: 90, padding: '8px', borderRadius: 8,
                        cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                        border: `1.5px solid ${on ? 'var(--accent)' : 'var(--warm-200)'}`,
                        background: on ? 'var(--accent-bg)' : '#fff',
                        color: on ? 'var(--accent-dark)' : 'var(--ink)',
                      }}>
                      {v.name}
                      {stock && <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--warm-300)', marginTop: 2 }}>{stock}</div>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="field">
            <label className="field-label">
              Quantity
              {picked && <span style={{ color: 'var(--warm-300)', fontWeight: 400, marginLeft: 6 }}>in {picked.unit}</span>}
            </label>
            <input className="field-input" type="number" inputMode="decimal" min="0" step="any"
              value={qty} onChange={e => setQty(e.target.value)}
              placeholder={picked?.order_type === 'bar' ? 'e.g. 2400 (mm)' : 'e.g. 2'} />
            {/* A bar is counted in millimetres of cut, not in bars — the same
                units the recipe's own lines use, so the two add up. */}
            {picked?.order_type === 'bar' && (
              <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 5 }}>
                Length to cut, in {picked.unit} — this is added to the bar packing like any other cut.
              </div>
            )}
          </div>

          <div className="field">
            <label className="field-label">Why (optional)</label>
            <input className="field-input" value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. track spliced at the bay window" />
            <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 5 }}>
              Shown beside the line, so the next person doesn't have to guess why it's there.
            </div>
          </div>

          {valid && (
            <div style={{
              background: 'var(--accent-dark)', color: '#fff', borderRadius: 'var(--radius)',
              padding: '11px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', opacity: 0.7 }}>
                  Adds to the job
                </div>
                <div style={{ fontSize: 11.5, opacity: 0.7, marginTop: 1 }}>
                  {qtyNum} {picked.unit} × ${Number(picked.unit_cost || 0).toFixed(2)}
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                ${(qtyNum * Number(picked.unit_cost || 0)).toFixed(2)}
              </div>
            </div>
          )}

        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} disabled={!valid}
            onClick={() => onSave({
              component_id:   picked.id,
              colour_variant: colour,
              qty:            qtyNum,
              note:           note.trim() || null,
            })}>
            {!picked ? 'Pick a component'
              : qtyNum > 0 ? `Add ${qtyNum} ${picked.unit}`
              : 'Enter a quantity'}
          </button>
        </div>
      </div>
    </div>
  )
}
