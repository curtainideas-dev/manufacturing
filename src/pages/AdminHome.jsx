import { ChevronLeftIcon, ChevronRightIcon } from '../components/Icons'

const SECTIONS = [
  { key: 'options',           emoji: '🎛️', name: 'Options',
    desc: 'The questions asked when a window is created — one set per product type.' },
  { key: 'fabric_categories', emoji: '🎨', name: 'Fabric Categories',
    desc: 'The A-F pricing tiers a blind is quoted at, and the price ceiling that sorts fabrics into each.' },
  { key: 'component_kinds', emoji: '🔀', name: 'Component Kinds',
    desc: 'What a part is — Tube, Winder, Base Rail. Groups the library, and lets a recipe offer one part in place of another.' },
  { key: 'deleted_records', emoji: '🗑', name: 'Deleted Items',
    desc: 'Jobs and windows that were deleted, kept with their contents so they can be put back.' },
]

export default function AdminHome({
  onOpenOptions, onOpenFabricCategories, onOpenComponentKinds, onOpenDeletedRecords,
}) {
  const handlers = {
    options:           onOpenOptions,
    fabric_categories: onOpenFabricCategories,
    component_kinds:   onOpenComponentKinds,
    deleted_records:   onOpenDeletedRecords,
  }

  return (
    <>
      <div className="header">
        <a href="/" className="header-back" style={{ textDecoration: 'none' }}>
          <ChevronLeftIcon size={18} /> Home
        </a>
        <div className="header-title" style={{ fontSize: 15 }}>Admin</div>
      </div>

      <div className="scroll-area">
        <div style={{ padding: 16 }}>
          <div className="card">
            {SECTIONS.map(s => (
              <div key={s.key} className="component-item" onClick={handlers[s.key]}>
                <div className="component-avatar" style={{ fontSize: 16 }}>{s.emoji}</div>
                <div className="component-info">
                  <div className="component-name">{s.name}</div>
                  <div className="component-sub">{s.desc}</div>
                </div>
                <ChevronRightIcon size={16} color="var(--warm-200)" style={{ flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
