import { XIcon, CheckIcon } from './Icons'
import { fmtQty } from '../lib/bomEngine'

/**
 * Completing a job that still has parts on the shelf.
 *
 * Deducting stock is a separate step from completing, and nothing connected
 * the two — a job could go out the door with every part still counted as
 * in stock. That error is invisible when it happens and expensive later: the
 * stocktake will not reconcile, and the reorder that should have fired never
 * does because the shelf says there is plenty.
 *
 * It is a prompt rather than a block, because "not deducted" is not always
 * wrong. Parts fitted from the van, a job built from another job's offcuts, a
 * shop that books stock out weekly — all legitimate, and all of them would be
 * stuck behind a rule. So it says what is outstanding and offers the two real
 * answers: go and deduct, or say it was not needed and carry on.
 *
 * A job with nothing outstanding never sees this — it keeps the plain confirm
 * it always had. A warning that appears every time is a warning nobody reads.
 */
export default function CompleteJobModal({ open, job, lines = [], working, onClose, onDeduct, onComplete }) {
  if (!open || !job) return null

  const n = lines.length

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div>
            <div className="modal-title">Complete without deducting?</div>
            <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>
              {job.customer_name || 'Untitled job'}
              {job.job_number ? ` · #${job.job_number}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{
            background: 'var(--warning-bg)', borderLeft: '3px solid var(--warning)',
            borderRadius: 'var(--radius-sm)', padding: '11px 13px',
            fontSize: 12.5, color: 'var(--warning)', lineHeight: 1.45, marginBottom: 14,
          }}>
            {n} part{n !== 1 ? 's' : ''} on this job {n !== 1 ? 'have' : 'has'} not been
            taken off the shelf. Completing now leaves stock counting {n !== 1 ? 'them' : 'it'} as
            still there.
          </div>

          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'var(--warm-300)', marginBottom: 8,
          }}>
            Still on the shelf
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            {lines.map(row => (
              <div key={`${row.component.id}__${row.colour_variant?.suffix || ''}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10, padding: '9px 13px', borderBottom: '1px solid var(--warm-100)',
                }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{row.component.name}</div>
                  {row.colour_variant?.name && (
                    <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 1 }}>
                      {row.colour_variant.name}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {fmtQty(row.total_qty)} {row.component.unit || ''}
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, color: 'var(--warm-300)', lineHeight: 1.5 }}>
            If these were never going to come out of stock — fitted from the van, or
            already booked out by hand — complete the job and nothing changes on the shelf.
          </div>
        </div>

        <div className="modal-footer" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={working}>
            Cancel
          </button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={onDeduct} disabled={working}>
            📦 Deduct Stock First
          </button>
          <button className="btn btn-secondary btn-block" style={{ marginTop: 8 }}
            onClick={onComplete} disabled={working}>
            <CheckIcon size={15} /> {working ? 'Completing…' : 'Complete Anyway'}
          </button>
        </div>
      </div>
    </div>
  )
}
