import { useState, useEffect, useMemo } from 'react'
import { XIcon } from './Icons'
import { resolveAnswers, isOptionVisible, missingAnswers, resolveRecipe, applySubstitutions, calcWindowBOM, fabricLineFor, buildFabricSelection, jobRoleSlots, fmt } from '../lib/bomEngine'
import { fabricsInCategory } from '../lib/fabricEngine'
import { getStock } from '../lib/stockEngine'

/**
 * Step 2 of adding a window — the answers that decide what actually gets built.
 *
 * A question gated by another is hidden when it doesn't apply. If the gating
 * answer decides it anyway (centre open takes both return brackets), that is
 * shown as settled rather than asked, and never blocks.
 *
 * A blind also picks its fabric here — the one thing every blind window needs
 * that no track window does — from whatever's currently classified into the
 * product's pricing category (see supabase_fabric_pricing.sql).
 *
 * Last come the parts the recipe is willing to be argued with about: any line
 * tagged with a job_role (see supabase_job_role_slots.sql) is put as its own
 * question — base rail, winder, bracket — offering the recipe's own part plus
 * whatever alternatives were curated for it. They sit BELOW the fabric on
 * purpose: which base rail colours exist at all depends on who makes the
 * fabric, so the fabric has to be settled before the question means anything.
 *
 * Nothing here blocks. A part with nothing on the shelf is flagged and still
 * allowed — a PO covers it — and a supplier that doesn't match the fabric's is
 * pointed out rather than forbidden, because plenty of jobs mix suppliers on
 * purpose.
 */
