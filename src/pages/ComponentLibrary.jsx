import { useState, useMemo } from 'react'
import { PlusIcon, ChevronRightIcon } from '../components/Icons'
import { exportComponentsCSV } from '../lib/exportCSV'
import { exportComponentLabels } from '../lib/exportLabels'
import ComponentLabelsModal from '../components/ComponentLabelsModal'

/**
 * The library reads two ways, and both are worth having.
 *
 *   By kind   what a part IS — Tube, Winder, Base Rail. The grouping the
 *             recipes actually reason about, and the one that answers "what
 *             else could go here". Parts with no kind yet fall to the bottom,
 *             still in their type sections, under a heading that says so —
 *             which is also the nudge to tag them.
 *
 *   By type   how a part is bought and stocked — a bar is cut, a pack is
 *             counted, fabric comes off a roll. Independent of kind, and what
 *             the page has always shown.
 *
 * Kind leads because it is the newer, sparser axis and the one being filled
 * in; a library where nothing is tagged still reads exactly as it used to.
 */

// How a part is bought — the axis that has always organised this page.
const TYPE_SECTIONS = [
  { id: 'labour', emoji: '🕐', title: 'Labour',         match: c => c.order_type === 'labour' },
  { id: 'bar',    emoji: '📏', title: 'Tracks & Tubes', match: c => c.order_type === 'bar' },
  { id: 'fabric', emoji: '🧵', title: 'Fabrics',        match: c => c.order_type === 'fabric' },
  { id: 'pack',   emoji: '📦', title: 'Components',     match: c => c.order_type === 'pack' || !c.order_type },
]

const typeMeta = c =>
  TYPE_SECTIONS.find(s => s.match(c)) || TYPE_SECTIONS[3]

const AVATAR_BG = {
  labour: 'var(--blue-bg)', bar: '#FFF7ED', fabric: '#FDF2F8', pack: 'var(--accent-bg)',
}

function SectionHeader({ emoji, title, count, tint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0 8px' }}>
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <span style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: tint || 'var(--warm-300)',
      }}>{title}</span>
      <span style={{
        fontSize: 11, fontWeight: 600, color: 'var(--warm-300)',
        background: 'var(--warm-100)', borderRadius: 99, padding: '1px 8px',
      }}>{count}</span>
    </div>
  )
}

function ComponentRow({ c, supplierName, usedIn, showKind, onEdit }) {
  const meta = typeMeta(c)
  return (
    <div className="component-item" onClick={() => onEdit(c)}>
      <div className="component-avatar" style={{ background: AVATAR_BG[meta.id], fontSize: 18 }}>
        {meta.emoji}
      </div>
      <div className="component-info">
        <div className="component-name">
          {c.name}
          {/* Only outside a kind section, where the heading already says it. */}
          {showKind && c.kind && (
            <span style={{
              fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '1px 6px',
              borderRadius: 4, background: 'var(--blue-bg)', color: 'var(--blue)',
            }}>{c.kind}</span>
          )}
        </div>
        <div className="component-sub">
          {supplierName}
          {c.supplier_pn ? ` · ${c.supplier_pn}` : ''}
          {c.order_type === 'bar' && c.bar_length_mm
            ? ` · ${Number(c.bar_length_mm).toLocaleString()}mm bars`
            : ''}
          {c.order_type === 'fabric'
            ? ` · ${c.fabric_code || '?'} · ${(c.roll_widths || []).join(' / ') || '?'}mm rolls`
            : ''}
        </div>
        <div style={{ fontSize: 11, marginTop: 3, color: usedIn > 0 ? 'var(--accent)' : 'var(--warm-300)' }}>
          {usedIn > 0
            ? `Used in ${usedIn} product${usedIn !== 1 ? 's' : ''}`
            : 'Not used in any product'}
        </div>
      </div>
      <div className="component-right">
        <div className="component-cost">${Number(c.unit_cost).toFixed(2)}</div>
        <div className="component-unit">
          per {c.unit}
          {Number(c.discount) > 0 && (
            <span style={{ color: 'var(--success)', marginLeft: 4 }}>−{c.discount}%</span>
          )}
        </div>
      </div>
      <ChevronRightIcon size={16} color="var(--warm-200)" style={{ flexShrink: 0 }} />
    </div>
  )
}

