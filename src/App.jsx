import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from './lib/supabase'

import ComponentLibrary from './pages/ComponentLibrary'
import StockPage        from './pages/StockPage'
import ProductList       from './pages/ProductList'
import ProductDetail     from './pages/ProductDetail'
import JobList           from './pages/JobList'
import JobDetail         from './pages/JobDetail'
import WindowDetail      from './pages/WindowDetail'
import SupplierList      from './pages/SupplierList'
import SupplierDetail    from './pages/SupplierDetail'

import ComponentModal        from './components/ComponentModal'
import StockEditModal        from './components/StockEditModal'
import BarModal              from './components/BarModal'
import ReceiveBarsModal      from './components/ReceiveBarsModal'
import DeductStockModal      from './components/DeductStockModal'
import SupplierModal         from './components/SupplierModal'
import AddWindowModal        from './components/AddWindowModal'

import { useToast, ToastContainer } from './hooks/useToast.jsx'
import { buildStockMap, stockKey, checkLowStock } from './lib/stockEngine'
import { calcWindowBOM, calcJobSummary } from './lib/bomEngine'
import './index.css'

const NAV_TABS = [
  { id: 'components', label: 'Components', emoji: '📦' },
  { id: 'suppliers',  label: 'Suppliers',  emoji: '🏭' },
  { id: 'products',   label: 'Products',   emoji: '🔩' },
  { id: 'bom',        label: 'Jobs',       emoji: '📋' },
  { id: 'stock',      label: 'Stock',      emoji: '🏪' },
]

