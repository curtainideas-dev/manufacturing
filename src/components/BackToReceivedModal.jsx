import { useState, useEffect } from 'react'
import { XIcon } from './Icons'
import StockRestoreChoice from './StockRestoreChoice'

/**
 * Moving a job back from In Progress to Received.
 *
 * Received is the editable state, so this is what you reach for when an order
 * turns out to be wrong after it was confirmed. Two things have to be undone.
 *
 * The pricing lock. Confirming snapshots every unit cost and quantity so a
 * confirmed job's value stops moving. Going back to editable has to drop that
 * snapshot, or the job would be editable while still quoting the old figures,
 * and a window added afterwards would price against a snapshot that never
 * knew about it. It is re-taken on the next Confirm.
 *
 * The stock. If it was already deducted, the same question as deleting: were
 * those parts really consumed? Unlike deleting, leaving it deducted is the
 * safer default here — the job is coming back, and double-deducting on the
 * next Confirm is the failure mode to avoid — but the deduction is not
 * repeated automatically either way, so it is put to the user plainly.
 */
export default function BackToReceivedModal({ open, job, plan, onClose, onConfirm, working }) {
  const [restore, setRestore] = useState(false)

  useEffect(() => { if (open) setRestore(false) }, [open])

  if (!open || !job) return null

  const nothingDeducted = !!plan?.isEmpty
  const wasLocked = job.locked_total != null || job.price_snapshot

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div>
            <div className="modal-title">Back to Received?</div>
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
          {nothingDeducted ? (
            <div style={{ fontSize: 13, color: 'var(--warm-300)', lineHeight: 1.5, marginBottom: 12 }}>
              No stock was deducted for this job, so there is nothing to put back.
            </div>
          ) : (
            <StockRestoreChoice plan={plan} restore={restore} onChange={setRestore}
              keepBody="The parts are already cut or fitted. Nothing changes on the shelf — deducting again after the next Confirm would take them twice." />
          )}

          {wasLocked && (
            <div style={{
              background: 'var(--warning-bg)', borderLeft: '3px solid var(--warning)',
              borderRadius: 'var(--radius-sm)', padding: '10px 12px',
              fontSize: 12, color: 'var(--warning)', lineHeight: 1.45,
            }}>
              The locked pricing will be dropped, so the job costs at today’s prices again
              and can be edited. It is locked again on the next Confirm.
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={working}>
            Cancel
          </button>
          <button className="btn btn-primary" style={{ flex: 2 }} disabled={working}
            onClick={() => onConfirm({ restoreStock: !nothingDeducted && restore })}>
            {working
              ? 'Moving…'
              : (!nothingDeducted && restore) ? 'Return stock & move back'
              : 'Move back to Received'}
          </button>
        </div>
      </div>
    </div>
  )
}
