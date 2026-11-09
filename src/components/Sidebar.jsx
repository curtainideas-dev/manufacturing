/**
 * The workshop's navigation, always on screen.
 *
 * Grouped by how often each part is used: the daily screens first, the
 * libraries they draw on next, and setup, which is touched once and left,
 * last. Setup used to be a separate /admin page reached only from the home
 * tiles; it lives here now so nothing needs a trip back to the front door.
 */
const GROUPS = [
  { title: 'Workshop', items: [
    { tab: 'bom',    label: 'Jobs',   emoji: '📋' },
    { tab: 'orders', label: 'Orders', emoji: '🧾' },
    { tab: 'stock',  label: 'Stock',  emoji: '🏪' },
  ] },
  { title: 'Library', items: [
    { tab: 'components', label: 'Components', emoji: '📦' },
    { tab: 'suppliers',  label: 'Suppliers',  emoji: '🏭' },
    { tab: 'products',   label: 'Products',   emoji: '🔩' },
  ] },
  { title: 'Setup', items: [
    { tab: 'admin', section: 'options',           label: 'Options',           emoji: '🎛️' },
    { tab: 'admin', section: 'fabric_categories', label: 'Fabric categories', emoji: '🎨' },
    { tab: 'admin', section: 'component_kinds',   label: 'Component kinds',   emoji: '🔀' },
    { tab: 'admin', section: 'company_details',   label: 'Company details',   emoji: '🏢' },
    { tab: 'admin', section: 'deleted_records',   label: 'Deleted items',     emoji: '🗑' },
  ] },
]

const LINKS = [
  { href: '/submit',      label: 'Submit a PO',  emoji: '📥' },
  { href: '/romanblinds', label: 'Roman blinds', emoji: '📐' },
  { href: '/',            label: 'Home',         emoji: '🏠' },
]

export default function Sidebar({ tab, section, onGo }) {
  return (
    <nav className="sidebar" aria-label="Main">
      <a href="/" className="sidebar-brand">
        <img src="/favicon.png" alt="" width={24} height={24} style={{ borderRadius: 5 }} />
        Curtain Ideas
      </a>

      {GROUPS.map(g => (
        <div key={g.title} style={{ display: 'contents' }}>
          <div className="sidebar-section">{g.title}</div>
          {g.items.map(it => {
            const active = it.tab === tab && (!it.section || it.section === section)
            return (
              <button key={it.label} type="button"
                className={`sidebar-link${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => onGo(it.tab, it.section || null)}>
                <span className="sidebar-emoji">{it.emoji}</span>{it.label}
              </button>
            )
          })}
        </div>
      ))}

      <div className="sidebar-spacer" />
      {LINKS.map(l => (
        <a key={l.href} href={l.href} className="sidebar-link">
          <span className="sidebar-emoji">{l.emoji}</span>{l.label}
        </a>
      ))}
    </nav>
  )
}
