import { useState, useEffect, useCallback } from 'react'
import { supabase } from './lib/supabase'

import ComponentLibrary from './pages/ComponentLibrary'
import ProductList       from './pages/ProductList'
import ProductDetail     from './pages/ProductDetail'
import JobList           from './pages/JobList'
import JobDetail         from './pages/JobDetail'
import WindowDetail      from './pages/WindowDetail'

import ComponentModal        from './components/ComponentModal'
import AddWindowModal        from './components/AddWindowModal'

import { useToast, ToastContainer } from './hooks/useToast.jsx'
import './index.css'

const NAV_TABS = [
  { id: 'components', label: 'Components', emoji: '📦' },
  { id: 'products',   label: 'Products',   emoji: '🔩' },
  { id: 'bom',        label: 'Jobs',       emoji: '📋' },
]

export default function App() {
  const [navTab, setNavTab] = useState('components')

  // ---- Data ----
  const [components, setComponents]           = useState([])
  const [products, setProducts]               = useState([])
  // productComponentsMap: { [product_id]: [product_component rows with nested .component] }
  const [productComponentsMap, setProductComponentsMap] = useState({})
  const [jobs, setJobs]                       = useState([])
  const [loading, setLoading]                 = useState(true)

  // ---- UI state ----
  const [currentProduct, setCurrentProduct]   = useState(null)
  const [currentJob, setCurrentJob]           = useState(null)
  const [currentWindow, setCurrentWindow]     = useState(null) // { win, idx }
  const [compModalOpen, setCompModalOpen]     = useState(false)
  const [editingComp, setEditingComp]         = useState(null)
  const [compSaving, setCompSaving]           = useState(false)
  const [prodSaving, setProdSaving]           = useState(false)
  const [addWindowOpen, setAddWindowOpen]     = useState(false)

  const { toasts, showToast } = useToast()

  // ==== LOAD ALL DATA ====

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [compRes, prodRes, pcRes, jobRes] = await Promise.all([
      supabase.from('components').select('*').order('name'),
      supabase.from('products').select('*').order('name'),
      supabase.from('product_components').select('*, component:components(*)').order('sort_order'),
      supabase.from('mfg_jobs').select('*, mfg_windows(*)').order('created_at', { ascending: false }),
    ])

    if (compRes.error) showToast('Failed to load components', 'error')
    else setComponents(compRes.data)

    if (prodRes.error) showToast('Failed to load products', 'error')
    else {
      // Attach component count to each product for display
      const pcData = pcRes.data || []
      const map = {}
      pcData.forEach(pc => {
        if (!map[pc.product_id]) map[pc.product_id] = []
        map[pc.product_id].push(pc)
      })
      setProductComponentsMap(map)
      setProducts(prodRes.data.map(p => ({
        ...p,
        component_count: (map[p.id] || []).length
      })))
    }

    if (jobRes.error) showToast('Failed to load jobs', 'error')
    else {
      setJobs(jobRes.data.map(j => ({
        ...j,
        windows: (j.mfg_windows || [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(w => ({ ...w, bom_overrides: w.bom_overrides || {} }))
      })))
    }

    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ==== COMPONENTS ====

  const handleCompSave = async (formData) => {
    setCompSaving(true)
    const payload = {
      name:        formData.name.trim(),
      unit:        formData.unit,
      unit_cost:   Number(formData.unit_cost) || 0,
      discount:    Number(formData.discount) || 0,
      supplier:    formData.supplier?.trim() || null,
      supplier_pn: formData.supplier_pn?.trim() || null,
      notes:            formData.notes?.trim() || null,
      colour_variants:  formData.colour_variants || [],
    }
    const result = editingComp
      ? await supabase.from('components').update(payload).eq('id', editingComp.id)
      : await supabase.from('components').insert(payload)
    if (result.error) { showToast(result.error.message || 'Save failed', 'error') }
    else {
      showToast(editingComp ? 'Component updated ✓' : 'Component added ✓', 'success')
      setCompModalOpen(false); setEditingComp(null)
      await loadAll()
    }
    setCompSaving(false)
  }

  const handleCompDelete = async (id) => {
    const comp = components.find(c => c.id === id)
    if (!window.confirm(`Delete "${comp?.name}"?\n\nThis cannot be undone.`)) return
    const { error } = await supabase.from('components').delete().eq('id', id)
    if (error) showToast('Delete failed — component may be used in a product', 'error')
    else { showToast('Deleted', 'success'); setCompModalOpen(false); setEditingComp(null); await loadAll() }
  }

  // ==== PRODUCTS ====

  const handleNewProduct = async () => {
    const { data, error } = await supabase
      .from('products')
      .insert({ name: 'New Product', category: 'track' })
      .select().single()
    if (error) { showToast('Failed to create product', 'error'); return }
    await loadAll()
    setCurrentProduct({ ...data, component_count: 0 })
  }

  const handleProductUpdate = async (updates) => {
    const updated = { ...currentProduct, ...updates }
    setCurrentProduct(updated)
    await supabase.from('products').update(updates).eq('id', currentProduct.id)
  }

  const handleProductDelete = async () => {
    if (!window.confirm(`Delete "${currentProduct.name}"?\n\nThis will also delete its recipe.`)) return
    await supabase.from('products').delete().eq('id', currentProduct.id)
    setCurrentProduct(null)
    showToast('Product deleted')
    await loadAll()
  }

  // Duplicate: create a new product then copy all product_components
  const handleDuplicate = async (newName) => {
    setProdSaving(true)
    // 1. Create new product
    const { data: newProd, error: pe } = await supabase
      .from('products')
      .insert({ name: newName, category: currentProduct.category, notes: currentProduct.notes })
      .select().single()
    if (pe) { showToast('Duplicate failed', 'error'); setProdSaving(false); return }

    // 2. Copy all product_components from source to new product
    const sourceRecipe = productComponentsMap[currentProduct.id] || []
    if (sourceRecipe.length > 0) {
      const copies = sourceRecipe.map(pc => ({
        product_id:        newProd.id,
        component_id:      pc.component_id,
        cost_type:         pc.cost_type,
        formula_deduction: pc.formula_deduction,
        formula_buffer:    pc.formula_buffer,
        formula_divisor:   pc.formula_divisor,
        formula_interval:  pc.formula_interval || 500,
        colour_variant:    pc.colour_variant || null,
        discount:          Number(pc.discount) || 0,
        sort_order:        pc.sort_order,
      }))
      await supabase.from('product_components').insert(copies)
    }

    showToast(`"${newName}" created ✓`, 'success')
    await loadAll()
    setProdSaving(false)
  }

  const handleAddProductComponent = async (formData) => {
    setProdSaving(true)
    const sortOrder = (productComponentsMap[currentProduct.id] || []).length
    const { error } = await supabase.from('product_components').insert({
      product_id:        currentProduct.id,
      component_id:      formData.component_id,
      cost_type:         formData.cost_type,
      formula_deduction: Number(formData.formula_deduction) || 0,
      formula_buffer:    Number(formData.formula_buffer) || 0,
      formula_divisor:   Number(formData.formula_divisor) || 1,
      sort_order:        sortOrder,
    })
    if (error) showToast(error.message || 'Failed to add', 'error')
    else { showToast('Component added to recipe ✓', 'success'); await loadAll() }
    setProdSaving(false)
  }

  const handleUpdateProductComponent = async (id, formData) => {
    setProdSaving(true)
    await supabase.from('product_components').update({
      cost_type:         formData.cost_type,
      formula_deduction: Number(formData.formula_deduction) || 0,
      formula_buffer:    Number(formData.formula_buffer) || 0,
      formula_divisor:   Number(formData.formula_divisor) || 1,
      formula_interval:  Number(formData.formula_interval) || 500,
      colour_variant:    formData.colour_variant || null,
    }).eq('id', id)
    showToast('Updated ✓', 'success')
    await loadAll()
    setProdSaving(false)
  }

  const handleRemoveProductComponent = async (id) => {
    if (!window.confirm('Remove this component from the recipe?')) return
    await supabase.from('product_components').delete().eq('id', id)
    showToast('Removed from recipe')
    await loadAll()
  }

  // ==== JOBS ====

  const handleNewJob = async () => {
    const { data, error } = await supabase
      .from('mfg_jobs')
      .insert({ customer_name: '', job_number: '', status: 'draft' })
      .select().single()
    if (error) { showToast('Failed to create job', 'error'); return }
    const job = { ...data, windows: [] }
    setJobs(prev => [job, ...prev])
    setCurrentJob(job)
  }

  const handleJobUpdate = async (updates) => {
    const updated = { ...currentJob, ...updates }
    setCurrentJob(updated)
    setJobs(prev => prev.map(j => j.id === updated.id ? updated : j))
    await supabase.from('mfg_jobs').update(updates).eq('id', currentJob.id)
  }

  const handleJobDelete = async () => {
    if (!window.confirm('Delete this job and all its windows?')) return
    await supabase.from('mfg_jobs').delete().eq('id', currentJob.id)
    setJobs(prev => prev.filter(j => j.id !== currentJob.id))
    setCurrentJob(null)
    showToast('Job deleted')
  }

  const handleJobConfirm = async () => {
    if (!window.confirm('Confirm this job? The BOM will be locked.')) return
    await handleJobUpdate({ status: 'confirmed' })
    showToast('Job confirmed ✓', 'success')
  }

  const handleAddWindow = async (winData) => {
    const sortOrder = (currentJob.windows || []).length
    const { data, error } = await supabase
      .from('mfg_windows')
      .insert({
        job_id:      currentJob.id,
        product_id:  winData.product_id,
        label:       winData.label,
        width_mm:    Number(winData.width_mm),
        drop_mm:     Number(winData.drop_mm),
        sort_order:  sortOrder,
        bom_overrides: {},
      })
      .select().single()
    if (error) { showToast('Failed to add window', 'error'); return }
    const newWin = { ...data, bom_overrides: {} }
    const updated = { ...currentJob, windows: [...(currentJob.windows || []), newWin] }
    setCurrentJob(updated)
    setJobs(prev => prev.map(j => j.id === updated.id ? updated : j))
  }

  const handleWindowUpdate = async (idx, updates) => {
    const windows = [...currentJob.windows]
    windows[idx] = { ...windows[idx], ...updates }
    const updated = { ...currentJob, windows }
    setCurrentJob(updated)
    setCurrentWindow({ win: windows[idx], idx })
    setJobs(prev => prev.map(j => j.id === updated.id ? updated : j))
    await supabase.from('mfg_windows').update(updates).eq('id', windows[idx].id)
  }

  const handleWindowDelete = async (idx) => {
    if (!window.confirm('Remove this window?')) return
    const win = currentJob.windows[idx]
    await supabase.from('mfg_windows').delete().eq('id', win.id)
    const windows = currentJob.windows.filter((_, i) => i !== idx)
    const updated = { ...currentJob, windows }
    setCurrentJob(updated)
    setCurrentWindow(null)
    setJobs(prev => prev.map(j => j.id === updated.id ? updated : j))
    showToast('Window removed')
  }

  // ==== LOADING ====

  if (loading) {
    return (
      <div className="app">
        <div className="header"><div className="header-title">Manufacturing</div></div>
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--warm-300)', fontSize: 14 }}>Loading...</div>
      </div>
    )
  }

  // ==== ROUTING ====

  const renderScreen = () => {
    // Window detail
    if (navTab === 'bom' && currentJob && currentWindow) {
      const win = currentWindow.win
      const product = products.find(p => p.id === win.product_id)
      const recipe  = productComponentsMap[win.product_id] || []
      return (
        <WindowDetail
          window={win}
          windowIndex={currentWindow.idx}
          totalWindows={currentJob.windows.length}
          product={product}
          productComponents={recipe}
          onBack={() => setCurrentWindow(null)}
          onUpdate={(updates) => handleWindowUpdate(currentWindow.idx, updates)}
          onDelete={() => handleWindowDelete(currentWindow.idx)}
          readOnly={currentJob.status === 'confirmed'}
        />
      )
    }

    // Job detail
    if (navTab === 'bom' && currentJob) {
      return (
        <JobDetail
          job={currentJob}
          products={products}
          productComponentsMap={productComponentsMap}
          onBack={() => setCurrentJob(null)}
          onUpdate={handleJobUpdate}
          onDelete={handleJobDelete}
          onAddWindow={() => setAddWindowOpen(true)}
          onOpenWindow={(win, idx) => setCurrentWindow({ win, idx })}
          onConfirm={handleJobConfirm}
        />
      )
    }

    // Job list
    if (navTab === 'bom') {
      return <JobList jobs={jobs} onOpen={setCurrentJob} onNew={handleNewJob} />
    }

    // Product detail
    if (navTab === 'products' && currentProduct) {
      return (
        <ProductDetail
          product={currentProduct}
          productComponents={productComponentsMap[currentProduct.id] || []}
          allComponents={components}
          onBack={() => setCurrentProduct(null)}
          onUpdateProduct={handleProductUpdate}
          onAddComponent={handleAddProductComponent}
          onUpdateComponent={handleUpdateProductComponent}
          onRemoveComponent={handleRemoveProductComponent}
          onDuplicate={handleDuplicate}
          onDeleteProduct={handleProductDelete}
          saving={prodSaving}
        />
      )
    }

    // Product list
    if (navTab === 'products') {
      return <ProductList products={products} onOpen={setCurrentProduct} onNew={handleNewProduct} />
    }

    // Component library
    return (
      <ComponentLibrary
        components={components}
        onEdit={(c) => { setEditingComp(c); setCompModalOpen(true) }}
        onAdd={() => { setEditingComp(null); setCompModalOpen(true) }}
      />
    )
  }

  const showBottomNav = !currentProduct && !currentJob && !currentWindow

  return (
    <div className="app">
      {renderScreen()}

      {showBottomNav && (
        <div style={{
          position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 768,
          background: '#fff', borderTop: '1px solid var(--warm-200)',
          display: 'flex', zIndex: 50,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          {NAV_TABS.map(tab => (
            <button key={tab.id} onClick={() => setNavTab(tab.id)} style={{
              flex: 1, padding: '10px 0 12px', border: 'none', background: 'none',
              cursor: 'pointer', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 3,
              color: navTab === tab.id ? 'var(--accent)' : 'var(--warm-300)',
              transition: 'color 0.15s',
            }}>
              <span style={{ fontSize: 22 }}>{tab.emoji}</span>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      )}

      <ComponentModal
        open={compModalOpen}
        component={editingComp}
        onClose={() => { setCompModalOpen(false); setEditingComp(null) }}
        onSave={handleCompSave}
        onDelete={handleCompDelete}
        saving={compSaving}
      />

      <AddWindowModal
        open={addWindowOpen}
        windowNumber={(currentJob?.windows || []).length + 1}
        products={products}
        onClose={() => setAddWindowOpen(false)}
        onAdd={handleAddWindow}
      />

      <ToastContainer toasts={toasts} />
    </div>
  )
}
