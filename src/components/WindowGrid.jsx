import { resolveAnswers, isOptionVisible, missingAnswers, fmt } from '../lib/bomEngine'
import { allFabrics } from '../lib/fabricEngine'
import DraftInput from './DraftInput'
import InfoTip from './InfoTip'
import { CopyIcon, GripIcon, ChevronRightIcon, PlusIcon } from './Icons'

/**
 * A job's windows as a table, one row per window, edited in place.
 *
 * Every window on a job is the same type (tracks and blinds come on separate
 * POs), so every row shares the same option columns. A new row copies the one
 * above, so a run of similar windows is a change of label and size rather
 * than a fresh set of answers. Anything the table doesn't hold — swaps, the
 * parts asked about per window, extra parts, quantity overrides — is a click
 * through to the window's own page, and shows here as a note so the checker
 * sees it.
 *
 * While the job is To check, a tick column appears. A tick belongs to the
 * window as it was when ticked: change the window and the tick clears.
 */
export default function WindowGrid({
  windows, products, optionDefsFor, allComponents,
  editable, checking, ticked = {}, onTick,
  onUpdate, onAddRow, onDuplicate, onOpen,
  listRef, drag, startDrag, canReorder,
}) {
  const isBlind = products[0]?.product_type === 'blind'
  // Option columns come from the job's type; every product of a type shares them.
  const optionDefs = products[0] ? optionDefsFor(products[0].id) : []
  const fabrics = isBlind ? allFabrics(allComponents) : []

  const setOption = (idx, win, code, value) => onUpdate(idx, {
    config: { ...(win.config || {}), options: { ...(win.config?.options || {}), [code]: value || undefined } },
  })
  const setFabric = (idx, win, fabric) => onUpdate(idx, { config: { ...(win.config || {}), fabric } })

  const cellInput = { padding: '6px 8px', fontSize: 13, minWidth: 0, width: '100%' }
  const bad = { ...cellInput, outline: '1.5px solid #fca5a5', outlineOffset: -1 }

  return (
    <div className="card" style={{ overflowX: 'auto', marginBottom: 12 }}>
      <table className="window-grid">
        <thead>
          <tr>
            {canReorder && <th style={{ width: 22 }} />}
            {checking && <th style={{ width: 34 }}>✓</th>}
            <th style={{ minWidth: 130 }}>Window</th>
            <th style={{ minWidth: 110 }}>Product</th>
            <th style={{ width: 82 }}>Width</th>
            <th style={{ width: 82 }}>Drop</th>
            {isBlind && <th style={{ minWidth: 170 }}>Fabric</th>}
            {optionDefs.map(o => <th key={o.id} style={{ minWidth: 110 }}>{o.name}</th>)}
            <th style={{ minWidth: 110 }}>
              Notes <InfoTip>Swaps, extra parts and quantity changes made on the window's own page. Click the row's arrow to change them.</InfoTip>
            </th>
            <th style={{ width: 80, textAlign: 'right' }}>Cost</th>
            <th style={{ width: 64 }} />
          </tr>
        </thead>
        <tbody ref={listRef}>
          {windows.map((win, idx) => {
            const defs     = optionDefsFor(win.product_id)
            const answers  = resolveAnswers(defs, win.config)
            const missing  = new Set(missingAnswers(defs, win.config))
            const fabric   = win.config?.fabric || {}
            const fabricCmp = fabrics.find(f => f.id === fabric.component_id)
            const cost     = (win.bom || []).reduce((s, l) => s + l.line_cost, 0)
            const notes = [
              Object.keys(win.substitutions || {}).length && `${Object.keys(win.substitutions).length} swap${Object.keys(win.substitutions).length > 1 ? 's' : ''}`,
              (win.extra_lines || []).length && `${win.extra_lines.length} extra`,
              Object.keys(win.bom_overrides || {}).length && `${Object.keys(win.bom_overrides).length} qty changed`,
            ].filter(Boolean)
            const isDragged = drag?.index === idx
            return (
              <tr key={win.id} data-reorder-item style={{
                transform: isDragged ? `translateY(${drag.dy}px)` : undefined,
                background: isDragged ? '#fff' : undefined,
                boxShadow: isDragged ? '0 8px 20px rgba(0,0,0,0.16)' : undefined,
                position: 'relative', zIndex: isDragged ? 2 : 1,
                borderTop: drag && drag.over === idx && drag.over < drag.index ? '2px solid var(--accent)' : undefined,
                borderBottom: drag && drag.over === idx && drag.over > drag.index ? '2px solid var(--accent)' : undefined,
              }}>
                {canReorder && (
                  <td onPointerDown={e => startDrag(idx, e)} title="Drag to reorder"
                    style={{ cursor: 'grab', color: 'var(--warm-200)', touchAction: 'none' }}>
                    <GripIcon size={16} />
                  </td>
                )}
                {checking && (
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={!!ticked[win.id]} onChange={() => onTick(win)}
                      aria-label={`Checked ${win.label || `window ${idx + 1}`}`} style={{ width: 17, height: 17 }} />
                  </td>
                )}
                <td>
                  <DraftInput className="field-input" style={cellInput} disabled={!editable}
                    value={win.label || ''} placeholder={`Window ${idx + 1}`}
                    onCommit={v => onUpdate(idx, { label: v })} />
                </td>
                <td>
                  <select className="field-input" style={cellInput} disabled={!editable}
                    value={win.product_id || ''} onChange={e => onUpdate(idx, { product_id: e.target.value })}>
                    {!products.some(p => p.id === win.product_id) && <option value={win.product_id}>(archived product)</option>}
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <td>
                  <DraftInput className="field-input" type="number" style={{ ...(Number(win.width_mm) > 0 ? cellInput : bad), textAlign: 'right' }}
                    disabled={!editable} value={win.width_mm ?? ''} parse={v => v === '' ? null : Number(v)}
                    onCommit={v => onUpdate(idx, { width_mm: v })} />
                </td>
                <td>
                  <DraftInput className="field-input" type="number" style={{ ...(Number(win.drop_mm) > 0 ? cellInput : bad), textAlign: 'right' }}
                    disabled={!editable} value={win.drop_mm ?? ''} parse={v => v === '' ? null : Number(v)}
                    onCommit={v => onUpdate(idx, { drop_mm: v })} />
                </td>
                {isBlind && (
                  <td>
                    <select className="field-input" style={fabric.component_id ? cellInput : bad} disabled={!editable}
                      value={fabric.component_id || ''}
                      onChange={e => setFabric(idx, win, { component_id: e.target.value, colour_variant: null })}>
                      <option value="">Pick a fabric</option>
                      {fabrics.map(f => (
                        <option key={f.id} value={f.id}>{f.fabric_code ? `${f.fabric_code} · ` : ''}{f.name}</option>
                      ))}
                    </select>
                    {(fabricCmp?.colour_variants || []).length > 0 && (
                      <select className="field-input" style={{ ...cellInput, marginTop: 4 }} disabled={!editable}
                        value={fabric.colour_variant?.suffix || ''}
                        onChange={e => setFabric(idx, win, {
                          ...fabric,
                          colour_variant: fabricCmp.colour_variants.find(v => v.suffix === e.target.value) || null,
                        })}>
                        <option value="">Colour</option>
                        {fabricCmp.colour_variants.map(v => <option key={v.suffix} value={v.suffix}>{v.name}</option>)}
                      </select>
                    )}
                  </td>
                )}
                {optionDefs.map(o => {
                  const def = defs.find(d => d.code === o.code) || o
                  if (!isOptionVisible(def, answers)) {
                    const forced = (def.choices || []).find(c => String(c.value) === String(answers[def.code]))
                    return <td key={o.id} style={{ fontSize: 12.5, color: 'var(--warm-300)', paddingLeft: 10 }}>{forced?.label || '—'}</td>
                  }
                  return (
                    <td key={o.id}>
                      <select className="field-input" style={missing.has(def.name) ? bad : cellInput} disabled={!editable}
                        value={win.config?.options?.[def.code] ?? ''}
                        onChange={e => setOption(idx, win, def.code, e.target.value)}>
                        <option value="">—</option>
                        {(def.choices || []).filter(c => c.selectable !== false).map(c => (
                          <option key={c.id} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </td>
                  )
                })}
                <td>
                  {notes.length > 0
                    ? notes.map(n => <span key={n} className="grid-note">{n}</span>)
                    : <span style={{ color: 'var(--warm-200)', fontSize: 12 }}>—</span>}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>${fmt(cost)}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {editable && (
                    <button className="grid-icon-btn" title="Duplicate this window" onClick={() => onDuplicate(idx)}>
                      <CopyIcon />
                    </button>
                  )}
                  <button className="grid-icon-btn" title="Open this window: swaps, parts, extras"
                    onClick={() => onOpen(win, idx)}>
                    <ChevronRightIcon size={15} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {editable && (
        <button className="grid-add" onClick={onAddRow}>
          <PlusIcon size={15} /> {windows.length ? 'Add a window (copies the last row)' : 'Add the first window'}
        </button>
      )}
    </div>
  )
}
