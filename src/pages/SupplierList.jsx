import { PlusIcon, ChevronRightIcon } from '../components/Icons'

export default function SupplierList({ suppliers, components, onOpen, onNew }) {
  return (
    <>
      <div className="header">
        <div className="header-title">Suppliers</div>
      </div>

      <div className="scroll-area">
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-val">{suppliers.length}</div>
            <div className="summary-lbl">Suppliers</div>
          </div>
          <div className="summary-card">
            <div className="summary-val">{components.filter(c => c.supplier_id).length}</div>
            <div className="summary-lbl">Linked Components</div>
          </div>
        </div>

        <div style={{ padding: '0 16px' }}>
          <div className="card">
            {suppliers.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🏭</div>
                <div className="empty-title">No suppliers yet</div>
                <div className="empty-desc">Add suppliers to manage contact details and discounts</div>
              </div>
            ) : suppliers.map(s => {
              const compCount = components.filter(c => c.supplier_id === s.id).length
              return (
                <div key={s.id} className="component-item" onClick={() => onOpen(s)}>
                  <div className="component-avatar">🏭</div>
                  <div className="component-info">
                    <div className="component-name">{s.name}</div>
                    <div className="component-sub">
                      {s.contact_name || 'No contact'}
                      {compCount > 0 && ` · ${compCount} component${compCount !== 1 ? 's' : ''}`}
                    </div>
                  </div>
                  <div className="component-right">
                    {Number(s.discount) > 0 && (
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>
                        −{s.discount}%
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 2 }}>
                      {s.email || s.phone || ''}
                    </div>
                  </div>
                  <ChevronRightIcon size={16} color="var(--warm-200)" style={{ flexShrink: 0 }} />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <button className="fab" onClick={onNew}><PlusIcon size={26} /></button>
    </>
  )
}