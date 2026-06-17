import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../components/Icons'

export default function SupplierDetail({ supplier, components, onBack, onEdit, onEditComponent, onAddComponent }) {
  // Components from this supplier
  const supplierComponents = components.filter(c => c.supplier_id === supplier.id)

  const InfoRow = ({ label, value, href }) => {
    if (!value) return null
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--warm-100)' }}>
        <div style={{ fontSize: 12, color: 'var(--warm-300)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
        {href
          ? <a href={href} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: 'var(--blue)', fontWeight: 500 }}>{value}</a>
          : <div style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>
        }
      </div>
    )
  }

  return (
    <>
      <div className="header">
        <button className="header-back" onClick={onBack}>
          <ChevronLeftIcon size={18} /> Suppliers
        </button>
        <div className="header-title" style={{ fontSize: 16 }}>{supplier.name}</div>
        <div className="header-actions">
          <button
            onClick={onAddComponent}
            style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <PlusIcon size={16} /> Component
          </button>
          <button
            onClick={onEdit}
            style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px' }}
          >
            Edit
          </button>
        </div>
      </div>

      <div className="scroll-area">
        <div style={{ padding: 16 }}>

          {/* Summary cards */}
          <div className="summary-grid" style={{ padding: 0, marginBottom: 16 }}>
            <div className="summary-card">
              <div className="summary-val">{supplierComponents.length}</div>
              <div className="summary-lbl">Components</div>
            </div>
            <div className="summary-card">
              <div className="summary-val">{Number(supplier.discount) > 0 ? `${supplier.discount}%` : '—'}</div>
              <div className="summary-lbl">Discount</div>
            </div>
          </div>

          {/* Contact details */}
          <div className="card card-body" style={{ marginBottom: 16 }}>
            <InfoRow label="Contact" value={supplier.contact_name} />
            <InfoRow label="Phone" value={supplier.phone} href={supplier.phone ? `tel:${supplier.phone}` : null} />
            <InfoRow label="Email" value={supplier.email} href={supplier.email ? `mailto:${supplier.email}` : null} />
            <InfoRow label="Website" value={supplier.website} href={supplier.website} />
            {supplier.notes && (
              <div style={{ paddingTop: 12, fontSize: 13, color: 'var(--warm-300)', lineHeight: 1.5 }}>
                {supplier.notes}
              </div>
            )}
            {!supplier.contact_name && !supplier.phone && !supplier.email && !supplier.website && !supplier.notes && (
              <div style={{ fontSize: 13, color: 'var(--warm-300)', textAlign: 'center', padding: '8px 0' }}>
                No contact details added
              </div>
            )}
          </div>

          {/* Components from this supplier */}
          <div className="section-title" style={{ padding: '0 0 8px' }}>
            Components ({supplierComponents.length})
          </div>

          <div className="card">
            {supplierComponents.length === 0 ? (
              <div className="empty-state" style={{ padding: '28px 20px' }}>
                <div className="empty-icon" style={{ fontSize: 32 }}>📦</div>
                <div className="empty-desc" style={{ marginBottom: 16 }}>No components linked to this supplier yet.</div>
                <button className="btn btn-secondary" onClick={onAddComponent}>
                  <PlusIcon size={15} /> Add Component
                </button>
              </div>
            ) : supplierComponents.map(c => (
              <div key={c.id} className="component-item" onClick={() => onEditComponent(c)}>
                <div className="component-avatar">📦</div>
                <div className="component-info">
                  <div className="component-name">{c.name}</div>
                  <div className="component-sub">
                    {c.supplier_pn || '—'}
                    {(c.colour_variants || []).length > 0 && ` · ${c.colour_variants.length} colours`}
                  </div>
                </div>
                <div className="component-right">
                  <div className="component-cost">${Number(c.unit_cost).toFixed(2)}</div>
                  <div className="component-unit">
                    per {c.unit}
                    {Number(c.discount) > 0 && (
                      <span style={{ color: 'var(--success)', marginLeft: 4 }}>−{c.discount}%</span>
                    )}
                  </div>
                </div>
                <ChevronRightIcon size={16} color="var(--warm-200)" style={{ flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}