export default function CustomiseWindowModal({
  open, product, productComponents = [], optionDefs = [],
  allComponents = [], categories = [], subMap = null,
  substitutions = null, stockMap = {}, suppliers = [],
  widthMm, dropMm, config, onClose, onSave, saveLabel = 'Add window',
}) {
  const [answers, setAnswers]           = useState({})
  const [fabricAnswer, setFabricAnswer] = useState({ component_id: '', colour_variant: null })
  // This window's OWN swaps, edited here and saved beside the answers. Job-wide
  // swaps arrive through subMap and are not touched — a window overrides one by
  // answering its question, exactly as a hand-made swap would.
  const [winSubs, setWinSubs]           = useState({})

  useEffect(() => {
    if (open) {
      setAnswers((config && config.options) || {})
      setFabricAnswer((config && config.fabric) || { component_id: '', colour_variant: null })
      setWinSubs(substitutions || {})
    }
  }, [open, config, substitutions])

  const isBlind  = product?.product_type === 'blind'
  const category = categories.find(c => c.code === product?.fabric_category)
  const fabricChoices = useMemo(() => (isBlind && category)
    ? fabricsInCategory(allComponents, categories, category.code)
    : [], [isBlind, category, allComponents, categories])
  const selectedFabric = allComponents.find(c => c.id === fabricAnswer.component_id)
  const fabricColours  = selectedFabric?.colour_variants || []

  const fabricSelection = isBlind
    ? buildFabricSelection(selectedFabric, fabricAnswer.colour_variant, product, category)
    : null

  const draft = useMemo(() => ({ options: answers, fabric: fabricAnswer }), [answers, fabricAnswer])

  const effective = useMemo(() => resolveAnswers(optionDefs, draft), [optionDefs, draft])
  const missing   = useMemo(() => missingAnswers(optionDefs, draft), [optionDefs, draft])

  // A category assigned but nothing picked yet blocks save, same as any
  // other required answer. No category assigned is a product-setup gap this
  // modal can't fix, so it's shown but doesn't block.
  const fabricUnanswered = isBlind && !!category && !fabricAnswer.component_id
  const allMissing = fabricUnanswered ? [...missing, 'Fabric'] : missing

  // The lines this window actually gets, before anything is swapped into them.
  // Both the role questions and the costed BOM are built from this one list, so
  // a question can never be asked about a part the window doesn't take.
  const resolved = useMemo(
    () => resolveRecipe(productComponents, draft, optionDefs, Number(widthMm), Number(dropMm)),
    [productComponents, draft, optionDefs, widthMm, dropMm])

  /* ---- Swaps in force, the questions they answer, and what it all costs ---
   * The job's swaps underneath, this window's own — including the answers
   * being given right now — on top. Same precedence the saved window uses, so
   * the cost quoted here is the cost the window page shows once it's saved.
   *
   * Questions and costing come out of the same pass because they are the same
   * pass: a swap decides both what a slot currently reads and what the line is
   * costed at, and computing them apart is how the two drift.
   * --------------------------------------------------------------------- */
  const { slots, bom } = useMemo(() => {
    const merged = Object.fromEntries([
      ...Object.entries(subMap || {}),
      ...Object.entries(winSubs)
        .map(([fromId, sub]) => {
          if (!sub || !sub.component_id) return null
          const component = allComponents.find(c => c.id === sub.component_id)
          return component ? [fromId, { component, colour_variant: sub.colour_variant || null }] : null
        })
        .filter(Boolean),
    ])
    const lines      = applySubstitutions(resolved, merged)
    const fabricLine = fabricLineFor(fabricSelection)
    return {
      slots: jobRoleSlots(resolved, merged, allComponents),
      bom:   calcWindowBOM(fabricLine ? [fabricLine, ...lines] : lines, Number(widthMm), Number(dropMm)),
    }
  }, [resolved, subMap, winSubs, allComponents, widthMm, dropMm, fabricSelection])

  const cost = bom.reduce((s, l) => s + l.line_cost, 0)

  /* ---- Answering a role question -----------------------------------------
   * Filed under the component the RECIPE asks for, which is what makes going
   * back to stock a delete rather than another swap — and what makes this and
   * a hand-made swap of the same line one record instead of two.
   * --------------------------------------------------------------------- */
  const answerSlot = (slot, componentId, colourVariant) => {
    const backToRecipe = componentId === slot.recipe.component.id
      && (colourVariant?.suffix || '') === (slot.recipe.colour_variant?.suffix || '')
    setWinSubs(prev => {
      const next = { ...prev }
      // A job-wide swap of the same part still has to be overridden, so
      // "back to the recipe" is recorded rather than just forgotten.
      if (backToRecipe && !(subMap || {})[slot.key]) delete next[slot.key]
      else next[slot.key] = { component_id: componentId, colour_variant: colourVariant || null }
      return next
    })
  }

  const supplierName = (id) => suppliers.find(x => x.id === id)?.name || null

  // "12 on hand", for the colour actually in play. Null when nothing is
  // tracked for it — an untracked part is not the same as an empty shelf.
  const stockOf = (component, variant) => {
    const n = Number(getStock(stockMap, component, variant)?.qty_on_hand)
    return isNaN(n) ? null : n
  }

  if (!open) return null

  const set = (code, value) => setAnswers(a => ({ ...a, [code]: value }))

  const labelFor = (option, value) =>
    (option.choices || []).find(c => String(c.value) === String(value))?.label || value

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">{product?.name || 'Customise'}</div>
            <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>
              {widthMm} × {dropMm} mm
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body">
          {isBlind && (
            <div className="field">
              <label className="field-label">
                Fabric
                {category && <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '1px 5px', borderRadius: 4, background: 'var(--danger-bg)', color: 'var(--danger)' }}>required</span>}
              </label>

              {!category ? (
                <div style={{
                  background: 'var(--warning-bg)', borderRadius: 'var(--radius-sm)',
                  padding: '9px 12px', fontSize: 12.5, color: 'var(--warning)',
                }}>
                  This product has no pricing category assigned — set one in Products before a
                  fabric can be picked.
                </div>
              ) : (
                <>
                  <select className="field-input" value={fabricAnswer.component_id}
                    onChange={e => setFabricAnswer({ component_id: e.target.value, colour_variant: null })}
                    style={{
                      outline: fabricUnanswered ? '1.5px solid #fca5a5' : 'none', outlineOffset: 3,
                    }}>
                    <option value="">— Select a fabric —</option>
                    {fabricChoices.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.fabric_code ? `${c.fabric_code} — ` : ''}{c.name}
                        {(c.colour_variants || []).length > 0 ? ` · ${c.colour_variants.length} colours` : ''}
                      </option>
                    ))}
                  </select>
                  {fabricChoices.length === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 5 }}>
                      No fabrics are currently classified into Category {category.code}.
                    </div>
                  )}

                  {fabricColours.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {fabricColours.map((v, i) => {
                        const on = fabricAnswer.colour_variant?.suffix === v.suffix
                        return (
                          <button key={i} type="button"
                            onClick={() => setFabricAnswer(a => ({ ...a, colour_variant: on ? null : v }))}
                            style={{
                              flex: '1 1 30%', minWidth: 90, padding: '9px 8px',
                              borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                              border: `1.5px solid ${on ? 'var(--accent)' : 'var(--warm-200)'}`,
                              background: on ? 'var(--accent-bg)' : '#fff',
                              color: on ? 'var(--accent-dark)' : 'var(--ink)',
                            }}>
                            {v.name}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {selectedFabric && (
                    <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 6 }}>
                      Priced at Category {category.code}'s rate — ${Number(category.max_price).toFixed(2)}/m
                      — not {selectedFabric.name}'s own ${Number(selectedFabric.unit_cost).toFixed(2)}/m.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* The parts the job gets a say in. Below the fabric because the
              fabric's maker is what narrows the base rail colours worth
              choosing, so it has to be settled first. */}
          {slots.map(slot => {
            const chosenComponent = slot.chosen.component
            const colours   = chosenComponent.colour_variants || []
            const onHand    = stockOf(chosenComponent, slot.chosen.colour_variant)
            const short     = onHand !== null && onHand <= 0
            const partMaker = supplierName(chosenComponent.supplier_id)
            // Only worth mentioning once a fabric is actually picked, and only
            // when they differ — a match is the normal case and needs no words.
            const fabricMaker = selectedFabric ? supplierName(selectedFabric.supplier_id) : null
            const mismatch = fabricMaker && partMaker && fabricMaker !== partMaker

            return (
              <div className="field" key={slot.key}>
                <label className="field-label">
                  {slot.role}
                  {slot.changed && (
                    <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '1px 5px', borderRadius: 4, background: 'var(--blue-bg)', color: 'var(--blue)' }}>
                      changed
                    </span>
                  )}
                </label>

                {slot.choices.length > 1 ? (
                  <select className="field-input" value={chosenComponent.id}
                    onChange={e => answerSlot(slot, e.target.value, null)}>
                    {slot.choices.map((c, i) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{i === 0 ? ' — as specified' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{
                    background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
                    padding: '9px 12px', fontSize: 13, fontWeight: 600,
                  }}>
                    {chosenComponent.name}
                  </div>
                )}

                {colours.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {colours.map((v, i) => {
                      const on  = slot.chosen.colour_variant?.suffix === v.suffix
                      const qty = stockOf(chosenComponent, v)
                      return (
                        <button key={i} type="button"
                          onClick={() => answerSlot(slot, chosenComponent.id, on ? null : v)}
                          style={{
                            flex: '1 1 30%', minWidth: 90, padding: '8px',
                            borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                            border: `1.5px solid ${on ? 'var(--accent)' : 'var(--warm-200)'}`,
                            background: on ? 'var(--accent-bg)' : '#fff',
                            color: on ? 'var(--accent-dark)' : 'var(--ink)',
                          }}>
                          {v.name}
                          {qty !== null && (
                            <div style={{ fontSize: 10, fontWeight: 500, color: qty <= 0 ? 'var(--danger)' : 'var(--warm-300)', marginTop: 2 }}>
                              {qty % 1 === 0 ? qty : qty.toFixed(2)} on hand
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}

                <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '2px 8px' }}>
                  {partMaker && <span>{partMaker}</span>}
                  {colours.length === 0 && onHand !== null && (
                    <span style={{ color: short ? 'var(--danger)' : undefined }}>
                      {onHand % 1 === 0 ? onHand : onHand.toFixed(2)} on hand
                    </span>
                  )}
                  {slot.changed && (
                    <button type="button"
                      onClick={() => answerSlot(slot, slot.recipe.component.id, slot.recipe.colour_variant)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--accent-dark)', fontWeight: 600 }}>
                      back to {slot.recipe.component.name}
                    </button>
                  )}
                </div>

                {/* Neither of these blocks the save — they are things to know,
                    not reasons to stop. Stock gets ordered; suppliers get
                    mixed on purpose more often than not. */}
                {short && (
                  <div style={{
                    background: 'var(--warning-bg)', borderLeft: '3px solid var(--warning)',
                    borderRadius: 'var(--radius-sm)', padding: '8px 11px', marginTop: 7,
                    fontSize: 11.5, color: 'var(--warning)', fontWeight: 600,
                  }}>
                    None on hand — this will need ordering.
                  </div>
                )}
                {mismatch && (
                  <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 6 }}>
                    Fabric is {fabricMaker}, this is {partMaker} — check the colour is one
                    they actually make.
                  </div>
                )}
              </div>
            )
          })}

          {optionDefs.length === 0 && !isBlind && (
            <div style={{ fontSize: 13, color: 'var(--warm-300)', padding: '8px 0 16px' }}>
              No options are defined for this product type, so there is nothing to answer.
              The full recipe applies as-is.
            </div>
          )}

          {optionDefs.map(o => {
            const visible = isOptionVisible(o, effective)
            const value   = effective[o.code]

            // Hidden but decided — show what it settled on so nobody wonders.
            if (!visible) {
              if (value === undefined || value === null || value === '') return null
              const parent = optionDefs.find(x => x.code === o.depends_on_code)
              return (
                <div key={o.id} style={{
                  background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
                  padding: '9px 12px', marginBottom: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {o.name}: {labelFor(o, value)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--warm-300)' }}>
                      Decided by {parent?.name || 'another answer'}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                    background: '#fff', color: 'var(--warm-300)',
                  }}>automatic</span>
                </div>
              )
            }

            const unanswered = o.required && !value

            if (o.selection === 'qty') {
              return (
                <div className="field" key={o.id}>
                  <label className="field-label">
                    {o.name}
                    {o.spec_only && <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '1px 5px', borderRadius: 4, background: 'var(--blue-bg)', color: 'var(--blue)' }}>spec</span>}
                  </label>
                  <input className="field-input" type="number" min="0" step="0.5"
                    value={value ?? ''} placeholder="0"
                    onChange={e => set(o.code, e.target.value === '' ? undefined : Number(e.target.value))}
                    style={{ textAlign: 'right' }} />
                </div>
              )
            }

            const selectable = (o.choices || []).filter(c => c.selectable !== false)
            return (
              <div className="field" key={o.id}>
                <label className="field-label">
                  {o.name}
                  {unanswered && <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '1px 5px', borderRadius: 4, background: 'var(--danger-bg)', color: 'var(--danger)' }}>required</span>}
                  {o.spec_only && <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '1px 5px', borderRadius: 4, background: 'var(--blue-bg)', color: 'var(--blue)' }}>spec</span>}
                </label>
                <div style={{
                  display: 'flex', gap: 6, flexWrap: 'wrap',
                  outline: unanswered ? '1.5px solid #fca5a5' : 'none',
                  outlineOffset: 3, borderRadius: 8,
                }}>
                  {selectable.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--warm-300)' }}>No answers defined yet.</div>
                  )}
                  {selectable.map(c => {
                    const on = String(value) === String(c.value)
                    return (
                      <button key={c.id} type="button"
                        onClick={() => set(o.code, on && !o.required ? undefined : c.value)}
                        style={{
                          flex: '1 1 30%', minWidth: 90, padding: '9px 8px',
                          borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                          border: `1.5px solid ${on ? 'var(--accent)' : 'var(--warm-200)'}`,
                          background: on ? 'var(--accent-bg)' : '#fff',
                          color: on ? 'var(--accent-dark)' : 'var(--ink)',
                        }}>
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {allMissing.length > 0 && (
            <div style={{
              background: 'var(--danger-bg)', borderLeft: '3px solid var(--danger)',
              borderRadius: 'var(--radius-sm)', padding: '9px 12px',
              fontSize: 12.5, fontWeight: 600, color: 'var(--danger)', marginBottom: 12,
            }}>
              {allMissing.join(', ')} still needed.
            </div>
          )}

          <div style={{
            background: 'var(--accent-dark)', color: '#fff', borderRadius: 'var(--radius)',
            padding: '11px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', opacity: 0.7 }}>
                Cost
              </div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 1 }}>
                {bom.length} component{bom.length === 1 ? '' : 's'}
              </div>
            </div>
            <div style={{ fontSize: 21, fontWeight: 700 }}>${fmt(cost)}</div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Back</button>
          <button className="btn btn-primary" style={{ flex: 2 }}
            disabled={allMissing.length > 0}
            onClick={() => onSave(
              { ...(config || {}), options: answers, fabric: fabricAnswer },
              winSubs,
            )}>
            {allMissing.length > 0 ? `${allMissing.length} answer${allMissing.length === 1 ? '' : 's'} needed` : saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
