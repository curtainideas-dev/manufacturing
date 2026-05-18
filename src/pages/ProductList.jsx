import { PlusIcon, ChevronRightIcon } from '../components/Icons'

export default function ProductList({ products, onOpen, onNew }) {
  return (
    <>
      <div className="header">
        <div className="header-title">Products</div>
      </div>

      <div className="scroll-area">
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-val">{products.length}</div>
            <div className="summary-lbl">Products</div>
          </div>
          <div className="summary-card">
            <div className="summary-val">{products.filter(p => p.category === 'track').length}</div>
            <div className="summary-lbl">Tracks</div>
          </div>
        </div>

        <div style={{ padding: '0 16px' }}>
          <div className="card">
            {products.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🔩</div>
                <div className="empty-title">No products yet</div>
                <div className="empty-desc">Tap + to create your first product and build its component recipe</div>
              </div>
            ) : products.map(p => (
              <div key={p.id} className="component-item" onClick={() => onOpen(p)}>
                <div className="component-avatar">{p.category === 'track' ? '🔩' : '🪟'}</div>
                <div className="component-info">
                  <div className="component-name">{p.name}</div>
                  <div className="component-sub">
                    {p.category.charAt(0).toUpperCase() + p.category.slice(1)}
                    {' · '}{p.component_count ?? 0} component{p.component_count !== 1 ? 's' : ''}
                  </div>
                </div>
                <ChevronRightIcon size={16} color="var(--warm-200)" style={{ flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <button className="fab" onClick={onNew}><PlusIcon size={26} /></button>
    </>
  )
}
