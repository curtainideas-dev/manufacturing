import { useState, useEffect } from 'react'
import { ChevronLeftIcon } from '../components/Icons'

const CODES = ['A', 'B', 'C', 'D', 'E', 'F']

/**
 * Exactly six rows, one per letter — not open CRUD, since the categories
 * themselves are fixed. Each row's price is both the ceiling that classifies
 * a fabric into it (the first category, by ascending price, whose ceiling
 * covers the fabric's real cost) and the flat rate a blind in that category
 * is quoted at, regardless of which fabric was actually picked.
 */
export default function FabricCategoriesAdmin({ categories, onBack, onSave, saving }) {
  const byCode = Object.fromEntries(categories.map(c => [c.code, c]))
  const [drafts, setDrafts] = useState({})

  useEffect(() => {
    setDrafts(Object.fromEntries(categories.map(c => [c.code, String(c.max_price)])))
  }, [categories])

  const commit = (code) => {
    const current = byCode[code]
    const next = Number(drafts[code])
    if (!current || Number.isNaN(next) || next === Number(current.max_price)) return
    onSave(code, next)
  }

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
            Set the price ceiling for each category ($/m²). A fabric is classified into the
            first category (lowest ceiling first) whose ceiling covers its real cost — a fabric
            pricier than every ceiling lands in Category F. A blind assigned to a category is
            quoted at that category's rate on the BOM and cost sheet, whichever fabric within it
            is actually picked.
          </div>

          <div className="card">
            {CODES.map(code => {
              const row = byCode[code]
              return (
                <div key={code} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderBottom: '1px solid var(--warm-100)',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: 'var(--accent-bg)', color: 'var(--accent-dark)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 14,
                  }}>{code}</div>
                  <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>Category {code}</div>
                  {row ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 13, color: 'var(--warm-300)' }}>$</span>
                      <input className="field-input" type="number" step="0.01" min="0"
                        value={drafts[code] ?? ''}
                        onChange={e => setDrafts(d => ({ ...d, [code]: e.target.value }))}
                        onBlur={() => commit(code)}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        disabled={saving}
                        style={{ width: 90, textAlign: 'right' }} />
                      <span style={{ fontSize: 12, color: 'var(--warm-300)' }}>/m²</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--warm-300)' }}>
                      Run supabase_fabric_pricing.sql to enable
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
