/**
 * Addresses for the workshop screens.
 *
 * Every screen inside /manufacturing has its own path, so the browser's Back
 * button, a refresh and a bookmark all land where you were:
 *
 *   /manufacturing/jobs                         the jobs list
 *   /manufacturing/jobs/<jobId>                 one job
 *   /manufacturing/jobs/<jobId>/windows/<winId> one window on it
 *   /manufacturing/orders/<poId>                one purchase order
 *   /manufacturing/products/<id>, /suppliers/<id>
 *   /manufacturing/components, /stock
 *   /manufacturing/setup/<section>              options, fabric-categories, …
 *
 * Still no router library: App keeps its screen state, and this module only
 * converts between that state and a path.
 */

export const BASE = '/manufacturing'

// App's tab ids → the path segment people see. 'bom' predates the Jobs label.
const TAB_TO_SEG = {
  components: 'components', suppliers: 'suppliers', products: 'products',
  bom: 'jobs', stock: 'stock', orders: 'orders', admin: 'setup',
}
const SEG_TO_TAB = Object.fromEntries(Object.entries(TAB_TO_SEG).map(([t, s]) => [s, t]))

export const SETUP_SECTIONS = ['options', 'fabric_categories', 'component_kinds', 'company_details', 'deleted_records']
export const DEFAULT_TAB = 'bom'

const sectionToSeg = s => s.replace(/_/g, '-')
const segToSection = s => s.replace(/-/g, '_')

/** The path for a given screen state. */
export function buildPath({ tab, section, id, winId }) {
  const seg = TAB_TO_SEG[tab] || TAB_TO_SEG[DEFAULT_TAB]
  if (tab === 'admin') return `${BASE}/${seg}/${sectionToSeg(section || SETUP_SECTIONS[0])}`
  let path = `${BASE}/${seg}`
  if (id) path += `/${id}`
  if (id && winId && tab === 'bom') path += `/windows/${winId}`
  return path
}

/**
 * The screen state for a path. Unknown paths fall back to the jobs list.
 * The old standalone /admin address opens setup.
 */
export function parsePath(pathname) {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  if (parts[0] === 'admin') return { tab: 'admin', section: SETUP_SECTIONS[0] }
  if (parts[0] !== 'manufacturing') return { tab: DEFAULT_TAB }

  const tab = SEG_TO_TAB[parts[1]] || DEFAULT_TAB
  if (tab === 'admin') {
    const section = segToSection(parts[2] || '')
    return { tab, section: SETUP_SECTIONS.includes(section) ? section : SETUP_SECTIONS[0] }
  }
  return {
    tab,
    id:    parts[2] || null,
    winId: tab === 'bom' && parts[3] === 'windows' ? (parts[4] || null) : null,
  }
}
