import { stockKey, getStock } from './stockEngine'
import { planBarCuts, barDeductionsFromPlan, plannedOffcuts, planSummary } from './cutPlan'
import { nestGroups } from './fabricEngine'

/**
 * Everything a job takes off the shelf, worked out without asking.
 *
 * Marking a job Made deducts its stock in one go. This builds that deduction
 * from the same plans the old line-by-line screen pre-filled — so what comes
 * off the shelf is what the cut sheet already said would:
 *
 *   pack    the BOM quantity
 *   bar     the cut plan: offcuts first, then whole bars off the count
 *   fabric  each band from the piece the cut sheet laid it on (a stock piece
 *           still on the shelf, else a new roll)
 *   labour  nothing — it has no shelf
 *
 * Lines already deducted (a movement exists for the part and colour) are left
 * out, so a job that was part-deducted the old way isn't charged twice.
 *
 * Nothing is capped at what's on the shelf. A count that goes below zero is
 * the signal something's wrong — it shows up on To order and at stocktake.
 *
 * Leftovers are a PREDICTION, carried on the movement as planned_offcuts and
 * confirmed afterwards in Record offcuts: bar remnants from the cut plan, and
 * for fabric the strip beside each band and the tail of each stock piece.
 * Anything smaller than MIN_KEEP is left out of the suggestion.
 */
const MIN_KEEP = { widthMm: 300, lengthMm: 500 }

export function planJobDeduction({ jobSummary = [], movements = [], stockMap = {}, stockBars = [] } = {}) {
  const done = new Set(movements.map(m => stockKey(m.component_id, m.colour_variant)))
  const lines = []

  for (const row of jobSummary) {
    const c = row.component
    if (!c || c.order_type === 'labour' || !(Number(row.total_qty) > 0)) continue
    if (done.has(stockKey(c.id, row.colour_variant))) continue
    const stock = getStock(stockMap, c, row.colour_variant)
    const suffix = row.colour_variant?.suffix || null
    const base = { component: c, colour_variant: row.colour_variant || null, qty: row.total_qty }

    if (c.order_type === 'bar') {
      const plan = planBarCuts({
        cuts: row.cuts?.length ? row.cuts : [{ mm: Math.round(row.total_qty * 1000), label: null }],
        barLengthMm: Number(c.bar_length_mm) || 0,
        offcuts: stockBars.filter(b => b.component_id === c.id && b.status === 'available'
          && (b.colour_variant?.suffix || null) === suffix),
        fullBarsOnHand: Number(stock?.qty_on_hand) || 0,
      })
      lines.push({
        ...base, kind: 'bar',
        bars: barDeductionsFromPlan(plan),
        planned_offcuts: plannedOffcuts(plan),
        describe: planSummary(plan),
        short: plan.shortfallBars > 0,
      })
      continue
    }

    if (c.order_type === 'fabric') {
      const bands = nestGroups(row.fabricCuts || [])
      const pieces = new Map()
      const offcuts = []
      bands.forEach(band => {
        const onShelf = band.stockPieceId && stockBars.find(b => b.id === band.stockPieceId && b.status === 'available')
        const pieceId = band.source !== 'order' && onShelf ? band.stockPieceId : '__new_roll__'
        if (!pieces.has(pieceId)) pieces.set(pieceId, { piece_id: pieceId, offcuts: [], usedMm: 0, piece: onShelf || null })
        pieces.get(pieceId).usedMm += band.lengthMm
        const spare = onShelf ? Math.max(0, Number(onShelf.roll_width_mm) - band.usedWidthMm) : band.remainingWidthMm
        if (spare >= MIN_KEEP.widthMm && band.lengthMm >= MIN_KEEP.lengthMm) {
          offcuts.push({ label: `${Math.round(spare)}×${Math.round(band.lengthMm)}mm strip`, length_mm: Math.round(band.lengthMm), roll_width_mm: Math.round(spare) })
        }
      })
      pieces.forEach(p => {
        if (!p.piece) return
        const tail = Number(p.piece.length_mm) - p.usedMm
        if (tail >= MIN_KEEP.lengthMm) {
          offcuts.push({ label: `Rem. ${p.piece.label || 'roll'}`, length_mm: Math.round(tail), roll_width_mm: Math.round(Number(p.piece.roll_width_mm)) })
        }
      })
      const fromStock = [...pieces.values()].filter(p => p.piece).length
      const newRolls  = pieces.has('__new_roll__') ? 1 : 0
      lines.push({
        ...base, kind: 'fabric',
        fabric_pieces: [...pieces.values()].map(p => ({ piece_id: p.piece_id, offcuts: [] })),
        planned_offcuts: offcuts,
        describe: [fromStock && `${fromStock} piece${fromStock > 1 ? 's' : ''} from stock`, newRolls && 'the new roll'].filter(Boolean).join(' + '),
        short: false,
      })
      continue
    }

    lines.push({
      ...base, kind: 'pack', bar_id: null, offcut: null,
      tracked: !!stock,
      short: !!stock && Number(stock.qty_on_hand) < row.total_qty,
    })
  }

  return lines
}