export default function ComponentLibrary({ components, suppliers, componentUsage = {}, stockMap = {}, onEdit, onAdd }) {
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState('kind')
  const [showLabels, setShowLabels] = useState(false)
  const [printing, setPrinting]     = useState(false)

  const handlePrintLabels = async (items) => {
    setPrinting(true)
    try {
      await exportComponentLabels(items)
      setShowLabels(false)
    } finally {
      setPrinting(false)
    }
  }

  const supplierNameOf = useMemo(() => {
    const byId = new Map(suppliers.map(s => [s.id, s.name]))
    return (c) => (c.supplier_id ? byId.get(c.supplier_id) : null) || c.supplier || '—'
  }, [suppliers])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return components
    return components.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.kind || '').toLowerCase().includes(q) ||
      supplierNameOf(c).toLowerCase().includes(q) ||
      (c.supplier_pn || '').toLowerCase().includes(q))
  }, [components, search, supplierNameOf])

  // The kinds present in what's on screen, so a search narrows the headings
  // as well as the rows rather than leaving empty sections behind.
  const kindSections = useMemo(() => {
    const map = new Map()
    shown.forEach(c => {
      if (!c.kind) return
      if (!map.has(c.kind)) map.set(c.kind, [])
      map.get(c.kind).push(c)
    })
    return [...map.entries()]
      .map(([kind, list]) => ({ kind, list: list.slice().sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.kind.localeCompare(b.kind))
  }, [shown])

  const untagged = useMemo(() => shown.filter(c => !c.kind), [shown])
  const anyKinds = components.some(c => c.kind)

  // In kind mode only the leftovers are split by type; in type mode, everything.
  const typeSections = useMemo(() => {
    const source = groupBy === 'kind' ? untagged : shown
    return TYPE_SECTIONS
      .map(s => ({ ...s, list: source.filter(s.match) }))
      .filter(s => s.list.length > 0)
  }, [groupBy, untagged, shown])

  const row = (c, showKind) => (
    <ComponentRow key={c.id} c={c} onEdit={onEdit} showKind={showKind}
      supplierName={supplierNameOf(c)}
      usedIn={componentUsage[c.id]?.length || 0} />
  )

  const MODES = [
    { id: 'kind', label: 'By kind' },
    { id: 'type', label: 'By type' },
  ]

  return (
    <>
      <div className="header">
        <div className="header-title">Components</div>
        <div className="header-actions">
          <button
            onClick={() => setShowLabels(true)}
            title="Print stock labels — 93 x 29mm DK, name + part no. + QR"
            style={{
              padding: '6px 12px', fontSize: 13, fontWeight: 600,
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            🏷 Print Labels
          </button>
          <button
            onClick={() => exportComponentsCSV(components, suppliers, stockMap)}
            title="Export CSV — one row per colour, for a P-touch Editor database"
            style={{
              padding: '6px 12px', fontSize: 13, fontWeight: 600,
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            ⬇ Export CSV
          </button>
        </div>
      </div>

      <ComponentLabelsModal
        open={showLabels}
        components={components}
        suppliers={suppliers}
        stockMap={stockMap}
        onClose={() => setShowLabels(false)}
        onPrint={handlePrintLabels}
        printing={printing}
      />

      <div className="scroll-area">
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-val">{components.length}</div>
            <div className="summary-lbl">Total</div>
          </div>
          <div className="summary-card">
            <div className="summary-val">{components.filter(c => c.kind).length}</div>
            <div className="summary-lbl">With Kind</div>
          </div>
          <div className="summary-card">
            <div className="summary-val">{components.filter(c => c.supplier_id || c.supplier).length}</div>
            <div className="summary-lbl">With Supplier</div>
          </div>
        </div>

        <div style={{ padding: '0 16px 12px' }}>
          <input className="field-input" placeholder="Search name, kind, supplier or part no..."
            value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: 14 }} />

          <div style={{ display: 'flex', background: 'var(--warm-100)', borderRadius: 9, padding: 3, marginTop: 10 }}>
            {MODES.map(m => (
              <button key={m.id} type="button" onClick={() => setGroupBy(m.id)}
                style={{
                  flex: 1, border: 'none', padding: 8, borderRadius: 7, cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: groupBy === m.id ? '#fff' : 'transparent',
                  color: groupBy === m.id ? 'var(--accent-dark)' : 'var(--warm-300)',
                }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <div style={{ padding: '0 16px' }}>
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon">📦</div>
                <div className="empty-title">{components.length === 0 ? 'No components yet' : 'No results'}</div>
                <div className="empty-desc">{components.length === 0 ? 'Tap + to add your first component' : 'Try a different search'}</div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '0 16px' }}>

            {groupBy === 'kind' && (
              <>
                {kindSections.map(({ kind, list }) => (
                  <div key={kind}>
                    <SectionHeader emoji="🔀" title={kind} count={list.length} tint="var(--blue)" />
                    <div className="card" style={{ marginBottom: 4 }}>
                      {list.map(c => row(c, false))}
                    </div>
                  </div>
                ))}

                {/* Nothing tagged at all — say so once rather than showing a
                    bare "no kind yet" heading over the entire library. */}
                {!anyKinds && (
                  <div style={{
                    background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
                    padding: '11px 13px', marginTop: 14, fontSize: 12.5, color: 'var(--warm-300)',
                  }}>
                    No component has a <strong>Kind</strong> yet. Open one and name what it is —
                    Tube, Winder, Base Rail — and it will group here, and can be offered as an
                    alternative to its siblings in a recipe.
                  </div>
                )}

                {anyKinds && untagged.length > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '22px 0 2px',
                  }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--warm-200)' }} />
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.09em', color: 'var(--warm-300)',
                    }}>
                      no kind yet · {untagged.length}
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'var(--warm-200)' }} />
                  </div>
                )}
              </>
            )}

            {typeSections.map(s => (
              <div key={s.id}>
                <SectionHeader emoji={s.emoji} title={s.title} count={s.list.length} />
                <div className="card" style={{ marginBottom: 4 }}>
                  {s.list.map(c => row(c, groupBy === 'type'))}
                </div>
              </div>
            ))}

          </div>
        )}
      </div>

      <button className="fab" onClick={onAdd}><PlusIcon size={26} /></button>
    </>
  )
}
