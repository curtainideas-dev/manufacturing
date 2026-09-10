import { useState } from 'react'
import { ChevronLeftIcon } from '../components/Icons'

/**
 * The recycle bin — what deletes left behind, and the way to put it back.
 *
 * Restored entries are kept rather than cleared, because "who deleted the
 * Wilson job and when" is worth answering long after it has been put back.
 * They move to a quieter section instead of vanishing.
 */

const TYPE_META = {
  mfg_jobs:    { emoji: '📋', name: 'Job' },
  mfg_windows: { emoji: '🪟', name: 'Window' },
}

const when = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d) / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24)  return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
}

// What a job entry actually holds, so the row can say what restoring returns.
const contentsOf = (rec) => {
  if (rec.table_name === 'mfg_jobs') {
    const n = (rec.payload?.windows || []).length
    return `${n} window${n !== 1 ? 's' : ''}`
  }
  return null
}

export default function DeletedRecordsAdmin({
  records = [], onBack, onRestore, restoring, available = true,
}) {
  const [openId, setOpenId] = useState(null)

  const pending  = records.filter(r => !r.restored_at)
  const restored = records.filter(r => r.restored_at)

  const Row = (rec) => {
    const meta = TYPE_META[rec.table_name] || { emoji: '🗄', name: rec.table_name }
    const isOpen = openId === rec.id
    const extra  = contentsOf(rec)
    return (
      <div key={rec.id} style={{ borderBottom: '1px solid var(--warm-100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
          <div className="component-avatar" style={{ fontSize: 16, flexShrink: 0 }}>{meta.emoji}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{rec.label || '(no label)'}</div>
            <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 2 }}>
              {meta.name}
              {extra ? ` · ${extra}` : ''}
              {' · deleted '}{when(rec.deleted_at)}
            </div>
            {rec.restored_at && (
              <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 2, fontWeight: 600 }}>
                Restored {when(rec.restored_at)}
              </div>
            )}
          </div>
          <button onClick={() => setOpenId(isOpen ? null : rec.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
              fontSize: 11.5, fontWeight: 600, color: 'var(--warm-300)', padding: 4,
            }}>
            {isOpen ? 'Hide' : 'Details'}
          </button>
          {!rec.restored_at && (
            <button className="btn btn-primary" disabled={restoring === rec.id}
              onClick={() => onRestore(rec)}
              style={{ flexShrink: 0, padding: '7px 13px', fontSize: 12.5 }}>
              {restoring === rec.id ? 'Restoring…' : 'Restore'}
            </button>
          )}
        </div>

        {isOpen && (
          <pre style={{
            margin: 0, padding: '10px 14px 14px', background: 'var(--warm-100)',
            fontSize: 10.5, lineHeight: 1.45, overflowX: 'auto',
            color: 'var(--warm-300)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{JSON.stringify(rec.payload, null, 2)}</pre>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="header">
        <button className="header-back" onClick={onBack}>
          <ChevronLeftIcon size={18} /> Admin
        </button>
        <div className="header-title" style={{ fontSize: 15 }}>Deleted Items</div>
      </div>

      <div className="scroll-area">
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 12.5, color: 'var(--warm-300)', marginBottom: 14, lineHeight: 1.5 }}>
            Every deleted job and window is copied here first, by the database itself — so it
            catches deletes from anywhere, not just this app. A job is kept together with its
            windows, and restoring puts it back under its original id. Nothing here expires.
          </div>

          {!available ? (
            <div style={{
              background: 'var(--warning-bg)', borderLeft: '3px solid var(--warning)',
              borderRadius: 'var(--radius-sm)', padding: '11px 13px',
              fontSize: 12.5, color: 'var(--warning)',
            }}>
              The <strong>deleted_records</strong> table doesn’t exist yet — run
              <strong> supabase_deleted_records.sql</strong> to switch this on. Until then
              deletes are still permanent.
            </div>
          ) : records.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon">🗑</div>
                <div className="empty-title">Nothing deleted</div>
                <div className="empty-desc">
                  Deleted jobs and windows will appear here, ready to put back.
                </div>
              </div>
            </div>
          ) : (
            <>
              {pending.length > 0 && (
                <>
                  <div className="section-title" style={{ padding: '0 0 8px' }}>
                    Deleted ({pending.length})
                  </div>
                  <div className="card" style={{ marginBottom: 18 }}>{pending.map(Row)}</div>
                </>
              )}

              {restored.length > 0 && (
                <>
                  <div className="section-title" style={{ padding: '0 0 8px' }}>
                    Already restored ({restored.length})
                  </div>
                  <div className="card" style={{ opacity: 0.75 }}>{restored.map(Row)}</div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
