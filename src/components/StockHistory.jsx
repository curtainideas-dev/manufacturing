import { useEffect, useState } from 'react'
import { fmtQty } from '../lib/bomEngine'

/**
 * Every change to stock, newest first: what came in, what jobs took, and
 * every hand correction — so a count that looks wrong can be traced back.
 */
const TYPE = {
  deduct:  { label: 'Used',     color: 'var(--danger)' },
  receive: { label: 'Received', color: 'var(--accent-dark)' },
  adjust:  { label: 'Changed',  color: 'var(--blue)' },
}

const when = (iso) => new Date(iso).toLocaleString('en-AU', {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
})

export default function StockHistory({ onLoad, components = [], jobs = [] }) {
  const [rows, setRows]     = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let live = true
    onLoad().then(r => { if (live) setRows(r) })
    return () => { live = false }
  }, [onLoad])

  if (rows === null) return <div style={{ padding: 24, color: 'var(--warm-300)', fontSize: 13 }}>Loading history…</div>

  const comp = (id) => components.find(c => c.id === id)
  const job  = (id) => jobs.find(j => j.id === id)
  const q = search.trim().toLowerCase()
  const shown = rows.filter(m => !q
    || (comp(m.component_id)?.name || '').toLowerCase().includes(q)
    || (job(m.job_id)?.customer_name || '').toLowerCase().includes(q)
    || (m.notes || '').toLowerCase().includes(q))

  return (
    <>
      <input className="field-input" placeholder="Search part, job or note" value={search}
        onChange={e => setSearch(e.target.value)} style={{ marginBottom: 12 }} />
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="window-grid">
          <thead>
            <tr><th>When</th><th>Part</th><th>What</th><th style={{ textAlign: 'right' }}>Change</th><th>Job or note</th></tr>
          </thead>
          <tbody>
            {shown.map(m => {
              const c = comp(m.component_id)
              const t = TYPE[m.movement_type] || { label: m.movement_type, color: 'var(--warm-300)' }
              const j = job(m.job_id)
              // What left the count; for pieces and fabric (no count) the length instead.
              const delta = Number(m.qty_on_hand_delta) || Number(m.qty) || 0
              return (
                <tr key={m.id}>
                  <td style={{ fontSize: 12, color: 'var(--warm-300)', whiteSpace: 'nowrap' }}>{when(m.created_at)}</td>
                  <td style={{ fontSize: 13 }}>
                    {c?.name || 'Deleted part'}
                    {m.colour_variant?.name && <span style={{ color: 'var(--warm-300)' }}> · {m.colour_variant.name}</span>}
                  </td>
                  <td style={{ fontSize: 12, fontWeight: 700, color: t.color }}>{t.label}</td>
                  <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {delta > 0 ? '+' : ''}{fmtQty(delta)}
                  </td>
                  <td style={{ fontSize: 12.5 }}>
                    {j ? `${j.customer_name || 'Job'}${j.job_number ? ` #${j.job_number}` : ''}` : (m.notes || '—')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'var(--warm-300)' }}>Nothing matches.</div>}
      </div>
    </>
  )
}
