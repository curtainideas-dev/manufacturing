import { useState, useEffect, useMemo } from 'react'
import { ChevronLeftIcon, PlusIcon, TrashIcon, XIcon } from '../components/Icons'
import ProductComponentModal from '../components/ProductComponentModal'
import { calcCostAtWidth, calcCostAt, calcQty, previewConfig, fabricLineFor, DEFAULT_ROLL_WIDTH_MM, GRID_WIDTHS, GRID_BLIND_WIDTHS, GRID_BLIND_DROPS, fmt, fmtQty, formulaDescription, fixedPerWidthLabel, groupRecipeLines, overlappingLines } from '../lib/bomEngine'

const COST_TYPE_LABELS = {
  fixed: 'Fixed qty', width_based: 'Width-based',
  drop_based: 'Drop-based', width_drop_based: 'W × D', labour: 'Labour',
}

/**
 * What decides whether a recipe line applies — the option answer that supplies
 * it, the sizes it is limited to, the drop it trips at. Everything a reader
 * needs to tell one line of a group from its siblings.
 *
 * `withGroup` is off inside a collapsed group, where the header already names
 * the group and repeating it on every line is noise.
 */
function conditionBadges(pc, optionDefs = [], withGroup = true) {
  const badges = []
  const choice = pc.option_choice_id && optionDefs
    .flatMap(o => (o.choices || []).map(c => ({ o, c })))
    .find(x => x.c.id === pc.option_choice_id)
  if (choice) badges.push({ t: `${choice.o.name}: ${choice.c.label}`, bg: 'var(--accent-bg)', fg: 'var(--accent-dark)' })
  if (withGroup && pc.component?.kind) badges.push({ t: pc.component.kind, bg: 'var(--blue-bg)', fg: 'var(--blue)' })
  if (pc.job_role) badges.push({ t: `asks: ${pc.job_role}`, bg: 'var(--success-bg)', fg: 'var(--success)' })
  const w = [pc.active_min_width, pc.active_max_width]
  const d = [pc.active_min_drop, pc.active_max_drop]
  if (w[0] != null || w[1] != null) badges.push({ t: `W ${w[0] ?? '0'}–${w[1] ?? '∞'}`, bg: 'var(--warning-bg)', fg: 'var(--warning)' })
  if (d[0] != null || d[1] != null) badges.push({ t: `D ${d[0] ?? '0'}–${d[1] ?? '∞'}`, bg: 'var(--warning-bg)', fg: 'var(--warning)' })
  if (pc.drop_limit && Object.keys(pc.drop_limit).length) {
    const n = Object.keys(pc.drop_limit).length
    badges.push({ t: `drop limit · ${n} band${n === 1 ? '' : 's'}`, bg: 'var(--warning-bg)', fg: 'var(--warning)' })
  }
  return badges
}

// A line with nothing gating it applies to every window, and saying so beats
// leaving the row silent next to siblings that all carry a condition.
const ALWAYS = { t: 'always', bg: 'var(--warm-100)', fg: 'var(--warm-300)' }

function BadgeRow({ items, style }) {
  if (!items.length) return null
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4, ...style }}>
      {items.map((b, i) => (
        <span key={i} style={{
          fontSize: 10, fontWeight: 700, padding: '1px 6px',
          borderRadius: 4, background: b.bg, color: b.fg,
        }}>{b.t}</span>
      ))}
    </div>
  )
}

const priceOf = pc => Number(pc.component?.unit_cost || 0)

function PriceCell({ pc }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
      ${priceOf(pc).toFixed(2)}
      {Number(pc.component?.discount) > 0 && (
        <span style={{ fontSize: 11, color: 'var(--success)', marginLeft: 4 }}>
          −{pc.component?.discount}%
        </span>
      )}
    </div>
  )
}



