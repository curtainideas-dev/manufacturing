import { useState, useEffect, useMemo } from 'react'
import { XIcon } from './Icons'
import { getStock } from '../lib/stockEngine'

const TYPE_META = {
  bar:    { emoji: '📏', title: 'Tracks & Tubes' },
  fabric: { emoji: '🧵', title: 'Fabrics' },
  labour: { emoji: '🕐', title: 'Labour' },
  pack:   { emoji: '📦', title: 'Components' },
}

/**
 * Pick the component a recipe line should be built from instead.
 *
 * Defaults to offering only the same kind of part as the one being replaced —
 * a base rail swaps for another bar, not for a labour line — since that is
 * nearly always the intent, with an escape hatch for the times it isn't.
 *
 * Stock on hand is on every row, because the usual reason to swap is that a
 * different part is the one actually sitting on the shelf.
 *
 * The recipe's own part is offered too, and always first. Picking it is how a
 * swap is undone, and — where it has colours — how the same part is taken in a
 * different one, which is a swap in its own right and a common one.
 */
export default function SwapComponentModal({
  open, scope = 'window', line, components = [], stockMap = {},
  excludeIds = [], onClose, onSave,
}) {
  const [search, setSearch]   = useState('')
  const [allTypes, setAllTypes] = useState(false)
  const [pickedId, setPickedId] = useState('')
  const [colour, setColour]     = useState(null)

  // The part the recipe asks for — the swap always replaces that, never
  // whatever it was last swapped to, so re-swapping can't chain.
  const original = line?.substituted_from?.component || line?.component
  const current  = line?.substituted_from ? line.component : null

  useEffect(() => {
    if (open) {
      setSearch('')
      setAllTypes(false)
      // Opens on what is in force right now — the swap if there is one, the
      // recipe's part if there isn't — rather than on nothing, so the colour
      // swatches for the current part are there to change straight away.
      setPickedId(current?.id || original?.id || '')
      setColour(line?.colour_variant || null)
    }
  }, [open, line, current, original])

  const originalType = original?.order_type || 'pack'
  const exclude = useMemo(() => new Set(excludeIds), [excludeIds])

  const choices = useMemo(() => {
    const q = search.trim().toLowerCase()
    // The recipe's own part is never filtered out — not by kind, not by
    // search, and not by the already-on-this-BOM exclusion it is guaranteed
    // to trip, since it IS what's on the BOM.
    const isOriginal = c => c.id === original?.id
    return components
      .filter(c => isOriginal(c) || !exclude.has(c.id) || c.id === current?.id)
      .filter(c => isOriginal(c) || allTypes || (c.order_type || 'pack') === originalType)
      .filter(c => isOriginal(c) || !q
        || c.name.toLowerCase().includes(q)
        || (c.supplier_pn || '').toLowerCase().includes(q)
        || (c.supplier || '').toLowerCase().includes(q))
      .sort((a, b) => (isOriginal(b) ? 1 : 0) - (isOriginal(a) ? 1 : 0)
        || a.name.localeCompare(b.name))
  }, [components, search, allTypes, originalType, original, exclude, current])

  const picked  = components.find(c => c.id === pickedId) || null
  const colours = picked?.colour_variants || []

  // What is in force on this line right now, so a save that would change
  // nothing can't be offered as though it would.
  const inForce = { id: line?.component?.id, suffix: line?.colour_variant?.suffix || '' }
  const changed = !!picked
    && (picked.id !== inForce.id || (colour?.suffix || '') !== inForce.suffix)

  if (!open || !line) return null

  // "12 on hand" for whichever colour is in play — the whole point of the
  // swap is usually what's on the shelf, so it can't be a click away.
  const stockLabel = (component, variant) => {
    const row = getStock(stockMap, component, variant)
    const n   = Number(row?.qty_on_hand)
    if (!row || isNaN(n)) return null
    return `${n % 1 === 0 ? n : n.toFixed(2)} on hand`
  }

  const meta = TYPE_META[originalType] || TYPE_META.pack

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div>
            <div className="modal-title">Swap component</div>
            <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>
              {scope === 'job' ? 'Every window in this job' : 'This window only'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body">

          {/* What's being replaced */}
          <div style={{
            background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
            padding: '10px 13px', marginBottom: 14,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--warm-300)', marginBottom: 3 }}>
              Recipe calls for
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{meta.emoji} {original?.name || '—'}</div>
            <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 2 }}>
              {original?.unit}
              {original?.supplier_pn ? ` · ${original.supplier_pn}` : ''}
              {' · $'}{Number(original?.unit_cost || 0).toFixed(2)}
            </div>
          </div>

          <div className="field" style={{ marginBottom: 10 }}>
            <input className="field-input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${allTypes ? 'every component' : meta.title.toLowerCase()}…`} />
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12,
            fontSize: 12.5, color: 'var(--warm-300)', cursor: 'pointer',
          }}>
            <input type="checkbox" checked={allTypes} onChange={e => setAllTypes(e.target.checked)} />
            Look outside {meta.title.toLowerCase()} — show every component
          </label>

          {/* Candidates */}
          <div style={{
            border: '1px solid var(--warm-200)', borderRadius: 'var(--radius-sm)',
            maxHeight: 260, overflowY: 'auto', marginBottom: 14,
          }}>
            {choices.length === 0 ? (
              <div style={{ padding: '18px 14px', fontSize: 12.5, color: 'var(--warm-300)', textAlign: 'center' }}>
                {exclude.size > 0
                  ? 'Nothing to swap to. Components already on this BOM are not offered — two lines of the same part would merge.'
                  : 'No components match.'}
              </div>
            ) : choices.map(c => {
              const on = c.id === pickedId
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
                        {(TYPE_META[c.order_type || 'pack'] || TYPE_META.pack).emoji} {c.name}
                        {c.id === original?.id && (
                          <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '1px 5px', borderRadius: 4, background: 'var(--warm-100)', color: 'var(--warm-300)' }}>
                            as specified
                          </span>
                        )}
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

          {/* Colour, when the chosen part has variants */}
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

          {/* What the swap costs, before it's committed */}
          {picked && (
            <div style={{
              background: 'var(--accent-dark)', color: '#fff', borderRadius: 'var(--radius)',
              padding: '11px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', opacity: 0.7 }}>
                  Unit cost
                </div>
                <div style={{ fontSize: 11.5, opacity: 0.7, marginTop: 1 }}>
                  was ${Number(original?.unit_cost || 0).toFixed(2)} per {original?.unit}
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>${Number(picked.unit_cost || 0).toFixed(2)}</div>
            </div>
          )}

          {picked && original && picked.unit !== original.unit && (
            <div style={{
              background: 'var(--warning-bg)', borderLeft: '3px solid var(--warning)',
              borderRadius: 'var(--radius-sm)', padding: '9px 12px', marginTop: 12,
              fontSize: 12, color: 'var(--warning)', fontWeight: 600,
            }}>
              Different unit — the recipe's formula counts {original.unit}, this part is
              priced per {picked.unit}. The quantity won't change, so check the line before confirming.
            </div>
          )}

        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} disabled={!changed}
            onClick={() => onSave({
              from_component_id: original.id,
              component_id:      picked.id,
              colour_variant:    colour,
            })}>
            {!picked ? 'Pick a component'
              : !changed ? 'Already in use'
              : `Use ${picked.name}${colour ? ` · ${colour.name}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
