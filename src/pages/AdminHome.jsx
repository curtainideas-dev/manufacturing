import { ChevronRightIcon } from '../components/Icons'

const SECTIONS = [
  { key: 'options',           emoji: '🎛️', name: 'Options',
    desc: 'The questions asked when a window is created — one set per product type.' },
  { key: 'fabric_categories', emoji: '🎨', name: 'Fabric Categories',
    desc: 'The A-F pricing tiers a blind is quoted at, and the price ceiling that sorts fabrics into each.' },
]

export default function AdminHome({ onOpenOptions, onOpenFabricCategories }) {
  const handlers = { options: onOpenOptions, fabric_categories: onOpenFabricCategories }

  return (
    <>
      <div className="header">
        <div className="header-title">Admin</div>
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
