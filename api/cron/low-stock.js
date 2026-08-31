/**
 * Daily "stock running low" digest, run by Vercel Cron.
 *
 * checkAndGeneratePOs in App.jsx already spots shortfalls, but only for the
 * components touched by a deduction, and only as a toast that disappears. This
 * sweeps the whole stock table, so it also catches shortfalls that predate the
 * last job — something the existing hook structurally cannot see.
 *
 * PostgREST can't compare two columns in a filter, so the below-minimum test
 * happens in JS. The stock table is small enough that this is fine.
 */

import { isValidCron } from '../_lib/guard.js'
import { supabase } from '../_lib/supabase.js'
import { renderEmail, sendMail } from '../_lib/mailer.js'

export default async function handler(req, res) {
  if (!isValidCron(req)) return res.status(401).json({ error: 'unauthorised' })

  const [stockRes, compRes, suppRes] = await Promise.all([
    supabase.from('stock').select('*'),
    supabase.from('components').select('id, name, supplier_pn, order_type, supplier_id, pack_qty'),
    supabase.from('suppliers').select('id, name'),
  ])

  const failed = [stockRes, compRes, suppRes].find(r => r.error)
  if (failed) {
    console.error('[low-stock] query failed', failed.error)
    return res.status(500).json({ error: failed.error.message })
  }

  const components = new Map((compRes.data || []).map(c => [c.id, c]))
  const suppliers  = new Map((suppRes.data || []).map(s => [s.id, s.name]))

  const low = (stockRes.data || []).flatMap(row => {
    const minimum = Number(row.qty_minimum) || 0
    const onHand  = Number(row.qty_on_hand) || 0
    // A minimum of zero means the component isn't being tracked to a level.
    if (minimum <= 0 || onHand >= minimum) return []
    const component = components.get(row.component_id)
    // Labour lines aren't physical stock and can't be reordered.
    if (!component || component.order_type === 'labour') return []
    return [{ row, component, onHand, minimum, shortfall: minimum - onHand }]
  })

  if (!low.length) return res.status(200).json({ skipped: 'all stock above minimum' })

  // Group by supplier so the digest maps onto how you'd actually reorder.
  const groups = new Map()
  for (const item of low) {
    const key = item.component.supplier_id || 'unknown'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }

  const sections = [...groups.entries()]
    .map(([supplierId, items]) => ({
      heading: suppliers.get(supplierId) || 'No supplier set',
      cards: items
        .sort((a, b) => b.shortfall - a.shortfall)
        .map(({ row, component, onHand, minimum, shortfall }) => {
          const colour = row.colour_variant?.name
          const pn     = component.supplier_pn && row.colour_variant?.suffix
            ? `${component.supplier_pn}-${row.colour_variant.suffix}`
            : component.supplier_pn
          return {
            title: colour ? `${component.name} — ${colour}` : component.name,
            subtitle: pn || undefined,
            rows: [
              ['On hand', String(onHand)],
              ['Minimum', String(minimum)],
              ['Short by', String(Number(shortfall.toFixed(2)))],
            ],
          }
        }),
    }))
    .sort((a, b) => a.heading.localeCompare(b.heading))

  const html = renderEmail({
    title: 'Stock running low',
    intro: `${low.length} component${low.length !== 1 ? 's are' : ' is'} below minimum, grouped by supplier.`,
    sections,
    footnote: 'Daily stock sweep. Draft purchase orders may already exist for some of these — check the Orders tab before reordering.',
  })

  const result = await sendMail({
    to: process.env.NOTIFY_STOCK,
    subject: `${low.length} component${low.length !== 1 ? 's' : ''} below minimum stock`,
    html,
  })

  return res.status(200).json({ ...result, counted: low.length })
}
