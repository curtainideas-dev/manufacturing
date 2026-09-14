/**
 * Split a list of components into kind sections plus whatever has no kind.
 *
 * `kinds` is the vocabulary from Admin, used only for its order — so the
 * sections appear in the order the kinds are listed there, not alphabetically,
 * and rearranging them in one place rearranges every screen that groups by
 * kind. Anything not in the vocabulary sorts after what is, by name.
 *
 * Returns `sections: []` when nothing in the list is tagged, so a screen can
 * fall back to a flat list rather than showing one "no kind yet" rule over the
 * entire page.
 */
export function groupByKind(list = [], kinds = []) {
  const order = new Map(kinds.map((k, i) => [k.name, Number(k.sort_order) || i]))

  const byKind = new Map()
  const untagged = []
  list.forEach(c => {
    if (!c.kind) return untagged.push(c)
    if (!byKind.has(c.kind)) byKind.set(c.kind, [])
    byKind.get(c.kind).push(c)
  })

  const sections = [...byKind.entries()]
    .map(([kind, items]) => ({
      kind,
      list: items.slice().sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      const ao = order.has(a.kind) ? order.get(a.kind) : Infinity
      const bo = order.has(b.kind) ? order.get(b.kind) : Infinity
      return ao - bo || a.kind.localeCompare(b.kind)
    })

  return { sections, untagged }
}
