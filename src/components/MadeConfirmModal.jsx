import { XIcon } from './Icons'
import { fmtQty } from '../lib/bomEngine'

/**
 * Marking a job Made takes its stock off the shelf, all at once.
 *
 * This is the one look before that happens: every part with how much, the
 * bars and offcuts the cut plan uses, and the fabric pieces each band comes
 * from. One button deducts the lot. Parts that came from somewhere else —
 * fitted from the van, booked out by hand — are what "Mark made without
 * deducting" is for.
 *
 * Short lines are shown but not stopped: the count goes below zero, which
 * puts the part on To order.
 */
export default function MadeConfirmModal({ open, job, lines = [], working, onClose, onDeduct, onSkip }) {
  if (!open) return null
  const shortCount = lines.filter(l => l.short).length
  const groups = [
    { kind: 'pack',   title: 'Parts' },
    { kind: 'bar',    title: 'Tracks and tubes' },
    { kind: 'fabric', title: 'Fabric' },
  ].map(g => ({ ...g, rows: lines.filter(l => l.kind === g.kind) })).filter(g => g.rows.length)

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && !working && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Mark made</div>
            <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>
              {job?.customer_name || 'Job'}{job?.job_number ? ` · #${job.job_number}` : ''} · this comes off the shelf
            </div>
          </div>
          <button onClick={onClose} disabled={working} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {shortCount > 0 && (
            <div style={{
              background: 'var(--warning-bg)', borderRadius: 'var(--radius-sm)', padding: '9px 12px',
              fontSize: 12.5, color: 'var(--warning)', marginBottom: 12, lineHeight: 1.45,
            }}>
              {shortCount} line{shortCount > 1 ? 's' : ''} {shortCount > 1 ? 'are' : 'is'} more than the shelf says it has.
              They'll still be taken off; the count goes below zero and shows on To order.
            </div>
          )}
          {groups.map(g => (
            <div key={g.kind} style={{ marginBottom: 12 }}>
              <div className="field-label" style={{ marginBottom: 6 }}>{g.title}</div>
              <div className="card">
                {g.rows.map(l => (
                  <div key={`${l.component.id}_${l.colour_variant?.suffix || ''}`} style={{
                    display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline',
                    padding: '8px 12px', borderBottom: '1px solid var(--warm-100)', background: '#fff',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {l.component.name}
                        {l.colour_variant?.name && <span style={{ fontWeight: 400, color: 'var(--warm-300)' }}> · {l.colour_variant.name}</span>}
                      </div>
                      {(l.describe || (l.kind === 'pack' && !l.tracked)) && (
                        <div style={{ fontSize: 11.5, color: 'var(--warm-300)' }}>
                          {l.describe || 'Not counted in stock'}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: l.short ? 'var(--warning)' : 'var(--ink)' }}>
                      {l.kind === 'pack' ? `${fmtQty(l.qty)} ${l.component.unit || ''}` : l.kind === 'bar' ? `${fmtQty(l.qty)} m` : ''}
                      {l.short && ' ⚠'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {lines.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--warm-300)' }}>Nothing left to take off the shelf.</div>
          )}
        </div>

        <div className="modal-footer" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={working}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={onDeduct} disabled={working}>
            {working ? 'Deducting…' : 'Deduct and mark made'}
          </button>
          <button className="btn btn-secondary btn-block btn-sm" style={{ marginTop: 8 }} onClick={onSkip} disabled={working}>
            Mark made without deducting
          </button>
        </div>
      </div>
    </div>
  )
}