export default function App() {
  const [navTab, setNavTab] = useState('components')

  // ---- Data ----
  const [components, setComponents]                     = useState([])
  const [suppliers, setSuppliers]                       = useState([])
  const [products, setProducts]                         = useState([])
  const [productComponentsMap, setProductComponentsMap] = useState({})
  const [jobs, setJobs]                                 = useState([])
  const [loading, setLoading]                           = useState(true)

  // ---- UI state ----
  const [currentProduct, setCurrentProduct]   = useState(null)
  const [currentJob, setCurrentJob]           = useState(null)
  const [currentWindow, setCurrentWindow]     = useState(null)
  const [currentSupplier, setCurrentSupplier] = useState(null)

  const [compModalOpen, setCompModalOpen]         = useState(false)
  const [editingComp, setEditingComp]             = useState(null)
  const [compSaving, setCompSaving]               = useState(false)

  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier]     = useState(null)
  const [supplierSaving, setSupplierSaving]       = useState(false)

  const [prodSaving, setProdSaving]               = useState(false)
  const [addWindowOpen, setAddWindowOpen]         = useState(false)

  // ---- Stock state ----
  const [stockRows, setStockRows]                 = useState([])
  const [stockBars, setStockBars]                 = useState([])
  const [stockMap, setStockMap]                   = useState({})

  const [stockEditOpen, setStockEditOpen]         = useState(false)
  const [stockEditComp, setStockEditComp]         = useState(null)
  const [stockEditColour, setStockEditColour]     = useState(null)
  const [stockEditRow, setStockEditRow]           = useState(null)
  const [stockSaving, setStockSaving]             = useState(false)

  const [barModalOpen, setBarModalOpen]           = useState(false)
  const [barModalComp, setBarModalComp]           = useState(null)
  const [barModalColour, setBarModalColour]       = useState(null)
  const [editingBar, setEditingBar]               = useState(null)

  const [receiveBarsOpen, setReceiveBarsOpen]     = useState(false)
  const [receiveBarsComp, setReceiveBarsComp]     = useState(null)
  const [receiveBarsColour, setReceiveBarsColour] = useState(null)
  const [receiveBarsStock, setReceiveBarsStock]   = useState(null)

  const [deductOpen, setDeductOpen]               = useState(false)
  const [deductSaving, setDeductSaving]           = useState(false)
  const [jobMovements, setJobMovements]           = useState([])

  const { toasts, showToast } = useToast()

  // Pre-compute current job's BOM summary for the deduct stock modal
  const currentJobSummary = useMemo(() => {
    if (!currentJob) return []
    const windowsWithBOM = (currentJob.windows || []).map(win => ({
      ...win,
      bom: calcWindowBOM(productComponentsMap[win.product_id] || [], Number(win.width_mm), Number(win.drop_mm))
    }))
    return calcJobSummary(windowsWithBOM)
  }, [currentJob, productComponentsMap])

  // ==== LOAD ALL DATA ====

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [compRes, suppRes, prodRes, pcRes, jobRes, stockRes, barsRes] = await Promise.all([
      supabase.from('components').select('*').order('name'),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('products').select('*').order('name'),
      supabase.from('product_components').select('*, component:components(*)').order('sort_order'),
      supabase.from('mfg_jobs').select('*, mfg_windows(*)').order('created_at', { ascending: false }),
      supabase.from('stock').select('*'),
      supabase.from('stock_bars').select('*').eq('status', 'available').order('created_at'),
    ])

    if (compRes.error) showToast('Failed to load components', 'error')
    else setComponents(compRes.data)

    if (suppRes.error) showToast('Failed to load suppliers', 'error')
    else setSuppliers(suppRes.data)

    if (!prodRes.error && !pcRes.error) {
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

    if (!stockRes.error) {
      setStockRows(stockRes.data || [])
      setStockMap(buildStockMap(stockRes.data || []))
    }
    if (!barsRes.error) {
      setStockBars(barsRes.data || [])
    }

    if (!jobRes.error) {
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

  // ==== SUPPLIERS ====

  const handleSupplierSave = async (formData) => {
    setSupplierSaving(true)
    const payload = {
      name:         formData.name.trim(),
      contact_name: formData.contact_name?.trim() || null,
      email:        formData.email?.trim() || null,
      phone:        formData.phone?.trim() || null,
      website:      formData.website?.trim() || null,
      discount:     Number(formData.discount) || 0,
      notes:        formData.notes?.trim() || null,
    }
    const result = editingSupplier
      ? await supabase.from('suppliers').update(payload).eq('id', editingSupplier.id)
      : await supabase.from('suppliers').insert(payload)
    if (result.error) {
      showToast(result.error.message || 'Save failed', 'error')
    } else {
      showToast(editingSupplier ? 'Supplier updated ✓' : 'Supplier added ✓', 'success')
      setSupplierModalOpen(false)
      setEditingSupplier(null)
      // If we were viewing this supplier, update it
      if (currentSupplier && editingSupplier?.id === currentSupplier.id) {
        setCurrentSupplier({ ...currentSupplier, ...payload })
      }
      await loadAll()
    }
    setSupplierSaving(false)
  }

  const handleSupplierDelete = async (id) => {
    const s = suppliers.find(x => x.id === id)
    if (!window.confirm(`Delete "${s?.name}"? Components linked to this supplier will be unlinked.`)) return
    const { error } = await supabase.from('suppliers').delete().eq('id', id)
    if (error) showToast('Delete failed', 'error')
    else {
      showToast('Supplier deleted')
      setSupplierModalOpen(false)
      setEditingSupplier(null)
      setCurrentSupplier(null)
      await loadAll()
    }
  }

  // ==== COMPONENTS ====

  const handleCompSave = async (formData) => {
    setCompSaving(true)
    const payload = {
      name:             formData.name.trim(),
      unit:             formData.unit,
      unit_cost:        Number(formData.unit_cost) || 0,
      discount:         Number(formData.discount) || 0,
      supplier_id:      formData.supplier_id || null,
      // Keep legacy supplier text field in sync with selected supplier name
      supplier:         formData.supplier_id
        ? (suppliers.find(s => s.id === formData.supplier_id)?.name || null)
        : (formData.supplier?.trim() || null),
      supplier_pn:      formData.supplier_pn?.trim() || null,
      notes:            formData.notes?.trim() || null,
      colour_variants:  formData.colour_variants || [],
      order_type:       formData.order_type || 'pack',
      pack_price:       Number(formData.pack_price) || 0,
      pack_qty:         Number(formData.pack_qty) || 1,
      bar_length_mm:    Number(formData.bar_length_mm) || 6000,
      bar_price:        Number(formData.bar_price) || 0,
    }
    const result = editingComp?.id
      ? await supabase.from('components').update(payload).eq('id', editingComp.id)
      : await supabase.from('components').insert(payload)
    if (result.error) {
      showToast(result.error.message || 'Save failed', 'error')
    } else {
      showToast(editingComp?.id ? 'Component updated ✓' : 'Component added ✓', 'success')
      setCompModalOpen(false)
      setEditingComp(null)
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
    const deletedId = currentProduct.id
    await supabase.from('products').delete().eq('id', deletedId)
    // Update local state immediately — don't call loadAll() which can race with the delete
    setProducts(prev => prev.filter(p => p.id !== deletedId))
    setProductComponentsMap(prev => {
      const next = { ...prev }
      delete next[deletedId]
      return next
    })
    setCurrentProduct(null)
    showToast('Product deleted')
  }

  const handleDuplicate = async (newName) => {
    setProdSaving(true)
    const { data: newProd, error: pe } = await supabase
      .from('products')
      .insert({ name: newName, category: currentProduct.category, notes: currentProduct.notes })
      .select().single()
    if (pe) { showToast('Duplicate failed', 'error'); setProdSaving(false); return }

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
      formula_interval:  Number(formData.formula_interval) || 500,
      colour_variant:    formData.colour_variant || null,
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
        job_id:       currentJob.id,
        product_id:   winData.product_id,
        label:        winData.label,
        width_mm:     Number(winData.width_mm),
        drop_mm:      Number(winData.drop_mm),
        sort_order:   sortOrder,
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

  // ==== STOCK ====

  const handleOpenStockEdit = (component, colourVariant, stock) => {
    setStockEditComp(component)
    setStockEditColour(colourVariant)
    setStockEditRow(stock)
    setStockEditOpen(true)
  }

  const handleSaveStock = async ({ qty_on_hand, qty_minimum }) => {
    setStockSaving(true)
    const key = stockKey(stockEditComp.id, stockEditColour)
    if (stockEditRow?.id) {
      await supabase.from('stock').update({ qty_on_hand, qty_minimum }).eq('id', stockEditRow.id)
    } else {
      await supabase.from('stock').insert({
        component_id:   stockEditComp.id,
        colour_variant: stockEditColour || null,
        qty_on_hand,
        qty_minimum,
      })
    }
    showToast('Stock updated ✓', 'success')
    setStockEditOpen(false)
    await loadAll()
    setStockSaving(false)
  }

  const handleReceiveBars = (component, colourVariant, stock) => {
    setReceiveBarsComp(component)
    setReceiveBarsColour(colourVariant)
    setReceiveBarsStock(stock)
    setReceiveBarsOpen(true)
  }

  const handleSaveReceiveBars = async (qty) => {
    setStockSaving(true)
    const key = stockKey(receiveBarsComp.id, receiveBarsColour)
    const currentQty = Number(receiveBarsStock?.qty_on_hand) || 0
    const newQty = currentQty + qty
    if (receiveBarsStock?.id) {
      await supabase.from('stock').update({ qty_on_hand: newQty }).eq('id', receiveBarsStock.id)
    } else {
      await supabase.from('stock').insert({
        component_id:   receiveBarsComp.id,
        colour_variant: receiveBarsColour || null,
        qty_on_hand:    newQty,
        qty_minimum:    0,
      })
    }
    // Record movement
    await supabase.from('stock_movements').insert({
      component_id:   receiveBarsComp.id,
      colour_variant: receiveBarsColour || null,
      movement_type:  'receive',
      qty:            qty,
      notes:          `Received ${qty} bar${qty !== 1 ? 's' : ''}`,
    })
    showToast(`${qty} bar${qty !== 1 ? 's' : ''} received ✓`, 'success')
    setReceiveBarsOpen(false)
    await loadAll()
    setStockSaving(false)
  }

  const handleAddBar = (component, colourVariant) => {
    setBarModalComp(component)
    setBarModalColour(colourVariant)
    setEditingBar(null)
    setBarModalOpen(true)
  }

  const handleEditBar = (bar) => {
    const comp = components.find(c => c.id === bar.component_id)
    setBarModalComp(comp)
    setBarModalColour(bar.colour_variant)
    setEditingBar(bar)
    setBarModalOpen(true)
  }

  const handleSaveBar = async (formData) => {
    setStockSaving(true)
    if (editingBar) {
      await supabase.from('stock_bars').update({
        label: formData.label,
        length_mm: formData.length_mm,
      }).eq('id', editingBar.id)
      showToast('Bar updated ✓', 'success')
    } else {
      await supabase.from('stock_bars').insert({
        component_id:   barModalComp.id,
        colour_variant: barModalColour || null,
        label:          formData.label,
        length_mm:      formData.length_mm,
        status:         'available',
      })
      showToast('Bar added to stock ✓', 'success')
    }
    setBarModalOpen(false)
    await loadAll()
    setStockSaving(false)
  }

  const handleDeleteBar = async (barId) => {
    if (!window.confirm('Remove this bar from stock?')) return
    await supabase.from('stock_bars').delete().eq('id', barId)
    showToast('Bar removed')
    setBarModalOpen(false)
    await loadAll()
  }

  const loadJobMovements = useCallback(async (jobId) => {
    const { data } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('job_id', jobId)
      .eq('movement_type', 'deduct')
    setJobMovements(data || [])
  }, [])

  const handleOpenDeductModal = () => {
    if (currentJob) loadJobMovements(currentJob.id)
    setDeductOpen(true)
  }

  // Deduct stock line by line after job confirmation
  const handleDeductStock = async (deductions) => {
    setDeductSaving(true)
    const movements     = []
    const stockUpdates  = []
    const barUpdates    = []
    const offcutInserts = []

    for (const d of deductions) {
      const key   = stockKey(d.component.id, d.colour_variant)
      const stock = stockMap[key]

      // Record movement
      movements.push({
        component_id:   d.component.id,
        colour_variant: d.colour_variant || null,
        job_id:         currentJob.id,
        movement_type:  'deduct',
        qty:            -d.qty,
      })

      // Update pack stock qty
      if (stock?.id && d.component.order_type !== 'bar') {
        stockUpdates.push({ id: stock.id, qty: (stock.qty_on_hand || 0) - d.qty })
      }

      // Handle bar components — may require multiple bars (one per bin)
      if (d.component.order_type === 'bar') {
        const bars = d.bars || [{ bar_id: d.bar_id, offcut: null }]
        const s    = stockMap[stockKey(d.component.id, d.colour_variant)]
        let fullBarsUsed = 0
        for (const bar of bars) {
          if (bar.bar_id && bar.bar_id !== '__full_bar__') {
            barUpdates.push(bar.bar_id)
          } else {
            fullBarsUsed++
          }
          if (bar.offcut) {
            offcutInserts.push({
              component_id:   d.component.id,
              colour_variant: d.colour_variant || null,
              label:          bar.offcut.label,
              length_mm:      Math.round(bar.offcut.length_mm),
              status:         'available',
            })
          }
        }
        if (fullBarsUsed > 0 && s?.id) {
          stockUpdates.push({ id: s.id, qty: (s.qty_on_hand || 0) - fullBarsUsed })
        }
      }
    }

    // Execute all updates
    await Promise.all([
      movements.length > 0
        ? supabase.from('stock_movements').insert(movements)
        : Promise.resolve(),
      ...stockUpdates.map(u =>
        supabase.from('stock').update({ qty_on_hand: u.qty }).eq('id', u.id)
      ),
      ...barUpdates.map(id =>
        supabase.from('stock_bars').update({ status: 'used', job_id: currentJob.id }).eq('id', id)
      ),
    ])

    // Check for low stock and auto-generate PO if needed
    await checkAndGeneratePOs(deductions)

    if (offcutInserts.length > 0) {
      await supabase.from('stock_bars').insert(offcutInserts)
    }

    showToast('Stock deducted ✓', 'success')
    setDeductOpen(false)
    await Promise.all([loadAll(), loadJobMovements(currentJob.id)])
    setDeductSaving(false)
  }

  // Auto-generate draft POs for components that fall below minimum after deduction
  const checkAndGeneratePOs = async (deductions) => {
    const alerts = []
    for (const d of deductions) {
      const key   = stockKey(d.component.id, d.colour_variant)
      const stock = stockMap[key]
      if (!stock) continue
      const qtyAfter = (stock.qty_on_hand || 0) - d.qty
      if (qtyAfter < (stock.qty_minimum || 0)) {
        alerts.push({ component: d.component, colour_variant: d.colour_variant, stock })
      }
    }
    if (alerts.length === 0) return

    // Group by supplier
    const bySupplier = {}
    alerts.forEach(a => {
      const suppId = a.component.supplier_id || 'unknown'
      if (!bySupplier[suppId]) bySupplier[suppId] = []
      bySupplier[suppId].push(a)
    })

    // Create one draft PO per supplier
    for (const [suppId, items] of Object.entries(bySupplier)) {
      const { data: po } = await supabase.from('purchase_orders').insert({
        supplier_id: suppId === 'unknown' ? null : suppId,
        status: 'draft',
        notes: `Auto-generated — low stock after job ${currentJob.job_number || currentJob.id}`,
      }).select().single()

      if (po) {
        await supabase.from('purchase_order_lines').insert(
          items.map(item => ({
            po_id:          po.id,
            component_id:   item.component.id,
            colour_variant: item.colour_variant || null,
            qty_ordered:    0, // flagged — qty to be set manually
            unit_cost:      item.component.unit_cost || 0,
          }))
        )
      }
    }

    showToast(`⚠️ ${alerts.length} component${alerts.length !== 1 ? 's' : ''} below minimum — draft PO created`, 'success')
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
      const win     = currentWindow.win
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
          onDeductStock={handleOpenDeductModal}
        />
      )
    }

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
          suppliers={suppliers}
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

    if (navTab === 'products') {
      return <ProductList products={products} onOpen={setCurrentProduct} onNew={handleNewProduct} />
    }

    // Supplier detail
    if (navTab === 'suppliers' && currentSupplier) {
      return (
        <SupplierDetail
          supplier={currentSupplier}
          components={components}
          onBack={() => setCurrentSupplier(null)}
          onEdit={() => { setEditingSupplier(currentSupplier); setSupplierModalOpen(true) }}
          onEditComponent={(c) => { setEditingComp(c); setCompModalOpen(true) }}
          onAddComponent={() => {
            // Pre-fill supplier_id so the new component is linked to this supplier
            setEditingComp({ supplier_id: currentSupplier.id, discount: currentSupplier.discount || 0 })
            setCompModalOpen(true)
          }}
        />
      )
    }

    if (navTab === 'suppliers') {
      return (
        <SupplierList
          suppliers={suppliers}
          components={components}
          onOpen={setCurrentSupplier}
          onNew={() => { setEditingSupplier(null); setSupplierModalOpen(true) }}
        />
      )
    }

    // Stock
    if (navTab === 'stock') {
      return (
        <StockPage
          components={components}
          stockMap={stockMap}
          stockBars={stockBars}
          onEditStock={handleOpenStockEdit}
          onReceiveBars={handleReceiveBars}
          onAddOffcut={handleAddBar}
          onEditOffcut={handleEditBar}
        />
      )
    }

    // Component library
    return (
      <ComponentLibrary
        components={components}
        suppliers={suppliers}
        onEdit={(c) => { setEditingComp(c); setCompModalOpen(true) }}
        onAdd={() => { setEditingComp(null); setCompModalOpen(true) }}
      />
    )
  }

  // Hide bottom nav when drilling into details
  const showBottomNav = !currentProduct && !currentJob && !currentWindow && !currentSupplier

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
              <span style={{ fontSize: 20 }}>{tab.emoji}</span>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      )}

      <ComponentModal
        open={compModalOpen}
        component={editingComp}
        suppliers={suppliers}
        onClose={() => { setCompModalOpen(false); setEditingComp(null) }}
        onSave={handleCompSave}
        onDelete={handleCompDelete}
        saving={compSaving}
      />

      <SupplierModal
        open={supplierModalOpen}
        supplier={editingSupplier}
        onClose={() => { setSupplierModalOpen(false); setEditingSupplier(null) }}
        onSave={handleSupplierSave}
        onDelete={handleSupplierDelete}
        saving={supplierSaving}
      />

      <AddWindowModal
        open={addWindowOpen}
        windowNumber={(currentJob?.windows || []).length + 1}
        products={products}
        onClose={() => setAddWindowOpen(false)}
        onAdd={handleAddWindow}
      />

      <StockEditModal
        open={stockEditOpen}
        component={stockEditComp}
        colourVariant={stockEditColour}
        stock={stockEditRow}
        onClose={() => setStockEditOpen(false)}
        onSave={handleSaveStock}
        saving={stockSaving}
      />

      <ReceiveBarsModal
        open={receiveBarsOpen}
        component={receiveBarsComp}
        colourVariant={receiveBarsColour}
        stock={receiveBarsStock}
        onClose={() => setReceiveBarsOpen(false)}
        onSave={handleSaveReceiveBars}
        saving={stockSaving}
      />

      <BarModal
        open={barModalOpen}
        bar={editingBar}
        component={barModalComp}
        colourVariant={barModalColour}
        onClose={() => setBarModalOpen(false)}
        onSave={handleSaveBar}
        onDelete={handleDeleteBar}
        saving={stockSaving}
      />

      {currentJob && (
        <DeductStockModal
          open={deductOpen}
          job={currentJob}
          jobSummary={currentJobSummary}
          jobMovements={jobMovements}
          stockMap={stockMap}
          stockBars={stockBars}
          onClose={() => setDeductOpen(false)}
          onDeduct={handleDeductStock}
          saving={deductSaving}
        />
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}