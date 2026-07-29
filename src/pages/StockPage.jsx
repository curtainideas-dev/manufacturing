import { useState, useMemo } from 'react'
import { PlusIcon, ChevronRightIcon } from '../components/Icons'
import { getStock, stockValue } from '../lib/stockEngine'
import { exportStockTakeCSV } from '../lib/exportCSV'

const fmtQty = n => {
  const num = Number(n)
  return num % 1 === 0 ? String(num) : num.toFixed(2)
}

const fmt = n => Number(n).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const fmtMoney = n => Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function StockPage({
  components, stockMap, stockBars,
  onEditStock, onReceiveBars, onAddOffcut, onEditOffcut,
}) {
  const [tab, setTab]       = useState('components')
  const [search, setSearch] = useState('')

  const packComponents = components.filter(c => c.order_type === 'pack' || !c.order_type)
  const barComponents  = components.filter(c => c.order_type === 'bar')

  const filterComps = (list) => list.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  )

  // Get all colour rows for a component
  const getRows = (c) => {
    const variants = c.colour_variants || []
    if (variants.length > 0) {
      return variants.map(v => ({ component: c, colour_variant: v }))
    }
    return [{ component: c, colour_variant: null }]
  }

  // Total value of stock on hand, at the discounted (what-you-pay) unit cost.
  // Bars count full bars plus any offcut lengths still available.
  const value = useMemo(() => {
    const sumFor = (list) => list.reduce((total, c) => {
      const variants = (c.colour_variants || [])
      const rows = variants.length > 0
        ? variants.map(v => ({ colour_variant: v }))
        : [{ colour_variant: null }]
      // Guard against a legacy colourless row being counted once per variant
      const seen = new Set()
      return total + rows.reduce((sub, row) => {
        const stock = getStock(stockMap, c, row.colour_variant)
        if (!stock || seen.has(stock.id)) return sub
        seen.add(stock.id)
        const offcutMm = c.order_type === 'bar'
          ? stockBars
              .filter(b => b.component_id === c.id && b.status === 'available' &&
                (b.colour_variant?.suffix || null) === (row.colour_variant?.suffix || null))
              .reduce((s, b) => s + (Number(b.length_mm) || 0), 0)
          : 0
        return sub + stockValue(c, stock, offcutMm)
      }, 0)
    }, 0)
    const packs = sumFor(packComponents)
    const bars  = sumFor(barComponents)
    return { packs, bars, total: packs + bars }
  }, [packComponents, barComponents, stockMap, stockBars])

  // Status dot based on qty vs minimum
  const StatusDot = ({ qty, minimum }) => {
    const min = Number(minimum) || 0
    const q   = Number(qty) || 0
    const color = min === 0 ? 'var(--warm-200)'
      : q <= 0 ? 'var(--danger)'
      : q <= min ? 'var(--warning)'
      : 'var(--success)'
    return <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
  }

  return (
    <>
      <div className="header">
        <div className="header-title">Stock</div>
        <div className="header-actions">
          <button
            onClick={() => exportStockTakeCSV(components, stockMap, stockBars)}
            title="Export stock-take sheet — expected vs actual, for counting"
            style={{
              padding: '6px 12px', fontSize: 13, fontWeight: 600,
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            ⬇ Stock Take CSV
          </button>
        </div>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn ${tab === 'components' ? 'active' : ''}`} onClick={() => setTab('components')}>
          Components ({packComponents.length})
        </button>
        <button className={`tab-btn ${tab === 'bars' ? 'active' : ''}`} onClick={() => setTab('bars')}>
          Tracks & Tubes ({barComponents.length})
        </button>
      </div>

      <div className="scroll-area">
        {/* Total value of stock on hand */}
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{
            background: 'var(--accent-dark)', color: '#fff',
            borderRadius: 'var(--radius)', padding: '14px 18px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7, marginBottom: 4 }}>
                Total Stock Value
              </div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>${fmtMoney(value.total)}</div>
            </div>
            <div style={{ textAlign: 'right', opacity: 0.75, fontSize: 12, lineHeight: 1.6 }}>
              <div>Components ${fmtMoney(value.packs)}</div>
              <div>Tracks &amp; tubes ${fmtMoney(value.bars)}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 16px' }}>
          <input className="field-input" placeholder="Search..."
            value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: 14 }} />
        </div>

        {/* ============ COMPONENTS TAB ============ */}
        {tab === 'components' && (
          <div style={{ padding: '0 16px' }}>
            {filterComps(packComponents).length === 0 ? (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-icon">📦</div>
                  <div className="empty-title" style={{ fontSize: 18 }}>No components</div>
                  <div className="empty-desc">Pack components will appear here</div>
                </div>
              </div>
            ) : filterComps(packComponents).map(c => (
              <div key={c.id} style={{ marginBottom: 10 }}>
                <div className="card">
                  {getRows(c).map((row, i) => {
                    const stock   = getStock(stockMap, c, row.colour_variant)
                    const qty     = Number(stock?.qty_on_hand) || 0
                    const minimum = Number(stock?.qty_minimum) || 0
                    return (
                      <div key={i} className="component-item"
                        onClick={() => onEditStock(row.component, row.colour_variant, stock)}>
                        <StatusDot qty={qty} minimum={minimum} />
                        <div className="component-info">
                          <div className="component-name" style={{ fontSize: 14 }}>
                            {c.name}
                            {row.colour_variant && (
                              <span style={{ fontSize: 12, color: 'var(--warm-300)', fontWeight: 400, marginLeft: 6 }}>
                                · {row.colour_variant.name}
                              </span>
                            )}
                          </div>
                          <div className="component-sub">
                            Min: {minimum} {c.unit}
                            {!stock?.id && ' · Not set up'}
                          </div>
                        </div>
                        <div className="component-right">
                          <div style={{
                            fontSize: 20, fontWeight: 700,
                            color: qty <= 0 ? 'var(--danger)'
                              : minimum > 0 && qty <= minimum ? 'var(--warning)'
                              : 'var(--ink)'
                          }}>
                            {fmtQty(qty)}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--warm-300)' }}>{c.unit}</div>
                        </div>
                        <ChevronRightIcon size={16} color="var(--warm-200)" style={{ flexShrink: 0 }} />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ============ TRACKS & TUBES TAB ============ */}
        {tab === 'bars' && (
          <div style={{ padding: '0 16px' }}>
            {filterComps(barComponents).length === 0 ? (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-icon">📏</div>
                  <div className="empty-title" style={{ fontSize: 18 }}>No bar components</div>
                  <div className="empty-desc">Components with order type "Bar" appear here</div>
                </div>
              </div>
            ) : filterComps(barComponents).map(c => (
              <div key={c.id} style={{ marginBottom: 20 }}>
                {getRows(c).map((row, gi) => {
                  const stock    = getStock(stockMap, c, row.colour_variant)
                  const fullBars = Number(stock?.qty_on_hand) || 0
                  const barLenMm = Number(c.bar_length_mm) || 6000
                  const minimum  = Number(stock?.qty_minimum) || 0

                  // Offcuts for this component + colour
                  const offcuts = stockBars.filter(b =>
                    b.component_id === c.id &&
                    b.status === 'available' &&
                    (b.colour_variant?.suffix || null) === (row.colour_variant?.suffix || null)
                  ).sort((a, b) => b.length_mm - a.length_mm)

                  const totalFullLengthMm  = fullBars * barLenMm
                  const totalOffcutLengthMm = offcuts.reduce((s, b) => s + b.length_mm, 0)
                  const totalAvailableMm    = totalFullLengthMm + totalOffcutLengthMm

                  const colourLabel = row.colour_variant ? ` · ${row.colour_variant.name}` : ''
                  const pn = c.supplier_pn
                    ? `${c.supplier_pn}${row.colour_variant ? `-${row.colour_variant.suffix}` : ''}`
                    : null

                  return (
                    <div key={gi} style={{ marginBottom: 12 }}>
                      {/* Component + colour header */}
                      <div style={{
                        background: 'var(--accent-dark)', borderRadius: 'var(--radius) var(--radius) 0 0',
                        padding: '12px 16px', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>
                            {c.name}{colourLabel}
                          </div>
                          {pn && <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>{pn}</div>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>
                            {fmt(totalAvailableMm)}mm
                          </div>
                          <div style={{ fontSize: 10, opacity: 0.65 }}>total available</div>
                        </div>
                      </div>

                      {/* Full bars section */}
                      <div style={{
                        background: '#fff', border: '1px solid var(--warm-200)',
                        borderTop: 'none', padding: '12px 16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--warm-300)', marginBottom: 4 }}>
                            Full Bars ({barLenMm.toLocaleString()}mm each)
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--warm-300)' }}>
                            Min: {minimum} bars
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{
                              fontSize: 28, fontWeight: 700,
                              color: fullBars <= 0 ? 'var(--danger)'
                                : minimum > 0 && fullBars <= minimum ? 'var(--warning)'
                                : 'var(--ink)'
                            }}>
                              {fullBars}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--warm-300)' }}>bars</div>
                          </div>
                          <button className="btn btn-secondary btn-sm"
                            onClick={() => onReceiveBars(c, row.colour_variant, stock)}>
                            + Receive
                          </button>
                        </div>
                      </div>

                      {/* Offcuts section */}
                      <div style={{
                        background: 'var(--warm-100)', border: '1px solid var(--warm-200)',
                        borderTop: 'none', borderRadius: '0 0 var(--radius) var(--radius)',
                      }}>
                        <div style={{
                          padding: '10px 16px', display: 'flex',
                          alignItems: 'center', justifyContent: 'space-between',
                          borderBottom: offcuts.length > 0 ? '1px solid var(--warm-200)' : 'none',
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--warm-300)' }}>
                            Offcuts ({offcuts.length})
                            {totalOffcutLengthMm > 0 && (
                              <span style={{ fontWeight: 400, marginLeft: 6 }}>
                                · {fmt(totalOffcutLengthMm)}mm total
                              </span>
                            )}
                          </div>
                          <button className="btn btn-secondary btn-sm"
                            onClick={() => onAddOffcut(c, row.colour_variant)}>
                            <PlusIcon size={13} /> Add offcut
                          </button>
                        </div>

                        {offcuts.length === 0 ? (
                          <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--warm-300)' }}>
                            No offcuts recorded
                          </div>
                        ) : (
                          offcuts.map((bar, bi) => (
                            <div key={bar.id}
                              onClick={() => onEditOffcut(bar)}
                              style={{
                                padding: '10px 16px', display: 'flex',
                                alignItems: 'center', justifyContent: 'space-between',
                                borderBottom: bi < offcuts.length - 1 ? '1px solid var(--warm-200)' : 'none',
                                cursor: 'pointer', transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--warm-200)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 16 }}>✂️</span>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 13 }}>{bar.label}</div>
                                  <div style={{ fontSize: 11, color: 'var(--warm-300)' }}>
                                    {bar.length_mm.toLocaleString()}mm
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="pill pill-blue" style={{ fontSize: 11 }}>
                                  {bar.length_mm.toLocaleString()}mm
                                </span>
                                <ChevronRightIcon size={14} color="var(--warm-300)" />
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}