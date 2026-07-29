/**
 * Product naming convention:
 *   TRACKTYPE | FIXING METHOD | OPENING DIRECTION | OPENING METHOD | RETURN LOCATION
 *
 * The return location is omitted where it doesn't apply (centre open, free
 * hanging), so a missing segment is a valid value in its own right.
 */

export const SEGMENTS = [
  { idx: 0, label: 'Track type' },
  { idx: 1, label: 'Fixing' },
  { idx: 2, label: 'Opening' },
  { idx: 3, label: 'Method' },
  { idx: 4, label: 'Return' },
]

export const NONE = '__none__'   // product has no value for this segment

export const parseProductName = (name) =>
  String(name || '').split('|').map(s => s.trim())

export const segValue = (product, idx) => parseProductName(product.name)[idx] || ''

// Does a product satisfy every active segment filter? (filters: array of 5)
export const matchesSegments = (product, filters) =>
  filters.every((val, idx) => {
    if (!val) return true
    const v = segValue(product, idx)
    return val === NONE ? v === '' : v === val
  })

/**
 * Values available for one segment, narrowed by the other active filters so a
 * combination can never be picked that yields nothing.
 */
export function optionsForSegment(products, filters, idx, extraFilter = () => true) {
  const others = filters.map((v, i) => (i === idx ? '' : v))
  const pool   = products.filter(p => matchesSegments(p, others) && extraFilter(p))
  const values = new Set()
  let hasBlank = false
  pool.forEach(p => {
    const v = segValue(p, idx)
    if (v) values.add(v)
    else hasBlank = true
  })
  return { values: [...values].sort(), hasBlank }
}
