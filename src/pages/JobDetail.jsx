import { useState, useMemo, useRef } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, TrashIcon, CheckIcon } from '../components/Icons'
import { calcWindowBOM, calcJobSummary, fmt, fmtQty } from '../lib/bomEngine'
import { exportJobPDF } from '../lib/exportPDF'
import { exportPackagingLabels, exportTrackLabels, exportPartsLabels } from '../lib/exportLabels'
import PartsListModal from '../components/PartsListModal'

// Download icon inline since it's only used here
const DownloadIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)

export default function JobDetail({ job, products, productComponentsMap, onBack, onUpdate, onDelete, onAddWindow, onOpenWindow, onConfirm, onComplete, onReopen, onAttachPO, poUploading, onDeductStock }) {
  const [tab, setTab]         = useState('windows')
  const [exporting, setExporting] = useState(false)
  const [labeling, setLabeling]   = useState(null) // 'pack' | 'track' | 'parts' | null
  const [partsOpen, setPartsOpen] = useState(false)
  const poFileRef = useRef(null)

  const handlePOFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onAttachPO(file)
  }

  // Confirmed jobs price from the snapshot taken at confirm, so their cost
  // doesn't move when component pricing changes.
  const windowsWithBOM = useMemo(() => {
    return (job.windows || []).map(win => {
      const recipe = productComponentsMap[win.product_id] || []
      return {
        ...win,
        bom: calcWindowBOM(recipe, Number(win.width_mm), Number(win.drop_mm), job.price_snapshot || null),
      }
    })
  }, [job.windows, productComponentsMap, job.price_snapshot])

  const jobSummary = useMemo(() => calcJobSummary(windowsWithBOM), [windowsWithBOM])
  const jobTotal   = jobSummary.reduce((s, r) => s + r.total_cost, 0)
  const isReceived   = job.status === 'received'
  const isInProgress = job.status === 'in_progress'
  const isCompleted  = job.status === 'completed'
  const locked       = !isReceived   // BOM/inputs locked once past Received
  const hasWindows   = (job.windows || []).length > 0

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportJobPDF(job, windowsWithBOM, jobSummary, products)
    } finally {
      setExporting(false)
    }
  }

  const handlePackagingLabels = async () => {
    setLabeling('pack')
    try {
      await exportPackagingLabels(job, windowsWithBOM, products)
    } finally {
      setLabeling(null)
    }
  }

  const handleTrackLabels = async () => {
    setLabeling('track')
    try {
      await exportTrackLabels(job, windowsWithBOM)
    } finally {
      setLabeling(null)
    }
  }

  // Parts for the parts-bag label — seed from the job BOM; accessories (pack) ticked by default
  const partsInitial = useMemo(() => jobSummary.map(r => ({
    key:      `${r.component.id}_${r.colour_variant?.suffix || ''}`,
    name:     r.component.name + (r.colour_variant?.name ? ` (${r.colour_variant.name})` : ''),
    qty:      fmtQty(r.total_qty),
    included: r.component?.order_type === 'pack',
  })), [jobSummary])

  const handlePrintParts = async (selected) => {
    setLabeling('parts')
    try {
      await exportPartsLabels(job, selected)
    } finally {
      setLabeling(null)
      setPartsOpen(false)
    }
  }

  return (
    <>
      <div className="header">
        <button className="header-back" onClick={onBack}>
          <ChevronLeftIcon size={18} /> Jobs
        </button>
        <div className="header-title" style={{ fontSize: 15 }}>
          {job.customer_name || 'Untitled Job'}
        </div>
        <div className="header-actions">
          {/* Export button — always visible when there are windows */}
          {hasWindows && (
            <button
              onClick={handleExport}
              disabled={exporting}
              style={{
                padding: '6px 12px', fontSize: 13, fontWeight: 600,
                background: 'rgba(255,255,255,0.15)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 8, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                opacity: exporting ? 0.6 : 1,
              }}
            >
              <DownloadIcon />
              {exporting ? 'Generating...' : 'PDF'}
            </button>
          )}
          {/* Received → confirm into In Progress */}
          {isReceived && (
            <button onClick={onConfirm} style={{
              padding: '6px 14px', fontSize: 13, fontWeight: 700,
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 8, cursor: 'pointer'
            }}>Confirm</button>
          )}

          {/* In Progress → deduct stock + mark complete */}
          {isInProgress && hasWindows && (
            <button onClick={onDeductStock} style={{
              padding: '6px 12px', fontSize: 13, fontWeight: 600,
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              📦 Deduct Stock
            </button>
          )}
          {/* Completed → locked, allow reopen */}
          {isCompleted && <span className="pill pill-green"><CheckIcon size={10} /> Completed</span>}
          {isCompleted && (
            <button onClick={onReopen} style={{
              padding: '6px 12px', fontSize: 13, fontWeight: 600,
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 8, cursor: 'pointer',
            }}>Reopen</button>
          )}
        </div>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn ${tab === 'windows' ? 'active' : ''}`} onClick={() => setTab('windows')}>
          Windows ({(job.windows || []).length})
        </button>
        <button className={`tab-btn ${tab === 'bom' ? 'active' : ''}`} onClick={() => setTab('bom')}>
          BOM Summary
        </button>
      </div>

      <div className="scroll-area">
        <div style={{ padding: 16 }}>

          {/* Job info */}
          <div className="card card-body" style={{ marginBottom: 16 }}>
            {job.source === 'portal' && (
              <div style={{
                fontSize: 12.5, color: 'var(--accent-dark)', background: 'var(--accent-bg)',
                border: '1px solid var(--warm-200)', borderRadius: 'var(--radius-sm)',
                padding: '8px 12px', marginBottom: 14,
              }}>
                📥 Received via submission portal{job.submitted_by ? ` · ${job.submitted_by}` : ''}
              </div>
            )}
            <div className="grid-2">
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-label">Customer</label>
                <input className="field-input" value={job.customer_name || ''} disabled={locked}
                  onChange={e => onUpdate({ customer_name: e.target.value })}
                  placeholder="Customer name" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-label">Job No.</label>
                <input className="field-input" value={job.job_number || ''} disabled={locked}
                  onChange={e => onUpdate({ job_number: e.target.value })}
                  placeholder="e.g. 2024-081" />
              </div>
            </div>

            {/* Dates — manufacture/invoice print on labels; all editable until completed */}
            <div className="grid-2" style={{ marginTop: 12 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-label">Date of Manufacture</label>
                <input className="field-input" type="date" value={job.date_manufacture || ''} disabled={isCompleted}
                  onChange={e => onUpdate({ date_manufacture: e.target.value || null })} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-label">Date of Invoice</label>
                <input className="field-input" type="date" value={job.date_invoice || ''} disabled={isCompleted}
                  onChange={e => onUpdate({ date_invoice: e.target.value || null })} />
              </div>
            </div>

            <div className="field" style={{ marginBottom: 0, marginTop: 12, maxWidth: '50%' }}>
              <label className="field-label">Delivery Date</label>
              <input className="field-input" type="date" value={job.delivery_requirement || ''} disabled={isCompleted}
                onChange={e => onUpdate({ delivery_requirement: e.target.value || null })} />
            </div>

            {/* Customer PO document */}
            <div className="divider" style={{ margin: '14px 0' }} />
            <input
              ref={poFileRef}
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={handlePOFile}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 22 }}>📄</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="field-label" style={{ marginBottom: 2 }}>Customer PO</div>
                {job.po_pdf_url ? (
                  <a href={job.po_pdf_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 14, color: 'var(--blue)', fontWeight: 600, textDecoration: 'none',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {job.po_pdf_name || 'View PO PDF'}
                  </a>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--warm-300)' }}>No PO attached</div>
                )}
              </div>
              {isReceived && (
                <button
                  onClick={() => poFileRef.current?.click()}
                  disabled={poUploading}
                  style={{
                    padding: '6px 12px', fontSize: 13, fontWeight: 600,
                    background: 'var(--warm-100)', color: 'var(--ink)',
                    border: '1px solid var(--warm-200)', borderRadius: 8, cursor: 'pointer',
                    flexShrink: 0, opacity: poUploading ? 0.6 : 1,
                  }}>
                  {poUploading ? 'Uploading…' : job.po_pdf_url ? 'Replace' : 'Attach PDF'}
                </button>
              )}
            </div>
          </div>

          {/* ---- WINDOWS TAB ---- */}
          {tab === 'windows' && (
            <>
              <div className="card" style={{ marginBottom: 12 }}>
                {windowsWithBOM.length === 0 ? (
                  <div className="empty-state" style={{ padding: '28px 20px' }}>
                    <div className="empty-icon" style={{ fontSize: 32 }}>🪟</div>
                    <div className="empty-title" style={{ fontSize: 17 }}>No windows yet</div>
                    <div className="empty-desc">Add windows to generate the BOM</div>
                  </div>
                ) : windowsWithBOM.map((win, idx) => {
                  const product  = products.find(p => p.id === win.product_id)
                  const winTotal = win.bom.reduce((s, l) => s + l.line_cost, 0)
                  return (
                    <div key={win.id} className="component-item" onClick={() => onOpenWindow(win, idx)}>
                      <div className="component-avatar">🔩</div>
                      <div className="component-info">
                        <div className="component-name">{win.label || `Window ${idx + 1}`}</div>
                        <div className="component-sub">
                          {product?.name || '—'} · {win.width_mm}W × {win.drop_mm}D mm
                        </div>
                      </div>
                      <div className="component-right">
                        <div className="component-cost">${fmt(winTotal)}</div>
                        <div className="component-unit">{win.bom.length} components</div>
                      </div>
                      <ChevronRightIcon size={16} color="var(--warm-200)" style={{ flexShrink: 0 }} />
                    </div>
                  )
                })}
              </div>

              {isReceived && (
                <button className="btn btn-secondary btn-block" onClick={onAddWindow}>
                  <PlusIcon size={16} /> Add Window
                </button>
              )}

              {isInProgress && hasWindows && (
                <div style={{ marginTop: 12 }}>
                  <div className="section-title" style={{ padding: '0 2px 8px' }}>Print labels</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" style={{ flex: '1 1 30%' }}
                      onClick={handlePackagingLabels} disabled={!!labeling} title="Packing label (62×40mm), one per track">
                      🏷️ {labeling === 'pack' ? '…' : 'Packing'}
                    </button>
                    <button className="btn btn-secondary" style={{ flex: '1 1 30%' }}
                      onClick={handleTrackLabels} disabled={!!labeling} title="Product label (62×15mm), one per track">
                      🏷️ {labeling === 'track' ? '…' : 'Product'}
                    </button>
                    <button className="btn btn-secondary" style={{ flex: '1 1 30%' }}
                      onClick={() => setPartsOpen(true)} disabled={!!labeling} title="Parts-list label (62×40mm) — pick parts + quantities">
                      🏷️ {labeling === 'parts' ? '…' : 'Parts'}
                    </button>
                  </div>
                </div>
              )}

              {isInProgress && (
                <button
                  className="btn btn-block"
                  style={{ background: 'var(--success)', color: '#fff', border: 'none', marginTop: 12 }}
                  onClick={onComplete}
                >
                  <CheckIcon size={15} /> Mark Complete
                </button>
              )}

              {(isReceived || isInProgress) && (
                <>
                  <div className="divider" />
                  <button className="btn btn-danger btn-block" onClick={onDelete}>
                    <TrashIcon size={15} /> Delete Job
                  </button>
                </>
              )}
            </>
          )}

          {/* ---- BOM SUMMARY TAB ---- */}
          {tab === 'bom' && (
            <>
              {jobSummary.length === 0 ? (
                <div className="card">
                  <div className="empty-state" style={{ padding: '28px 20px' }}>
                    <div className="empty-icon" style={{ fontSize: 32 }}>📊</div>
                    <div className="empty-title" style={{ fontSize: 17 }}>No BOM yet</div>
                    <div className="empty-desc">Add windows to generate the bill of materials</div>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{
                    background: 'var(--accent-dark)', color: '#fff',
                    borderRadius: 'var(--radius)', padding: '16px 20px',
                    marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7, marginBottom: 4 }}>Total Job Cost</div>
                      <div style={{ fontSize: 28, fontWeight: 700 }}>${fmt(jobTotal)}</div>
                    </div>
                    <div style={{ textAlign: 'right', opacity: 0.7, fontSize: 13 }}>
                      <div>{(job.windows || []).length} window{(job.windows||[]).length !== 1 ? 's' : ''}</div>
                      <div>{jobSummary.length} components</div>
                      {job.price_snapshot && <div style={{ marginTop: 2 }}>🔒 Pricing locked</div>}
                    </div>
                  </div>

                  <div className="card">
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 70px 65px 75px',
                      padding: '10px 16px', background: 'var(--warm-100)',
                      borderBottom: '1px solid var(--warm-200)',
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.06em', color: 'var(--warm-300)'
                    }}>
                      <div>Component</div>
                      <div style={{ textAlign: 'right' }}>Qty</div>
                      <div style={{ textAlign: 'right' }}>Unit $</div>
                      <div style={{ textAlign: 'right' }}>Total</div>
                    </div>

                    {jobSummary.map(row => (
                      <div key={row.component.id} style={{
                        display: 'grid', gridTemplateColumns: '1fr 70px 65px 75px',
                        padding: '11px 16px', borderBottom: '1px solid var(--warm-100)',
                        fontSize: 14, alignItems: 'center'
                      }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{row.component.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 2 }}>
                            {row.component.unit}
                            {row.component.supplier_pn ? ` · ${row.component.supplier_pn}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', fontWeight: 500 }}>{fmtQty(row.total_qty)}</div>
                        <div style={{ textAlign: 'right', color: 'var(--warm-300)', fontSize: 13 }}>${fmt(row.unit_cost)}</div>
                        <div style={{ textAlign: 'right', fontWeight: 600 }}>${fmt(row.total_cost)}</div>
                      </div>
                    ))}

                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 70px 65px 75px',
                      padding: '12px 16px', background: 'var(--accent-bg)',
                      fontSize: 14, fontWeight: 700
                    }}>
                      <div style={{ color: 'var(--accent-dark)' }}>Total</div>
                      <div /><div />
                      <div style={{ textAlign: 'right', color: 'var(--accent-dark)' }}>${fmt(jobTotal)}</div>
                    </div>
                  </div>

                  {/* Export button in BOM tab too */}
                  <div style={{ marginTop: 16 }}>
                    <button className="btn btn-secondary btn-block" onClick={handleExport} disabled={exporting}>
                      <DownloadIcon /> {exporting ? 'Generating PDF...' : 'Download Work Order PDF'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <PartsListModal
        open={partsOpen}
        parts={partsInitial}
        onClose={() => setPartsOpen(false)}
        onPrint={handlePrintParts}
        printing={labeling === 'parts'}
      />
    </>
  )
}