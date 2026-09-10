import { fmtQty } from '../lib/bomEngine'

/**
 * The "what happens to the stock?" question, shared by the two places that
 * have to ask it: deleting a job, and moving one back to Received.
 *
 * Both are the same decision — this job's deduction may or may not reflect
 * parts that were really consumed — so they ask it the same way and show the
 * same itemised answer. Without the itemisation "put the stock back" is a
 * promise of unknown size.
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

export default function StockRestoreChoice({ plan, restore, onChange, keepBody }) {
  const quantities = plan?.quantities || []
  const pieces     = plan?.pieces || []
  const offcuts    = plan?.offcuts || []
  const stuck      = plan?.unreturnable || []

  return (
    <>
      <div style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
        Stock was already deducted for this job. What should happen to it?
      </div>

      <Choice on={restore === true} onPick={() => onChange(true)}
        title="Put the stock back"
        body="The job was never made, or was cancelled before cutting. Quantities return to the shelf, consumed bars and rolls become available again, and the offcuts this job created are removed." />

      <Choice on={restore === false} onPick={() => onChange(false)}
        title="Leave the stock as used"
        body={keepBody || 'The parts were actually consumed. Nothing changes on the shelf.'} />

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
              label={lineName(line)} value={`+${fmtQty(line.qty)}`} tone="var(--success)" />
          ))}

          {pieces.length > 0 && (
            <SummaryRow first={quantities.length === 0}
              label="Bars and rolls this job consumed"
              value={`${pieces.length} back`} tone="var(--success)" />
          )}

          {offcuts.length > 0 && (
            <SummaryRow first={quantities.length === 0 && pieces.length === 0}
              label="Offcuts this job created"
              value={`${offcuts.length} removed`} tone="var(--danger)" />
          )}
        </div>
      )}

      {/* Deductions taken before restore tracking existed. Said plainly rather
          than silently skipped — the numbers wouldn't add up afterwards and
          nobody would know why. */}
      {restore && stuck.length > 0 && (
        <div style={{
          background: 'var(--warning-bg)', borderLeft: '3px solid var(--warning)',
          borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 12,
          fontSize: 11.5, color: 'var(--warning)', lineHeight: 1.5,
        }}>
          <strong>{stuck.length} line{stuck.length !== 1 ? 's' : ''} can’t be returned automatically.</strong>
          {' '}These were deducted before the app recorded what each deduction took off stock,
          so the figure isn’t known. Adjust them by hand in Stock:
          <div style={{ marginTop: 6 }}>
            {stuck.map((l, i) => (
              <div key={i} style={{ fontWeight: 600 }}>· {lineName(l)} ({fmtQty(Math.abs(l.qty))})</div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