export default function ProductDetail({
  product, productComponents, allComponents, suppliers = [], optionDefs = [],
  widthSchedules = [], onSaveSchedule, onDeleteSchedule, fabricCategories = [],
  onBack, onUpdateProduct, onAddComponent, onUpdateComponent,
  onRemoveComponent, onDuplicate, onDeleteProduct, saving,
  onExportPricing, pricingExporting,
}) {
  // Which collapsed recipe entries are open, keyed by group. Deliberately
  // per-visit rather than remembered: the list is short once collapsed, and a
  // half-open list restored from a previous visit reads as noise.
  const [openGroups, setOpenGroups]   = useState({})
  const [nameDraft, setNameDraft]     = useState(product.name || '')
  const [notesDraft, setNotesDraft]   = useState(product.notes || '')
  useEffect(() => {
    setNameDraft(product.name || '')
    setNotesDraft(product.notes || '')
  }, [product.id, product.name, product.notes])

  const commitName = () => {
    const next = nameDraft.trim()
    if (!next || next === product.name) { setNameDraft(product.name || ''); return }
    onUpdateProduct({ name: next })
  }
  const commitNotes = () => {
    if (notesDraft === (product.notes || '')) return
    onUpdateProduct({ notes: notesDraft })
  }

  const [addOpen, setAddOpen]         = useState(false)
  const [editingPc, setEditingPc]     = useState(null)
  const [showDupMenu, setShowDupMenu] = useState(false)
  const [newName, setNewName]         = useState('')
  const [showBreakdown, setShowBreakdown] = useState(false)

  const handleDuplicate = async () => {
    const name = newName.trim() || `${product.name} (copy)`
    await onDuplicate(name)
    setShowDupMenu(false)
    setNewName('')
  }

  // Grids assume each option's default answer, since a price grid has to pick
  // one build to price. What it assumed is shown above the table.
  // The recipe as entries rather than raw lines — see groupRecipeLines.
  const recipeGroups = useMemo(() => groupRecipeLines(productComponents), [productComponents])

  /* Two lines of one kind that can both apply to the same window — a window
   * that would get two base rails. Nothing collapses these any more, so the
   * recipe has to say so where it happens; a silent fix would leave the recipe
   * wrong forever. Keyed by kind, which is how the list is grouped. */
  const overlapsByKind = useMemo(() => {
    const out = {}
    overlappingLines(productComponents, optionDefs).forEach(o => {
      (out[o.kind] ||= []).push(o)
    })
    return out
  }, [productComponents, optionDefs])

  const { config: previewCfg, assumed } = useMemo(() => previewConfig(optionDefs), [optionDefs])

  const isTrack = (product.product_type || product.category) === 'track'
  const isBlind = (product.product_type || product.category) === 'blind'

  // The fabric is never a stored recipe line — it's picked per window — but a
  // blind's price always assumes one at its category's flat rate, so the grid
  // (and this page's own recipe list) has to fold that in rather than showing
  // hardware-only numbers that understate every real quote.
  const fabricCategory = fabricCategories.find(c => c.code === product.fabric_category)
  const categoryFabricLine = useMemo(() => (isBlind && fabricCategory)
    ? fabricLineFor({
        component: { id: 'category-fabric', name: `Category ${fabricCategory.code} Fabric`, unit: 'metres', unit_cost: fabricCategory.max_price, discount: 0 },
        colour_variant: null,
        categoryPrice: Number(fabricCategory.max_price) || 0,
        dropAllowanceMm: Number(product.fabric_drop_allowance_mm) || 0,
        dropWastageMm: Number(product.fabric_drop_wastage_mm) || 0,
        widthDeductionMm: Number(product.fabric_width_deduction_mm) || 0,
        widthAllowanceMm: Number(product.fabric_width_cut_allowance_mm) || 0,
        rollWidthMm: Number(product.fabric_roll_width_mm) || DEFAULT_ROLL_WIDTH_MM,
      })
    : null, [
      isBlind, fabricCategory,
      // Every figure below is a cost driver now that fabric is costed as a
      // strip of the roll, so the grid has to rebuild when any of them moves.
      product.fabric_drop_allowance_mm, product.fabric_drop_wastage_mm,
      product.fabric_width_deduction_mm, product.fabric_width_cut_allowance_mm,
      product.fabric_roll_width_mm,
    ])

  const pricedComponents = categoryFabricLine ? [categoryFabricLine, ...productComponents] : productComponents

  const gridCosts = useMemo(() => isTrack
    ? GRID_WIDTHS.map(w => ({ width: w, cost: calcCostAtWidth(productComponents, w, optionDefs, previewCfg) }))
    : [], [isTrack, productComponents, optionDefs, previewCfg])

  // Blinds price on both axes, so the grid is a matrix rather than a row.
  const blindGrid = useMemo(() => !isBlind ? [] :
    GRID_BLIND_DROPS.map(drop => ({
      drop,
      cells: GRID_BLIND_WIDTHS.map(width => ({
        width,
        cost: calcCostAt(pricedComponents, width, drop, optionDefs, previewCfg),
      })),
    })), [isBlind, pricedComponents, optionDefs, previewCfg])

  const markup = Number(product.markup) || 1.6


  return (
    <>
      <div className="header">
        <button className="header-back" onClick={onBack}>
          <ChevronLeftIcon size={18} /> Products
        </button>
        <div className="header-title" style={{ fontSize: 15 }} />
        <div className="header-actions" style={{ display: 'flex', alignItems: 'center' }}>
          {(isTrack || isBlind) && (
            <button
              style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px' }}
              onClick={onExportPricing}
              disabled={pricingExporting || productComponents.length === 0}
            >
              {pricingExporting ? 'Exporting…' : '⬇ Pricing'}
            </button>
          )}
          <button
            style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px' }}
            onClick={() => setShowDupMenu(v => !v)}
          >
            ⧉ Duplicate
          </button>
        </div>
      </div>

      {/* Duplicate panel */}
      {showDupMenu && (
        <div style={{ background: 'var(--accent-bg)', borderBottom: '1px solid #c8e89a', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-dark)' }}>Duplicate "{product.name}"</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="field-input" style={{ fontSize: 14, flex: 1 }}
              placeholder={`${product.name} (copy)`} value={newName}
              onChange={e => setNewName(e.target.value)} />
            <button className="btn btn-primary" onClick={handleDuplicate} disabled={saving}>
              {saving ? 'Copying...' : 'Duplicate'}
            </button>
            <button className="btn btn-secondary" onClick={() => { setShowDupMenu(false); setNewName('') }}>Cancel</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--warm-300)' }}>Creates a new product with the same recipe — edit independently after.</div>
        </div>
      )}

      <div className="scroll-area">
        <div style={{ padding: 16 }}>

          {/* Product details */}
          <div className="card card-body" style={{ marginBottom: 16 }}>
            {isBlind ? (
              // A blind product's identity IS its pricing category — one
              // selector sets both the name and the fabric_category, rather
              // than a free-text name that could drift from the category
              // that actually prices it.
              <div className="field" style={{ marginBottom: 12 }}>
                <label className="field-label">Category</label>
                <select className="field-input" value={product.fabric_category || ''}
                  onChange={e => {
                    const code = e.target.value
                    onUpdateProduct(code
                      ? { fabric_category: code, name: `Category ${code}` }
                      : { fabric_category: null })
                  }}>
                  <option value="">— Not set —</option>
                  {fabricCategories.map(c => (
                    <option key={c.code} value={c.code}>
                      Category {c.code} (${Number(c.max_price).toFixed(2)}/m)
                    </option>
                  ))}
                </select>
                {!product.fabric_category && (
                  <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 8 }}>
                    No category set — windows on this product won't be able to pick a fabric until one is.
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label className="field-label">Profile code</label>
                  {/* Held locally and committed on blur. Writing on every keystroke
                      fired one UPDATE per character, and out-of-order responses
                      could land a half-typed name back in the database. */}
                  <input className="field-input" value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    placeholder="e.g. TCO51" />
                </div>
                <div className="grid-2">
                  <div>
                    <label className="field-label">Category</label>
                    <select className="field-input" value={product.category}
                      onChange={e => onUpdateProduct({ category: e.target.value })}>
                      <option value="track">Track</option>
                      <option value="blind">Blind</option>
                      <option value="sheer">Sheer</option>
                    </select>
                  </div>
                </div>
              </>
            )}
            {product.notes !== undefined && (
              <div style={{ marginTop: 12 }}>
                <label className="field-label">Notes</label>
                <textarea className="field-input" rows={2} value={notesDraft}
                  onChange={e => setNotesDraft(e.target.value)}
                  onBlur={commitNotes}
                  placeholder="Optional notes..." />
              </div>
            )}
          </div>

          {/* Fabric — always priced at the category's flat rate, whichever
              real fabric ends up picked per window. Not part of the editable
              recipe below since it isn't a stored component line, but its
              rate feeds the price grid at the bottom the same as if it were. */}
          {isBlind && (
            <div className="card card-body" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--warm-300)', marginBottom: 8 }}>
                Fabric
              </div>
              {fabricCategory ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>Category {fabricCategory.code} fabric</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent-dark)' }}>
                    ${Number(fabricCategory.max_price).toFixed(2)}/m
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--warm-300)' }}>
                  Set a category above to include fabric in this product's price.
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 6 }}>
                Priced per metre off the roll, charged on the share of the roll's <em>width</em>
                {' '}the cut occupies. A blind can't be railroaded, but the width beside it isn't
                wasted — the next blind is cut alongside it, so a 750mm blind costs a quarter of
                what a 3000mm one does. Folded into the grid below on top of the hardware recipe;
                the actual fabric is picked per window.
              </div>
              <div className="divider" style={{ margin: '12px 0' }} />
              <div className="field">
                <label className="field-label">Roll width (mm)</label>
                <input className="field-input" type="number" step="1" min="1"
                  value={product.fabric_roll_width_mm ?? DEFAULT_ROLL_WIDTH_MM}
                  onChange={e => onUpdateProduct({ fabric_roll_width_mm: Number(e.target.value) || DEFAULT_ROLL_WIDTH_MM })}
                  style={{ maxWidth: 140 }} />
                <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 5 }}>
                  The roll width the category rate above is quoted against — the denominator of
                  the share, and the width the cut chart nests into. Category rates on file were
                  set against {DEFAULT_ROLL_WIDTH_MM.toLocaleString()}mm.
                </div>
              </div>
              <div className="field">
                <label className="field-label">Width deduction (mm)</label>
                <input className="field-input" type="number" step="1" min="0"
                  value={product.fabric_width_deduction_mm ?? 0}
                  onChange={e => onUpdateProduct({ fabric_width_deduction_mm: Number(e.target.value) || 0 })}
                  style={{ maxWidth: 140 }} />
                <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 5 }}>
                  Cut-width spec — the fabric is cut this much narrower than the window's width.
                  Now a cost driver as well as a factory instruction, since the cut width decides
                  how much of the roll this blind is charged for.
                </div>
              </div>
              <div className="field">
                <label className="field-label">Width cut allowance (mm)</label>
                <input className="field-input" type="number" step="1" min="0"
                  value={product.fabric_width_cut_allowance_mm ?? 0}
                  onChange={e => onUpdateProduct({ fabric_width_cut_allowance_mm: Number(e.target.value) || 0 })}
                  style={{ maxWidth: 140 }} />
                <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 5 }}>
                  The margin that makes side-by-side cutting possible — the blade needs somewhere
                  to go and both edges need squaring. Counted once per blind, including the one
                  at the roll's edge. Leave it at 0 only if blinds really are cut edge to edge.
                </div>
              </div>
              <div className="field">
                <label className="field-label">Drop allowance (mm)</label>
                <input className="field-input" type="number" step="1" min="0"
                  value={product.fabric_drop_allowance_mm ?? 0}
                  onChange={e => onUpdateProduct({ fabric_drop_allowance_mm: Number(e.target.value) || 0 })}
                  style={{ maxWidth: 140 }} />
                <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 5 }}>
                  Fabric the finished blind actually needs beyond its drop — hem, pattern
                  repeat, wrap onto the tube.
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-label">Drop wastage allowance (mm)</label>
                <input className="field-input" type="number" step="1" min="0"
                  value={product.fabric_drop_wastage_mm ?? 0}
                  onChange={e => onUpdateProduct({ fabric_drop_wastage_mm: Number(e.target.value) || 0 })}
                  style={{ maxWidth: 140 }} />
                <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 5 }}>
                  Fabric lost making the cut at all — trim, squaring up, the bit that never
                  reaches the blind. Kept separate from the allowance above so each can be
                  tuned on its own.
                </div>
              </div>
              {/* A worked example beats four abstract figures — this is the
                  arithmetic every window on this product goes through, on a
                  size someone can picture. */}
              {(() => {
                const roll    = Number(product.fabric_roll_width_mm) || DEFAULT_ROLL_WIDTH_MM
                const wDed    = Number(product.fabric_width_deduction_mm) || 0
                const wAllow  = Number(product.fabric_width_cut_allowance_mm) || 0
                const dAdd    = (Number(product.fabric_drop_allowance_mm) || 0) + (Number(product.fabric_drop_wastage_mm) || 0)
                const exW = 1500, exD = 2000
                const cutW = exW - wDed, cutD = exD + dAdd
                const share = roll > 0 ? Math.min(1, (cutW + wAllow) / roll) : 0
                const metres = (cutD / 1000) * share
                const perBand = roll > 0 && (cutW + wAllow) > 0 ? Math.floor(roll / (cutW + wAllow)) : 0
                return (
                  <div style={{
                    marginTop: 10, padding: '10px 12px', background: 'var(--warm-100)',
                    borderRadius: 'var(--radius-sm)', fontSize: 11.5, color: 'var(--warm-300)', lineHeight: 1.6,
                  }}>
                    <div style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
                      A {exW.toLocaleString()} × {exD.toLocaleString()} window on this product
                    </div>
                    cuts at <strong style={{ color: 'var(--ink)' }}>{cutW.toLocaleString()} × {cutD.toLocaleString()}mm</strong>,
                    occupies <strong style={{ color: 'var(--ink)' }}>{(cutW + wAllow).toLocaleString()}mm</strong> of
                    the {roll.toLocaleString()}mm roll ({(share * 100).toFixed(0)}%), and is costed at{' '}
                    <strong style={{ color: 'var(--ink)' }}>{metres.toFixed(3)}m</strong>
                    {fabricCategory && ` = $${(metres * (Number(fabricCategory.max_price) || 0)).toFixed(2)}`}.
                    {perBand > 1 && <> {perBand} of them fit side by side on one length off the roll.</>}
                    {perBand === 0 && <> <span style={{ color: 'var(--danger)' }}>It won't fit this roll width.</span></>}
                    <div style={{ marginTop: 6 }}>
                      That's the price grid's figure — one blind's own strip, nothing nested
                      beside it. A real job's BOM is costed on what actually comes off the roll
                      once its blinds are nested together, which is more: the strip past the last
                      blind in a band, and the run under any blind shorter than the band, get
                      pulled off either way. The BOM matches the cut sheet; this doesn't.
                    </div>
                    <div style={{ marginTop: 4 }}>
                      None of these figures change the window's recorded width or drop.
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Recipe — collapsed into entries rather than raw lines. See
              groupRecipeLines: an alternatives group is one entry whatever
              parts it names, and otherwise one part is one entry however many
              answers reach it. A single-line entry looks exactly as it always
              did, so nothing moves for a recipe with no repetition. */}
          <div className="section-title" style={{ padding: '0 0 8px' }}>
            Component Recipe ({productComponents.length}
            {recipeGroups.length !== productComponents.length
              ? ` lines · ${recipeGroups.length} entries` : ''})
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            {productComponents.length === 0 ? (
              <div className="empty-state" style={{ padding: '28px 20px' }}>
                <div className="empty-icon" style={{ fontSize: 32 }}>🧩</div>
                <div className="empty-title" style={{ fontSize: 17 }}>No components yet</div>
                <div className="empty-desc">Add components to build the recipe for this product</div>
              </div>
            ) : recipeGroups.map(group => {
              const [first] = group.lines

              /* One line — the row it always was, opening straight into the
                 editor. Grouping is a reading aid, not an extra click. */
              if (group.lines.length === 1) {
                return (
                  <div key={group.key} className="component-item" onClick={() => setEditingPc(first)}>
                    <div className="component-avatar" style={{ fontSize: 16 }}>📦</div>
                    <div className="component-info">
                      <div className="component-name">{first.component?.name || '—'}</div>
                      <div className="component-sub">
                        {formulaDescription(first)}
                        {first.colour_variant ? ` · ${first.colour_variant.name}` : ''}
                        {first.component?.supplier ? ` · ${first.component.supplier}` : ''}
                      </div>
                      <BadgeRow items={conditionBadges(first, optionDefs)} />
                    </div>
                    <div className="component-right">
                      <PriceCell pc={first} />
                      <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 2 }}>
                        {COST_TYPE_LABELS[first.cost_type]}
                      </div>
                    </div>
                    <ChevronRightIcon size={16} />
                  </div>
                )
              }

              /* Several lines — one header saying what the entry is and what
                 tells its lines apart, expanding to the lines themselves.
                 Collapsed by default: every line's condition is on the header,
                 so a closed group still answers "when does each apply". */
              const open   = !!openGroups[group.key]
              const prices = group.lines.map(priceOf)
              const lo = Math.min(...prices), hi = Math.max(...prices)
              // Only an alternatives group can span parts, so only it can span
              // prices; a same-part group is one component, so it keeps the
              // ordinary price cell and the discount that goes with it.
              const spansPrices = lo !== hi

              return (
                <div key={group.key}>
                  <div className="component-item" onClick={() =>
                    setOpenGroups(o => ({ ...o, [group.key]: !o[group.key] }))}>
                    <div className="component-avatar" style={{
                      fontSize: 16,
                      background: group.isAlternatives ? 'var(--blue-bg)' : undefined,
                    }}>
                      {group.isAlternatives ? '🔀' : '📦'}
                    </div>
                    <div className="component-info">
                      <div className="component-name">
                        {group.label}
                        <span style={{
                          fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '1px 6px',
                          borderRadius: 4, background: 'var(--warm-100)', color: 'var(--warm-300)',
                        }}>{group.lines.length}</span>
                      </div>
                      <div className="component-sub">
                        {group.isAlternatives
                          ? `${group.lines.length} lines — whichever one the conditions match`
                          : `${group.lines.length} ways this part is supplied`}
                        {first.component?.supplier ? ` · ${first.component.supplier}` : ''}
                      </div>
                      {/* Every line's condition, on the closed header. This is
                          the whole point of collapsing: the group stays legible
                          without being opened. */}
                      <BadgeRow items={group.lines.map(l =>
                        conditionBadges(l, optionDefs, false)[0] || ALWAYS)} />

                      {(overlapsByKind[group.label] || []).length > 0 && (
                        <div style={{
                          background: 'var(--warning-bg)', borderLeft: '3px solid var(--warning)',
                          borderRadius: 'var(--radius-sm)', padding: '7px 10px', marginTop: 7,
                          fontSize: 11, color: 'var(--warning)', lineHeight: 1.45,
                        }}>
                          {overlapsByKind[group.label].map((o, i) => (
                            <div key={i}>
                              {o.certain
                                ? <>⚠ <strong>{o.a.component?.name}</strong> and <strong>{o.b.component?.name}</strong> can
                                    both apply to one window — it would get two.</>
                                : <>⚠ <strong>{o.a.component?.name}</strong> and <strong>{o.b.component?.name}</strong> may
                                    overlap; a drop limit makes it impossible to be sure.</>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="component-right">
                      {spansPrices
                        ? <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                            ${lo.toFixed(2)}–${hi.toFixed(2)}
                          </div>
                        : <PriceCell pc={first} />}
                      <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 2 }}>
                        {open ? 'Hide lines' : 'Show lines'}
                      </div>
                    </div>
                    <ChevronRightIcon size={16} style={{
                      transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s',
                    }} />
                  </div>

                  {open && group.lines.map(pc => {
                    const badges = conditionBadges(pc, optionDefs, false)
                    return (
                      <div key={pc.id} className="component-item"
                        onClick={() => setEditingPc(pc)}
                        style={{
                          paddingLeft: 34, background: 'var(--warm-100)',
                          borderLeft: '3px solid var(--warm-200)',
                        }}>
                        <div className="component-info">
                          <div className="component-name" style={{ fontSize: 13 }}>
                            {/* Named per line inside an alternatives group, where
                                the parts differ; inside a same-part group the
                                header already said it, so the formula leads. */}
                            {group.isAlternatives ? (pc.component?.name || '—') : formulaDescription(pc)}
                          </div>
                          <div className="component-sub">
                            {group.isAlternatives ? formulaDescription(pc) : ''}
                            {pc.colour_variant ? `${group.isAlternatives ? ' · ' : ''}${pc.colour_variant.name}` : ''}
                          </div>
                          <BadgeRow items={badges.length ? badges : [ALWAYS]} />
                        </div>
                        <div className="component-right">
                          {group.isAlternatives && <PriceCell pc={pc} />}
                          <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 2 }}>
                            {COST_TYPE_LABELS[pc.cost_type]}
                          </div>
                        </div>
                        <ChevronRightIcon size={16} />
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <button className="btn btn-secondary btn-block" style={{ marginBottom: 24 }} onClick={() => setAddOpen(true)}>
            <PlusIcon size={16} /> Add Component to Recipe
          </button>


          {/* Blind price grid — width across, drop down */}
          {isBlind && productComponents.length > 0 && (
            <>
              <div className="section-title" style={{ padding: '0 0 8px' }}>Pricing Grid</div>
              {assumed.length > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginBottom: 8 }}>
                  Priced as {assumed.join(' · ')}
                </div>
              )}
              <div style={{
                background: '#fff', border: '1px solid var(--warm-200)',
                borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 10,
              }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620, fontVariantNumeric: 'tabular-nums' }}>
                    <thead>
                      <tr style={{ background: 'var(--accent-dark)' }}>
                        <th style={{
                          padding: '9px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          color: 'rgba(255,255,255,0.7)', position: 'sticky', left: 0,
                          background: 'var(--accent-dark)', zIndex: 1, whiteSpace: 'nowrap',
                        }}>Drop \ Width</th>
                        {GRID_BLIND_WIDTHS.map(w => (
                          <th key={w} style={{
                            padding: '9px 8px', textAlign: 'right', fontSize: 11, fontWeight: 700,
                            color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap',
                          }}>{w}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {blindGrid.map((row, ri) => (
                        <tr key={row.drop} style={{ background: ri % 2 ? 'var(--warm-100)' : '#fff' }}>
                          <td style={{
                            padding: '8px 12px', fontSize: 12, fontWeight: 700,
                            borderTop: '1px solid var(--warm-100)', whiteSpace: 'nowrap',
                            position: 'sticky', left: 0, zIndex: 1,
                            background: ri % 2 ? 'var(--warm-100)' : '#fff',
                          }}>{row.drop}</td>
                          {row.cells.map(cell => (
                            <td key={cell.width} style={{
                              padding: '8px 8px', textAlign: 'right', fontSize: 12,
                              borderTop: '1px solid var(--warm-100)', whiteSpace: 'nowrap',
                            }}>
                              ${fmt(cell.cost)}
                              <div style={{ fontSize: 10, color: 'var(--warm-300)' }}>
                                ${fmt(cell.cost * markup)}
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginBottom: 24 }}>
                Cost on top, cost × {markup} beneath. Sizes in mm.
              </div>
            </>
          )}

          {/* Pricing grid — tracks only */}
          {isTrack && productComponents.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div className="section-title" style={{ padding: 0 }}>Pricing Grid</div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowBreakdown(true)}
                >
                  🔍 See Breakdown
                </button>
              </div>
              <div style={{
                background: '#fff', border: '1px solid var(--warm-200)', borderRadius: 'var(--radius)',
                overflow: 'hidden', marginBottom: 24,
              }}>
                {/* Scrollable table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                    <thead>
                      <tr style={{ background: 'var(--accent-dark)' }}>
                        <th style={{
                          padding: '10px 14px', textAlign: 'left', fontSize: 11,
                          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                          color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap',
                          position: 'sticky', left: 0, background: 'var(--accent-dark)', zIndex: 1,
                        }}>
                          Width (mm)
                        </th>
                        {gridCosts.map(({ width }) => (
                          <th key={width} style={{
                            padding: '10px 10px', textAlign: 'right', fontSize: 11,
                            fontWeight: 700, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap',
                          }}>
                            {width.toLocaleString()}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{
                          padding: '12px 14px', fontSize: 11, fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          color: 'var(--warm-300)', whiteSpace: 'nowrap',
                          position: 'sticky', left: 0, background: '#fff',
                          borderRight: '1px solid var(--warm-200)',
                        }}>
                          Cost ($)
                        </td>
                        {gridCosts.map(({ width, cost }) => (
                          <td key={width} style={{
                            padding: '12px 10px', textAlign: 'right',
                            fontSize: 14, fontWeight: 600, color: 'var(--ink)',
                            borderLeft: '1px solid var(--warm-100)',
                            whiteSpace: 'nowrap',
                          }}>
                            {fmt(cost)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          <div className="divider" />
          <button className="btn btn-danger btn-block" onClick={onDeleteProduct}>
            <TrashIcon size={15} /> Delete Product
          </button>
        </div>
      </div>

      <ProductComponentModal
        open={addOpen}
        productComponent={null}
        allComponents={allComponents}
        optionDefs={optionDefs}
        suppliers={suppliers}
        widthSchedules={widthSchedules}
        onSaveSchedule={onSaveSchedule}
        onDeleteSchedule={onDeleteSchedule}
        onClose={() => setAddOpen(false)}
        onSave={(data) => { onAddComponent(data); setAddOpen(false) }}
        saving={saving}
      />

      {editingPc && (
        <ProductComponentModal
          open={!!editingPc}
          productComponent={editingPc}
          allComponents={allComponents}
        optionDefs={optionDefs}
          suppliers={suppliers}
          widthSchedules={widthSchedules}
          onSaveSchedule={onSaveSchedule}
          onDeleteSchedule={onDeleteSchedule}
          onClose={() => setEditingPc(null)}
          onSave={(data) => { onUpdateComponent(editingPc.id, data); setEditingPc(null) }}
          onRemove={() => { onRemoveComponent(editingPc.id); setEditingPc(null) }}
          saving={saving}
        />
      )}

      {/* ---- BREAKDOWN MODAL ---- */}
      {showBreakdown && isTrack && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setShowBreakdown(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 768 }}>
            <div className="modal-handle" />
            <div className="modal-header">
              <div>
                <div className="modal-title">Component Breakdown</div>
                <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>{product.name}</div>
              </div>
              <button onClick={() => setShowBreakdown(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
                <XIcon size={22} />
              </button>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900, fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  {/* Width header row */}
                  <tr style={{ background: 'var(--accent-dark)' }}>
                    <th style={{
                      padding: '10px 12px', textAlign: 'left', fontSize: 11,
                      fontWeight: 700, color: 'rgba(255,255,255,0.7)',
                      position: 'sticky', left: 0, background: 'var(--accent-dark)',
                      minWidth: 140, whiteSpace: 'nowrap',
                    }}>
                      Component
                    </th>
                    {GRID_WIDTHS.map(w => (
                      <th key={w} style={{
                        padding: '10px 8px', textAlign: 'right', fontSize: 11,
                        fontWeight: 700, color: 'rgba(255,255,255,0.85)',
                        whiteSpace: 'nowrap', minWidth: 72,
                      }}>
                        {w.toLocaleString()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {productComponents.map((pc, pcIdx) => {
                    const base     = Number(pc.component?.unit_cost) || 0
                    const discount = Number(pc.component?.discount) || 0
                    const unitCost = base * (1 - discount / 100)
                    return (
                      <tr key={pc.id} style={{ background: pcIdx % 2 === 0 ? 'var(--warm-100)' : '#fff' }}>
                        {/* Component name — sticky left */}
                        <td style={{
                          padding: '9px 12px',
                          position: 'sticky', left: 0,
                          background: pcIdx % 2 === 0 ? 'var(--warm-100)' : '#fff',
                          borderRight: '1px solid var(--warm-200)',
                        }}>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{pc.component?.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--warm-300)', marginTop: 1 }}>
                            ${unitCost.toFixed(4)}/{pc.component?.unit}
                            {pc.colour_variant ? ` · ${pc.colour_variant.name}` : ''}
                          </div>
                        </td>
                        {GRID_WIDTHS.map(w => {
                          const qty      = calcQty(pc, w, 0)
                          const lineCost = qty * unitCost
                          const label    = fixedPerWidthLabel(pc, w)
                          return (
                            <td key={w} style={{
                              padding: '9px 8px', textAlign: 'right',
                              borderLeft: '1px solid var(--warm-100)',
                            }}>
                              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{fmtQty(qty)}</div>
                              {label && (
                                <div style={{ fontSize: 10, color: 'var(--accent-dark)', fontWeight: 600, marginTop: 1 }}>
                                  {label}
                                </div>
                              )}
                              <div style={{ fontSize: 10, color: 'var(--warm-300)', marginTop: 1 }}>
                                ${fmt(lineCost)}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  {/* Total row */}
                  <tr style={{ background: 'var(--accent-bg)', borderTop: '2px solid var(--accent)' }}>
                    <td style={{
                      padding: '10px 12px', fontWeight: 700, fontSize: 13,
                      color: 'var(--accent-dark)',
                      position: 'sticky', left: 0, background: 'var(--accent-bg)',
                      borderRight: '1px solid var(--warm-200)',
                    }}>
                      Total
                    </td>
                    {GRID_WIDTHS.map(w => (
                      <td key={w} style={{
                        padding: '10px 8px', textAlign: 'right',
                        fontWeight: 700, fontSize: 13, color: 'var(--accent-dark)',
                        borderLeft: '1px solid #c8e89a',
                      }}>
                        ${fmt(calcCostAtWidth(productComponents, w))}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-block" onClick={() => setShowBreakdown(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  )
}

// Inline since it's only used here
function ChevronRightIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="var(--warm-200)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}