import { useState, useRef } from 'react'
import { ChevronLeftIcon } from '../components/Icons'
import { sortedCategories } from '../lib/fabricEngine'
import { importPriceList, suggestFabricCategories } from '../lib/importPriceList'
import { fmt } from '../lib/bomEngine'

/**
 * Fabric Categories — the SELL side.
 *
 * A category used to be a cost rate: a ceiling that classified a fabric by
 * what it cost us, and a flat price we then charged for anything inside it.
 * Both halves are gone. Cost comes from the fabric's own wholesale rate now,
 * and a category is the tier the WHOLESALER sells a fabric under — a fact off
 * their price list, not something this app can work out.
 *
 * So the page stopped being six editable numbers and became what the price
 * list actually is: a width × drop grid per tier, loaded from the supplier's
 * own workbook. Typing eleven grids of 121 cells by hand is 1,331 chances to
 * fat-finger a price into a margin report, which is why the upload exists and
 * the cells here are read-only.
 */
export default function FabricCategoriesAdmin({
  categories, components = [], onBack, onSaveGrids, onTagFabrics, saving,
}) {
  const [expanded, setExpanded] = useState(null)
  const [result,   setResult]   = useState(null)   // parsed workbook, awaiting confirm
  const [error,    setError]    = useState(null)
  const [busy,     setBusy]     = useState(false)
  const [includeSS, setIncludeSS] = useState(false)
  const fileRef = useRef(null)

  const rows = sortedCategories(categories)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setError(null); setResult(null)
    try {
      const parsed = await importPriceList(file, { includeSunscreen: includeSS })
      if (parsed.grids.length === 0) {
        setError('No price grids found in that workbook. Each grid needs a row starting with "Drop" '
          + 'followed by the width columns, on a tab named like "RollerBlindsCatA".')
      } else {
        setResult({
          ...parsed,
          fileName: file.name,
          suggestions: suggestFabricCategories(parsed.listings, components),
        })
      }
    } catch (err) {
      setError(err?.message || 'Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  const priced = rows.filter(c => Array.isArray(c.prices) && c.prices.length > 0).length

  return (
    <>
      <div className="header">
        <button className="header-back" onClick={onBack}>
          <ChevronLeftIcon size={18} /> Admin
        </button>
        <div className="header-title" style={{ fontSize: 15 }}>Fabric Categories</div>
      </div>

      <div className="scroll-area">
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 12.5, color: 'var(--warm-300)', marginBottom: 14, lineHeight: 1.5 }}>
            A category is the tier the wholesaler sells a fabric under, and it carries their
            width &times; drop price list. That list is what a blind SELLS for; what it costs us
            comes from the fabric&apos;s own rate and the recipe, and the difference between the two
            is the GP on the job. Tag each fabric with its category in the component library.
            A size between bands prices at the next band up.
          </div>

          {/* ---- Upload ---- */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>Load a price list</div>
            <div style={{ fontSize: 12, color: 'var(--warm-300)', marginBottom: 12, lineHeight: 1.5 }}>
              Upload the supplier&apos;s workbook. Each tab named like <code>RollerBlindsCatA</code> is
              read as that category&apos;s grid — the row starting &ldquo;Drop&rdquo; gives the widths,
              the rows under it give the drops. Where a tier appears twice, the newer list wins,
              read from the year printed on the sheet rather than the tab name.
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={includeSS} onChange={e => setIncludeSS(e.target.checked)} />
              <span>
                Include sunscreen tiers (G&ndash;J)
                <span style={{ color: 'var(--warm-300)' }}> — off by default: those grids are still 2015 pricing</span>
              </span>
            </label>

            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
            <button className="btn btn-primary" disabled={busy || saving}
              onClick={() => fileRef.current?.click()}>
              {busy ? 'Reading…' : 'Choose workbook'}
            </button>

            {error && (
              <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--danger)', lineHeight: 1.5 }}>
                {error}
              </div>
            )}
          </div>

          {/* ---- What the upload found, before anything is saved ---- */}
          {result && (
            <div className="card" style={{ padding: 16, marginBottom: 16, border: '1px solid var(--accent)' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>
                {result.fileName}
              </div>
              <div style={{ fontSize: 12, color: 'var(--warm-300)', marginBottom: 12 }}>
                {result.sheetCount} tabs read · {result.grids.length} grid{result.grids.length !== 1 ? 's' : ''} found
              </div>

              {result.grids.map(g => (
                <div key={g.code} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
                  borderBottom: '1px solid var(--warm-100)', fontSize: 12.5,
                }}>
                  <strong style={{ width: 70 }}>{g.code}</strong>
                  <span style={{ flex: 1, color: 'var(--warm-300)' }}>
                    {g.sheet}{g.year ? ` · ${g.year}` : ''}
                  </span>
                  <span style={{ color: 'var(--warm-300)' }}>
                    {g.widths.length}&times;{g.drops.length} · ${fmt(g.minPrice)}&ndash;${fmt(g.maxPrice)}
                  </span>
                </div>
              ))}

              {result.skipped.length > 0 && (
                <details style={{ marginTop: 10 }}>
                  <summary style={{ fontSize: 12, color: 'var(--warm-300)', cursor: 'pointer' }}>
                    {result.skipped.length} tab{result.skipped.length !== 1 ? 's' : ''} not loaded
                  </summary>
                  <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 6, lineHeight: 1.6 }}>
                    {result.skipped.map((s, i) => (
                      <div key={i}>{s.sheet} — {s.reason}</div>
                    ))}
                  </div>
                </details>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }}
                  onClick={() => setResult(null)} disabled={saving}>Discard</button>
                <button className="btn btn-primary" style={{ flex: 2 }} disabled={saving}
                  onClick={() => onSaveGrids(result.grids, result.fileName).then(() => setResult(null))}>
                  {saving ? 'Saving…' : `Load ${result.grids.length} Grid${result.grids.length !== 1 ? 's' : ''}`}
                </button>
              </div>

              {/* Fabric tagging is a separate decision from loading prices, so
                  it is a separate button. The workbook lists ranges, not our
                  component names, and two of them differ by "B/O" vs "L/F"
                  while sitting in different tiers. */}
              {result.suggestions.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--warm-100)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                    Fabric tags this list suggests
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginBottom: 10, lineHeight: 1.5 }}>
                    Matched on name against the supplier&apos;s own range list. Check them —
                    a fabric in the wrong tier is a wrong sell price on every blind made from it.
                  </div>
                  {result.suggestions.map(sug => (
                    <div key={sug.component.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                      borderBottom: '1px solid var(--warm-100)', fontSize: 12.5,
                    }}>
                      <span style={{ flex: 1 }}>
                        {sug.component.fabric_code ? `${sug.component.fabric_code} · ` : ''}
                        {sug.component.name}
                      </span>
                      {sug.current && (
                        <span style={{ fontSize: 11, color: 'var(--warm-300)' }}>now {sug.current} →</span>
                      )}
                      {sug.ambiguous ? (
                        <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
                          {sug.ambiguous.join(' or ')} — pick by hand
                        </span>
                      ) : (
                        <strong style={{ color: 'var(--accent-dark)' }}>{sug.suggested}</strong>
                      )}
                    </div>
                  ))}
                  <button className="btn btn-secondary" style={{ marginTop: 12, width: '100%' }}
                    disabled={saving}
                    onClick={() => onTagFabrics(result.suggestions.filter(s => s.suggested))}>
                    Apply {result.suggestions.filter(s => s.suggested).length} unambiguous tag
                    {result.suggestions.filter(s => s.suggested).length !== 1 ? 's' : ''}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ---- The categories themselves ---- */}
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--warm-300)', marginBottom: 8 }}>
            Categories · {priced} of {rows.length} priced
          </div>

          <div className="card">
            {rows.map(cat => {
              const hasGrid = Array.isArray(cat.prices) && cat.prices.length > 0
              const open    = expanded === cat.code
              const tagged  = components.filter(c => c.order_type === 'fabric' && c.fabric_category === cat.code).length
              return (
                <div key={cat.code} style={{ borderBottom: '1px solid var(--warm-100)' }}>
                  <div onClick={() => setExpanded(open ? null : cat.code)} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px', cursor: hasGrid ? 'pointer' : 'default',
                  }}>
                    <div style={{
                      minWidth: 32, height: 32, padding: '0 8px', borderRadius: 8, flexShrink: 0,
                      background: hasGrid ? 'var(--accent-bg)' : 'var(--warm-100)',
                      color: hasGrid ? 'var(--accent-dark)' : 'var(--warm-300)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 13,
                    }}>{cat.code}</div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{cat.name || `Category ${cat.code}`}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 1 }}>
                        {hasGrid
                          ? `${cat.widths.length} widths × ${cat.drops.length} drops`
                            + (cat.price_list_year ? ` · ${cat.price_list_year} list` : '')
                            + ` · ${tagged} fabric${tagged !== 1 ? 's' : ''}`
                          : `No price list loaded · ${tagged} fabric${tagged !== 1 ? 's' : ''}`}
                      </div>
                    </div>

                    {hasGrid && (
                      <span style={{ fontSize: 11, color: 'var(--warm-300)' }}>{open ? 'Hide' : 'View'}</span>
                    )}
                  </div>

                  {open && hasGrid && (
                    <div style={{ padding: '0 16px 14px', overflowX: 'auto' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '6px 8px', textAlign: 'left', background: 'var(--accent-dark)', color: 'rgba(255,255,255,0.7)', fontSize: 10, whiteSpace: 'nowrap' }}>
                              Drop \ Width
                            </th>
                            {cat.widths.map(w => (
                              <th key={w} style={{ padding: '6px 8px', textAlign: 'right', background: 'var(--accent-dark)', color: '#fff', fontSize: 10.5, whiteSpace: 'nowrap' }}>{w}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {cat.drops.map((d, di) => (
                            <tr key={d}>
                              <td style={{ padding: '5px 8px', fontWeight: 700, borderTop: '1px solid var(--warm-200)', whiteSpace: 'nowrap' }}>{d}</td>
                              {cat.widths.map((w, wi) => {
                                const cell = cat.prices[di]?.[wi]
                                return (
                                  <td key={w} style={{
                                    padding: '5px 8px', textAlign: 'right',
                                    borderTop: '1px solid var(--warm-200)', whiteSpace: 'nowrap',
                                    color: cell == null ? 'var(--warm-300)' : 'var(--ink)',
                                  }}>{cell == null ? '—' : `$${fmt(cell)}`}</td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {cat.price_list_label && (
                        <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 8 }}>
                          From {cat.price_list_label}
                          {cat.priced_at ? ` · loaded ${new Date(cat.priced_at).toLocaleDateString('en-AU')}` : ''}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
