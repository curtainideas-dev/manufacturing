import { useState, useEffect } from 'react'
import { XIcon } from './Icons'
import StockRestoreChoice from './StockRestoreChoice'

/**
 * Deleting a job that already had stock deducted.
 *
 * The old flow was a confirm() that warned the stock would NOT come back and
 * left it there. That is the wrong thing to hard-code: a job cancelled before
 * anything was cut should return its parts to the shelf, and a job deleted
 * after the parts were fitted should not. Only the person deleting it knows
 * which, so they are asked.
 *
 * Returning is pre-selected, since a job being deleted is usually one that
 * never got made.
 */
export default function DeleteJobModal({ open, job, plan, onClose, onConfirm, deleting }) {
  const [restore, setRestore] = useState(true)

  useEffect(() => { if (open) setRestore(true) }, [open])

  if (!open || !job) return null

  const nothingDeducted = !!plan?.isEmpty
  const windowCount = (job.windows || []).length

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div>
            <div className="modal-title">Delete this job?</div>
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
              keepBody="The parts were actually consumed. Nothing changes on the shelf — only the job record goes." />
          )}

          <div style={{
            background: 'var(--danger-bg)', borderLeft: '3px solid var(--danger)',
            borderRadius: 'var(--radius-sm)', padding: '10px 12px',
            fontSize: 12, color: 'var(--danger)', lineHeight: 1.45,
          }}>
            The job and its {windowCount} window{windowCount !== 1 ? 's' : ''} will be deleted.
            A copy is kept in Admin → Deleted Items.
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button className="btn btn-danger" style={{ flex: 2 }} disabled={deleting}
            onClick={() => onConfirm({ restoreStock: !nothingDeducted && restore })}>
            {deleting
              ? 'Deleting…'
              : nothingDeducted ? 'Delete job'
              : restore ? 'Return stock & delete'
              : 'Delete, keep stock used'}
          </button>
        </div>
      </div>
    </div>
  )
}
