import { useState, useEffect } from 'react'
import { XIcon } from './Icons'
import { fmtQty } from '../lib/bomEngine'

/**
 * Deleting a job that already had stock deducted.
 *
 * The old flow was a confirm() that warned the stock would NOT come back and
 * left it there. That is the wrong thing to hard-code: a job cancelled before
 * anything was cut should return its parts to the shelf, and a job deleted
 * after the parts were fitted should not. Only the person deleting it knows
 * which, so they are asked — and shown exactly what each answer does, because
 * "restore stock" is otherwise a promise of unknown size.
 *
 * Returning is offered first and pre-selected, since a job being deleted is
 * usually one that never got made.
 */

const lineName = (line) => {
  const n = line.component?.name || 'Unknown part'
  return line.colour_variant?.name ? `${n} · ${line.colour_variant.name}` : n
}

function Choice({ on, title, body, onPick }) {
  return (
    <button type="button" onClick={onPick}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        padding: '11px 13px', borderRadius: 'var(--radius-sm)', marginBottom: 8,
        border: `1.5px solid ${on ? 'var(--accent)' : 'var(--warm-200)'}`,
        background: on ? 'var(--accent-bg)' : '#fff',
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
        <div style={{
          width: 17, height: 17, borderRadius: 99, flexShrink: 0, marginTop: 1,
          border: `2px solid ${on ? 'var(--accent)' : 'var(--warm-200)'}`,
          background: on ? 'var(--accent)' : '#fff',
        }} />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: on ? 'var(--accent-dark)' : 'var(--ink)' }}>
            {title}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 2, lineHeight: 1.45 }}>
            {body}
          </div>
        </div>
      </div>
    </button>
  )
}

function SummaryRow({ label, value, tone, first }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 10,
      padding: '8px 12px', fontSize: 12.5,
      borderTop: first ? 'none' : '1px solid var(--warm-100)',
    }}>
      <span>{label}</span>
      <span style={{ fontWeight: 700, color: tone, flexShrink: 0 }}>{value}</span>
    </div>
  )
}

export default function DeleteJobModal({ open, job, plan, onClose, onConfirm, deleting }) {
  const [restore, setRestore] = useState(true)

  useEffect(() => { if (open) setRestore(true) }, [open])

  if (!open || !job) return null

  const quantities = plan?.quantities || []
  const pieces     = plan?.pieces || []
  const offcuts    = plan?.offcuts || []
  const stuck      = plan?.unreturnable || []
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
            <>
              <div style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
                Stock was already deducted for this job. What should happen to it?
              </div>

              <Choice on={restore === true} onPick={() => setRestore(true)}
                title="Put the stock back"
                body="The job was never made, or was cancelled before cutting. Quantities return to the shelf, consumed bars and rolls become available again, and the offcuts this job created are removed." />

              <Choice on={restore === false} onPick={() => setRestore(false)}
                title="Leave the stock as used"
                body="The parts were actually consumed. Nothing changes on the shelf — only the job record goes." />

              {/* What "put the stock back" actually means, itemised. Without
                  this the choice is a promise of unknown size. */}
              {restore && (
                <div style={{
                  border: '1px solid var(--warm-200)', borderRadius: 'var(--radius-sm)',
                  marginTop: 4, marginBottom: 12, overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '8px 12px', background: 'var(--warm-100)',
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.07em', color: 'var(--warm-300)',
                  }}>
                    Returning
                  </div>

                  {quantities.length === 0 && pieces.length === 0 && offcuts.length === 0 && (
                    <div style={{ padding: '11px 12px', fontSize: 12.5, color: 'var(--warm-300)' }}>
                      Nothing can be returned automatically — see below.
                    </div>
                  )}

                  {quantities.map((line, i) => (
                    <SummaryRow key={i} first={i === 0}
                      label={lineName(line)}
                      value={`+${fmtQty(line.qty)}`}
                      tone="var(--success)" />
                  ))}

                  {pieces.length > 0 && (
                    <SummaryRow first={quantities.length === 0}
                      label="Bars and rolls this job consumed"
                      value={`${pieces.length} back`}
                      tone="var(--success)" />
                  )}

                  {offcuts.length > 0 && (
                    <SummaryRow first={quantities.length === 0 && pieces.length === 0}
                      label="Offcuts this job created"
                      value={`${offcuts.length} removed`}
                      tone="var(--danger)" />
                  )}
                </div>
              )}

              {/* Deductions taken before restore tracking existed. Said plainly
                  rather than silently skipped — the numbers wouldn't add up
                  afterwards and nobody would know why. */}
              {restore && stuck.length > 0 && (
                <div style={{
                  background: 'var(--warning-bg)', borderLeft: '3px solid var(--warning)',
                  borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 12,
                  fontSize: 11.5, color: 'var(--warning)', lineHeight: 1.5,
                }}>
                  <strong>{stuck.length} line{stuck.length !== 1 ? 's' : ''} can’t be returned automatically.</strong>
                  {' '}These were deducted before the app recorded what each deduction took off
                  stock, so the figure isn’t known. Adjust them by hand in Stock:
                  <div style={{ marginTop: 6 }}>
                    {stuck.map((l, i) => (
                      <div key={i} style={{ fontWeight: 600 }}>· {lineName(l)} ({fmtQty(Math.abs(l.qty))})</div>
                    ))}
                  </div>
                </div>
              )}
            </>
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
