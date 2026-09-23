import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from './lib/supabase'

import ComponentLibrary from './pages/ComponentLibrary'
import StockPage        from './pages/StockPage'
import ProductList       from './pages/ProductList'
import ProductDetail     from './pages/ProductDetail'
import OptionsAdmin      from './pages/OptionsAdmin'
import AdminHome              from './pages/AdminHome'
import FabricCategoriesAdmin  from './pages/FabricCategoriesAdmin'
import ComponentKindsAdmin     from './pages/ComponentKindsAdmin'
import TrackPO                 from './pages/TrackPO'
import DeletedRecordsAdmin     from './pages/DeletedRecordsAdmin'
import DeleteJobModal          from './components/DeleteJobModal'
import BackToReceivedModal     from './components/BackToReceivedModal'
import JobList           from './pages/JobList'
import JobDetail         from './pages/JobDetail'
import WindowDetail      from './pages/WindowDetail'
import SupplierList      from './pages/SupplierList'
import SupplierDetail    from './pages/SupplierDetail'
import PurchaseOrderList   from './pages/PurchaseOrderList'
import PurchaseOrderDetail from './pages/PurchaseOrderDetail'

import ComponentModal        from './components/ComponentModal'
import StockEditModal        from './components/StockEditModal'
import BarModal              from './components/BarModal'
import ReceiveBarsModal      from './components/ReceiveBarsModal'
import DeductStockModal      from './components/DeductStockModal'
import RecordOffcutsModal    from './components/RecordOffcutsModal'
import StocktakeModal        from './components/StocktakeModal'
import AddToPOModal          from './components/AddToPOModal'
import ReceivePOModal        from './components/ReceivePOModal'
import CompanyDetailsAdmin   from './pages/CompanyDetailsAdmin'
import SupplierModal         from './components/SupplierModal'
import AddWindowModal        from './components/AddWindowModal'
import PurchaseOrderModal    from './components/PurchaseOrderModal'
import AddPOLinesModal       from './components/AddPOLinesModal'

import { useToast, ToastContainer } from './hooks/useToast.jsx'
import { buildStockMap, stockKey, getStock, planStockRestore, stockPositions } from './lib/stockEngine'
import { calcJobSummary, buildWindowBOM, buildPriceSnapshot, buildQtySnapshot, fabricSelectionFor, substitutionsFor, applyFabricNesting, buildJobExtraLines, resolveAnswers } from './lib/bomEngine'
import { windowSell } from './lib/sellEngine'
import { orderUnitInfo, openPOFor, poDisplayNumber, outstandingQty, isFullyReceived, receivedToStockQty } from './lib/poEngine'
import { exportPurchaseOrderPDF } from './lib/exportPOPdf'
import { exportPurchaseOrderXLSX } from './lib/exportPO'
import { exportProductPricingXLSX } from './lib/exportPricing'
import './index.css'

const NAV_TABS = [
  { id: 'components', label: 'Components', emoji: '📦' },
  { id: 'suppliers',  label: 'Suppliers',  emoji: '🏭' },
  { id: 'products',   label: 'Products',   emoji: '🔩' },
  { id: 'bom',        label: 'Jobs',       emoji: '📋' },
  { id: 'stock',      label: 'Stock',      emoji: '🏪' },
  { id: 'orders',     label: 'Orders',     emoji: '🧾' },
  // Not a tab — a way out. Takes the slot Admin left when it moved to /admin.
  { id: 'home',       label: 'Home',       emoji: '🏠', href: '/' },
]

export default function App({ route = 'manufacturing' }) {
  const [navTab, setNavTab] = useState(route === 'admin' ? 'admin' : 'components')

  // ---- Data ----
  const [components, setComponents]                     = useState([])
  const [suppliers, setSuppliers]                       = useState([])
  const [products, setProducts]                         = useState([])
  const [productComponentsMap, setProductComponentsMap] = useState({})
  const [productOptions, setProductOptions]             = useState({ track: [], blind: [] })
  const [jobs, setJobs]                                 = useState([])
  const [widthSchedules, setWidthSchedules]             = useState([])
  const [fabricCategories, setFabricCategories]         = useState([])
  const [loading, setLoading]                           = useState(true)
  const [poUploading, setPoUploading]                   = useState(false)

  // ---- UI state ----
  const [currentProduct, setCurrentProduct]   = useState(null)
  const [currentJob, setCurrentJob]           = useState(null)
  const [currentWindow, setCurrentWindow]     = useState(null)
  const [currentSupplier, setCurrentSupplier] = useState(null)
  const [currentPO, setCurrentPO]             = useState(null)
  const [adminSection, setAdminSection]       = useState(null) // 'options' | 'fabric_categories' | 'component_kinds' | null
  const [componentKinds, setComponentKinds]   = useState([])
  // null until we know — distinguishes "no deletes yet" from "table not created"
  const [deletedRecords, setDeletedRecords]   = useState(null)
  const [restoringId, setRestoringId]         = useState(null)
  const [deleteJobPlan, setDeleteJobPlan]     = useState(null)  // { job, plan } | null
  const [deletingJob, setDeletingJob]         = useState(false)
  const [revertPlan, setRevertPlan]           = useState(null)   // { job, plan } | null
  const [reverting, setReverting]             = useState(false)

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

  const [companyDetails, setCompanyDetails]       = useState({})
  const [receivePOOpen, setReceivePOOpen]         = useState(false)
  const [receiving, setReceiving]                 = useState(false)
  const [addToPOOpen, setAddToPOOpen]             = useState(false)
  const [addToPOComp, setAddToPOComp]             = useState(null)
  const [addToPOColour, setAddToPOColour]         = useState(null)
  const [stocktakeOpen, setStocktakeOpen]         = useState(false)
  const [stocktakeComp, setStocktakeComp]         = useState(null)
  const [stocktakeColour, setStocktakeColour]     = useState(null)
  const [stocktakeStock, setStocktakeStock]       = useState(null)
  const [receiveBarsOpen, setReceiveBarsOpen]     = useState(false)
  const [receiveBarsComp, setReceiveBarsComp]     = useState(null)
  const [receiveBarsColour, setReceiveBarsColour] = useState(null)
  const [receiveBarsStock, setReceiveBarsStock]   = useState(null)

  const [deductOpen, setDeductOpen]               = useState(false)
  const [deductSaving, setDeductSaving]           = useState(false)
  const [recordOffcutsOpen, setRecordOffcutsOpen] = useState(false)
  const [jobMovements, setJobMovements]           = useState([])

  // ---- Purchase order state ----
  const [purchaseOrders, setPurchaseOrders]       = useState([])
  const [poLinesMap, setPoLinesMap]               = useState({})
  const [poModalOpen, setPoModalOpen]             = useState(false)
  const [poCreating, setPoCreating]               = useState(false)
  const [addLinesOpen, setAddLinesOpen]           = useState(false)
  const [addingLines, setAddingLines]             = useState(false)
  const [poExporting, setPoExporting]             = useState(false)
  const [pricingExporting, setPricingExporting]   = useState(false)

  const { toasts, showToast } = useToast()

  /**
   * The kinds a component may be given, as { name, default_order_type }.
   *
   * The managed vocabulary is the list. Anything a component already carries
   * that isn't in it rides along too, so the field still works before
   * supabase_component_kinds_table.sql is run, and a kind deleted out from
   * under a component never makes that component unsavable.
   */
  const kindOptions = useMemo(() => {
    const byName = new Map(componentKinds.map(k => [k.name, k]))
    components.forEach(c => {
      if (c.kind && !byName.has(c.kind)) byName.set(c.kind, { name: c.kind, default_order_type: null })
    })
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [componentKinds, components])

  // The option definitions that apply to a product, via its type. Recipe
  // resolution needs these to know which option lines a window has answered.
  const optionDefsFor = useCallback((productId) => {
    const product = products.find(p => p.id === productId)
    return productOptions[product?.product_type] || []
  }, [products, productOptions])

  /**
   * A job's windows with their BOMs, fabric re-quantified against the roll
   * layout the whole job nests into.
   *
   * `useSnapshot` picks the basis: a confirmed job's frozen prices and
   * quantities, or live recipes. Both are needed — the job's own screens show
   * what it was confirmed at, while confirming a job has to cost it fresh.
   */
  const buildJobWindows = useCallback((job, useSnapshot) => {
    if (!job) return []
    return applyFabricNesting((job.windows || []).map(win => ({
      ...win,
      bom: buildWindowBOM(
        productComponentsMap[win.product_id] || [], win,
        optionDefsFor(win.product_id),
        useSnapshot ? (job.price_snapshot || null) : null,
        useSnapshot ? (job.qty_snapshot?.[win.id] || null) : null,
        fabricSelectionFor(win, products.find(p => p.id === win.product_id), components),
        substitutionsFor(job, win, components),
        components,
      )
    })))
  }, [productComponentsMap, optionDefsFor, products, components])

  // Pre-compute current job's BOM summary for the deduct stock modal.
  // Job-level extras are in it: they are picked and taken out of stock like
  // anything else, and leaving them out would deduct short every time.
  const currentJobSummary = useMemo(
    () => calcJobSummary(
      buildJobWindows(currentJob, true),
      buildJobExtraLines(currentJob, components, currentJob?.price_snapshot || null)),
    [currentJob, buildJobWindows, components])

  // Nested fabric metres per window on the LIVE basis, for the single-window
  // page — which prices live, so a frozen quantity there would sit beside live
  // rates and belong to neither. Keyed by window id.
  const liveNestedFabricQty = useMemo(() => {
    const out = {}
    buildJobWindows(currentJob, false).forEach(w => {
      const line = (w.bom || []).find(l => l.fabric_cut)
      if (line) out[w.id] = line.calculated_qty
    })
    return out
  }, [currentJob, buildJobWindows])

  // Superseded products stay in `products` so historical jobs can still name
  // the product they were built against — but they must never be pickable.
  const activeProducts = useMemo(() => products.filter(p => !p.archived), [products])

  // How many products use each component — so deleting one shows what it affects
  const componentUsage = useMemo(() => {
    const map = {}
    Object.entries(productComponentsMap).forEach(([productId, lines]) => {
      const product = products.find(p => p.id === productId)
      lines.forEach(pc => {
        if (!map[pc.component_id]) map[pc.component_id] = []
        const name = product?.name || 'Unknown product'
        if (!map[pc.component_id].includes(name)) map[pc.component_id].push(name)
      })
    })
    return map
  }, [productComponentsMap, products])

  // ==== LOAD ALL DATA ====

  // Only the very first load shows the full-page spinner. Every mutation
  // handler calls loadAll() again afterwards to refetch — that must not
  // unmount the tree, or it silently closes whatever modal triggered it
  // (state like an open ProductDetail edit modal lives below App).
  const hasLoadedRef = useRef(false)

  const loadAll = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true)
    const [compRes, suppRes, prodRes, pcRes, jobRes, stockRes, barsRes, wsRes, poRes, poLinesRes, optRes, fcRes, ckRes, delRes, cdRes] = await Promise.all([
      supabase.from('components').select('*').order('name'),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('products').select('*').order('name'),
      supabase.from('product_components').select('*, component:components(*)').order('sort_order'),
      supabase.from('mfg_jobs').select('*, mfg_windows(*)').order('created_at', { ascending: false }),
      supabase.from('stock').select('*'),
      supabase.from('stock_bars').select('*').eq('status', 'available').order('created_at'),
      supabase.from('width_schedules').select('*').order('name'),
      supabase.from('purchase_orders').select('*, supplier:suppliers(*)').order('created_at', { ascending: false }),
      supabase.from('purchase_order_lines').select('*, component:components(*)').order('created_at'),
      supabase.from('product_options').select('*, choices:product_option_choices(*)').order('sort_order'),
      supabase.from('fabric_categories').select('*').order('code'),
      supabase.from('component_kinds').select('*').order('sort_order'),
      supabase.from('deleted_records').select('*').order('deleted_at', { ascending: false }),
      supabase.from('company_details').select('*').eq('id', 1).maybeSingle(),
    ])

    const schedules = wsRes.error ? [] : (wsRes.data || [])
    if (!wsRes.error) setWidthSchedules(schedules)

    if (!fcRes.error) setFabricCategories(fcRes.data || [])

    // Missing until supabase_component_kinds_table.sql is run; the library and
    // the component editor both fall back to whatever kinds the components
    // themselves already carry, so nothing breaks in the meantime.
    if (!ckRes.error) setComponentKinds(ckRes.data || [])

    // Missing until supabase_po_receiving.sql is run. An empty object just
    // means a PDF with a shorter letterhead, so nothing breaks meanwhile.
    if (!cdRes.error && cdRes.data) setCompanyDetails(cdRes.data)

    // Left null when the table isn't there, so the admin screen can say
    // "not switched on yet" rather than the far worse "nothing was deleted".
    setDeletedRecords(delRes.error ? null : (delRes.data || []))

    // Option definitions, keyed by product type, each with its choices sorted.
    // Recipe resolution needs these — without them a product's option lines
    // can't be matched to a window's answers.
    if (optRes.error) showToast('Failed to load product options', 'error')
    else {
      const byType = { track: [], blind: [] }
      ;(optRes.data || []).forEach(o => {
        const opt = { ...o, choices: (o.choices || []).slice().sort((a, b) => a.sort_order - b.sort_order) }
        if (byType[o.product_type]) byType[o.product_type].push(opt)
      })
      setProductOptions(byType)
    }

    if (compRes.error) showToast('Failed to load components', 'error')
    else setComponents(compRes.data)

    if (suppRes.error) showToast('Failed to load suppliers', 'error')
    else setSuppliers(suppRes.data)

    if (!prodRes.error && !pcRes.error) {
      // Resolve each line's linked width schedule into width_qty so the BOM
      // engine reads one shape, and editing a schedule updates every product
      // that points at it.
      const scheduleById = Object.fromEntries(schedules.map(s => [s.id, s]))
      const pcData = (pcRes.data || []).map(pc => pc.width_schedule_id
        ? { ...pc, width_qty: scheduleById[pc.width_schedule_id]?.qty_map || {} }
        : pc)
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
          .map(w => ({ ...w, bom_overrides: w.bom_overrides || {}, substitutions: w.substitutions || {}, extra_lines: w.extra_lines || [] }))
      })))
    }

    if (poRes.error) showToast('Failed to load purchase orders', 'error')
    else setPurchaseOrders(poRes.data || [])

    if (!poLinesRes.error) {
      const map = {}
      ;(poLinesRes.data || []).forEach(l => {
        if (!map[l.po_id]) map[l.po_id] = []
        map[l.po_id].push(l)
      })
      setPoLinesMap(map)
    }

    setLoading(false)
    hasLoadedRef.current = true
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const backfilledRef = useRef(false)

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
      kind:             formData.kind?.trim() || null,
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
      fabric_code:      formData.fabric_code?.trim() || null,
      roll_widths:      Array.isArray(formData.roll_widths) && formData.roll_widths.length ? formData.roll_widths : null,
      fabric_category:  formData.fabric_category?.trim() || null,
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
    const comp  = components.find(c => c.id === id)
    const usedIn = componentUsage[id] || []
    const warning = usedIn.length > 0
      ? `Delete "${comp?.name}"?\n\nIt will be removed from ${usedIn.length} product recipe${usedIn.length !== 1 ? 's' : ''}:\n· ${usedIn.join('\n· ')}\n\nThis cannot be undone.`
      : `Delete "${comp?.name}"?\n\nIt isn't used by any product.\n\nThis cannot be undone.`
    if (!window.confirm(warning)) return
    const { error } = await supabase.from('components').delete().eq('id', id)
    if (error) showToast('Delete failed — component may be used in a product', 'error')
    else { showToast('Deleted', 'success'); setCompModalOpen(false); setEditingComp(null); await loadAll() }
  }

  // ==== PRODUCTS ====

  const handleNewProduct = async (productType = 'track') => {
    const { data, error } = await supabase
      .from('products')
      .insert({
        name:         productType === 'blind' ? 'New fabric category' : 'New track',
        category:     productType,
        product_type: productType,
      })
      .select().single()
    if (error) { showToast('Failed to create product', 'error'); return }
    await loadAll()
    setCurrentProduct({ ...data, component_count: 0 })
  }

  const handleProductUpdate = async (updates) => {
    const updated = { ...currentProduct, ...updates }
    setCurrentProduct(updated)
    // Keep the list in step too — without this the product page shows the new
    // name while every other screen still reads the old one, which looks
    // exactly like the save having failed.
    setProducts(prev => prev.map(p => (p.id === updated.id ? { ...p, ...updates } : p)))
    const { error } = await supabase.from('products').update(updates).eq('id', currentProduct.id)
    if (error) showToast('Failed to save product', 'error')
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
      .insert({
        name:            newName,
        category:        currentProduct.category,
        // NOT NULL in the schema — omitting it made every duplicate fail.
        product_type:    currentProduct.product_type || currentProduct.category || 'track',
        notes:           currentProduct.notes,
        markup:          currentProduct.markup ?? 1.6,
        fabric_category: currentProduct.fabric_category || null,
        market_matrix:   currentProduct.market_matrix || null,
      })
      .select().single()
    if (pe) { showToast(pe.message || 'Duplicate failed', 'error'); setProdSaving(false); return }

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
        width_schedule_id: pc.width_schedule_id || null,
        colour_variant:    pc.colour_variant || null,
        option_choice_id:  pc.option_choice_id || null,
        group_key:         pc.group_key || null,
        active_min_width:  pc.active_min_width ?? null,
        active_max_width:  pc.active_max_width ?? null,
        active_min_drop:   pc.active_min_drop ?? null,
        active_max_drop:   pc.active_max_drop ?? null,
        // drop_limit / drop_limit_mode are NOT included: the migration that
        // adds them (supabase_drop_limits.sql) hasn't been run against this
        // database yet, and PostgREST rejects inserts naming unknown
        // columns — including them here silently dropped every recipe line.
        // Re-add once that migration has been applied.
        sort_order:        pc.sort_order,
      }))
      const { error: ce } = await supabase.from('product_components').insert(copies)
      if (ce) {
        showToast(ce.message || 'Copied the product, but not its recipe', 'error')
        await loadAll(); setProdSaving(false); return
      }
    }

    showToast(`"${newName}" created ✓`, 'success')
    await loadAll()
    setProdSaving(false)
  }

  // ==== WIDTH SCHEDULES ====
  // Named qty-per-width profiles (Standard / Heavy curtain / …) shared by
  // recipe lines. Linked, not copied — editing one updates every product.

  const handleSaveWidthSchedule = async ({ id, name, qty_map }) => {
    const payload = { name: name.trim(), qty_map: qty_map || {} }
    const result = id
      ? await supabase.from('width_schedules').update(payload).eq('id', id).select().single()
      : await supabase.from('width_schedules').insert(payload).select().single()
    if (result.error) {
      showToast(result.error.message || 'Failed to save schedule', 'error')
      return null
    }
    showToast(id ? 'Schedule updated ✓' : 'Schedule created ✓', 'success')
    await loadAll()
    return result.data
  }

  const handleDeleteWidthSchedule = async (id) => {
    const s = widthSchedules.find(x => x.id === id)
    const inUse = Object.values(productComponentsMap)
      .flat().filter(pc => pc.width_schedule_id === id).length
    const msg = inUse > 0
      ? `Delete "${s?.name}"?\n\nIt's used by ${inUse} product recipe line${inUse !== 1 ? 's' : ''}, which will fall back to zero quantities until you pick another schedule.`
      : `Delete "${s?.name}"?`
    if (!window.confirm(msg)) return
    const { error } = await supabase.from('width_schedules').delete().eq('id', id)
    if (error) showToast('Delete failed', 'error')
    else { showToast('Schedule deleted'); await loadAll() }
  }

  // ==== FABRIC PRICING CATEGORIES ====
  // A category is now the tier the WHOLESALER sells a fabric under, and it
  // carries their width × drop price list. Grids arrive by upload rather than
  // by hand: eleven grids of 121 cells is 1,331 chances to type a price wrong
  // into a margin report. See supabase_price_grids.sql.

  /**
   * Load the grids a parsed workbook produced.
   *
   * Upserted by code, so a tier the list has and the table doesn't — Budget
   * the first time, or whatever they add next year — arrives with its prices
   * rather than being silently dropped.
   */
  const handleSaveFabricGrids = async (grids, fileName) => {
    setProdSaving(true)
    const now = new Date().toISOString()
    const { error } = await supabase.from('fabric_categories').upsert(
      grids.map(g => ({
        code:             g.code,
        name:             g.code === 'Budget' ? 'Budget' : `Category ${g.code}`,
        widths:           g.widths,
        drops:            g.drops,
        prices:           g.prices,
        price_list_label: `${fileName} · ${g.sheet}`,
        price_list_year:  g.year || null,
        priced_at:        now,
      })), { onConflict: 'code' })
    if (error) showToast(error.message || 'Failed to load price list', 'error')
    else {
      showToast(`${grids.length} price grid${grids.length !== 1 ? 's' : ''} loaded ✓`, 'success')
      await loadAll()
    }
    setProdSaving(false)
  }

  /** Apply the workbook's unambiguous fabric → category suggestions. */
  const handleTagFabrics = async (suggestions = []) => {
    if (suggestions.length === 0) return
    setProdSaving(true)
    await Promise.all(suggestions.map(sug =>
      supabase.from('components')
        .update({ fabric_category: sug.suggested })
        .eq('id', sug.component.id)))
    showToast(`${suggestions.length} fabric${suggestions.length !== 1 ? 's' : ''} tagged ✓`, 'success')
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
      width_schedule_id: formData.width_schedule_id || null,
      colour_variant:    formData.colour_variant || null,
      option_choice_id:  formData.option_choice_id || null,
      group_key:         formData.group_key || null,
      active_min_width:  formData.active_min_width ?? null,
      active_max_width:  formData.active_max_width ?? null,
      active_min_drop:   formData.active_min_drop ?? null,
      active_max_drop:   formData.active_max_drop ?? null,
      drop_limit:        formData.drop_limit && Object.keys(formData.drop_limit).length ? formData.drop_limit : null,
      drop_limit_mode:   formData.drop_limit_mode || 'above',
      sort_order:        sortOrder,
    })
    if (error) showToast(error.message || 'Failed to add', 'error')
    else { showToast('Component added to recipe ✓', 'success'); await loadAll() }
    setProdSaving(false)
  }

  const handleUpdateProductComponent = async (id, formData) => {
    setProdSaving(true)
    await supabase.from('product_components').update({
      component_id:      formData.component_id,
      cost_type:         formData.cost_type,
      formula_deduction: Number(formData.formula_deduction) || 0,
      formula_buffer:    Number(formData.formula_buffer) || 0,
      formula_divisor:   Number(formData.formula_divisor) || 1,
      formula_interval:  Number(formData.formula_interval) || 500,
      width_schedule_id: formData.width_schedule_id || null,
      colour_variant:    formData.colour_variant || null,
      option_choice_id:  formData.option_choice_id || null,
      group_key:         formData.group_key || null,
      active_min_width:  formData.active_min_width ?? null,
      active_max_width:  formData.active_max_width ?? null,
      active_min_drop:   formData.active_min_drop ?? null,
      active_max_drop:   formData.active_max_drop ?? null,
      drop_limit:        formData.drop_limit && Object.keys(formData.drop_limit).length ? formData.drop_limit : null,
      drop_limit_mode:   formData.drop_limit_mode || 'above',
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

  // ==== DELETED RECORDS ====

  /**
   * Put a snapshot back under its original id, so anything that referenced it
   * lines up again. A job restores with its windows in one go — a job shell
   * without them would look restored while being useless.
   *
   * The bin entry is marked rather than removed: "who deleted the Wilson job
   * and when" stays worth answering after it is back.
   */
  const handleRestoreRecord = async (rec) => {
    setRestoringId(rec.id)
    try {
      if (rec.table_name === 'mfg_jobs') {
        const job     = rec.payload?.job
        const windows = rec.payload?.windows || []
        if (!job?.id) { showToast('That snapshot has no job in it', 'error'); return }

        const { error: je } = await supabase.from('mfg_jobs').insert(job)
        if (je) {
          showToast(je.code === '23505'
            ? 'That job is already back — nothing to restore'
            : `Restore failed: ${je.message}`, 'error')
          return
        }
        if (windows.length) {
          const { error: we } = await supabase.from('mfg_windows').insert(windows)
          if (we) {
            showToast(`Job restored, but its ${windows.length} window(s) failed: ${we.message}`, 'error')
            return
          }
        }
      } else if (rec.table_name === 'mfg_windows') {
        const win = rec.payload?.window
        if (!win?.id) { showToast('That snapshot has no window in it', 'error'); return }
        // Its job may have been deleted since; restoring into nothing would fail
        // on the foreign key with a message nobody can act on.
        const { data: parent } = await supabase
          .from('mfg_jobs').select('id').eq('id', win.job_id).maybeSingle()
        if (!parent) {
          showToast('That window\u2019s job is gone — restore the job first', 'error')
          return
        }
        const { error } = await supabase.from('mfg_windows').insert(win)
        if (error) { showToast(`Restore failed: ${error.message}`, 'error'); return }
      } else {
        showToast(`Don't know how to restore a ${rec.table_name} row`, 'error')
        return
      }

      await supabase.from('deleted_records')
        .update({ restored_at: new Date().toISOString() }).eq('id', rec.id)
      showToast('Restored ✓', 'success')
      await loadAll()
    } finally {
      setRestoringId(null)
    }
  }

  // ==== COMPONENT KINDS ====

  // A kind's NAME is what components store, so a rename is two writes: the
  // vocabulary row, then every component pointing at the old name. Done here
  // rather than left to the user to notice.
  const handleSaveKind = async (kind, renamedFrom = null) => {
    setProdSaving(true)
    const { id, created_at, ...fields } = kind   // eslint-disable-line no-unused-vars
    const { error } = id
      ? await supabase.from('component_kinds').update(fields).eq('id', id)
      : await supabase.from('component_kinds').insert(fields)

    if (error) {
      showToast(error.code === '23505' ? 'That kind already exists' : 'Failed to save kind', 'error')
      setProdSaving(false)
      return
    }

    if (renamedFrom && renamedFrom !== fields.name) {
      const { error: ce } = await supabase.from('components')
        .update({ kind: fields.name }).eq('kind', renamedFrom)
      if (ce) showToast('Kind renamed, but components still point at the old name', 'error')
      else showToast(`Renamed to ${fields.name} ✓`, 'success')
    }

    await loadAll()
    setProdSaving(false)
  }

  // Deleting a kind that components still use would leave them naming a
  // vocabulary entry that no longer exists — and, where a recipe groups by
  // kind, quietly change what competes. So it is refused, with the count.
  const handleDeleteKind = async (kind, usedBy = 0) => {
    if (usedBy > 0) {
      showToast(`${kind.name} is on ${usedBy} component${usedBy !== 1 ? 's' : ''} — clear it there first`, 'error')
      return
    }
    if (!window.confirm(`Delete the kind "${kind.name}"?`)) return
    const { error } = await supabase.from('component_kinds').delete().eq('id', kind.id)
    if (error) { showToast('Failed to delete kind', 'error'); return }
    showToast('Kind deleted')
    await loadAll()
  }

  // ==== PRODUCT OPTIONS ====

  const handleSaveOption = async (data) => {
    setProdSaving(true)
    const fields = { ...data }
    const id = fields.id
    delete fields.id
    delete fields.choices          // joined in on read, not a column
    const { error } = id
      ? await supabase.from('product_options').update(fields).eq('id', id)
      : await supabase.from('product_options').insert(fields)
    setProdSaving(false)
    if (error) {
      showToast(error.code === '23505' ? 'That code is already used for this type' : 'Failed to save option', 'error')
      return
    }
    await loadAll()
    showToast(id ? 'Option saved' : 'Option created')
  }

  const handleDeleteOption = async (id) => {
    const { error } = await supabase.from('product_options').delete().eq('id', id)
    if (error) { showToast('Failed to delete option', 'error'); return }
    await loadAll()
    showToast('Option deleted')
  }

  const handleSaveChoice = async (data) => {
    setProdSaving(true)
    const { id, ...fields } = data
    const { error } = id
      ? await supabase.from('product_option_choices').update(fields).eq('id', id)
      : await supabase.from('product_option_choices').insert(fields)
    setProdSaving(false)
    if (error) {
      showToast(error.code === '23505' ? 'That answer already exists' : 'Failed to save answer', 'error')
      return
    }
    await loadAll()
  }

  const handleDeleteChoice = async (id) => {
    const { error } = await supabase.from('product_option_choices').delete().eq('id', id)
    if (error) { showToast('Failed to delete answer', 'error'); return }
    await loadAll()
    showToast('Answer deleted')
  }

  const handleNewJob = async () => {
    const { data, error } = await supabase
      .from('mfg_jobs')
      .insert({ customer_name: '', job_number: '', status: 'received' })
      .select().single()
    if (error) { showToast('Failed to create job', 'error'); return }
    const job = { ...data, windows: [] }
    setJobs(prev => [job, ...prev])
    setCurrentJob(job)
  }

  // Upload a PO PDF to Supabase Storage → returns { url, name } or null
  const uploadPOFile = async (file) => {
    if (!file) return null
    if (file.type !== 'application/pdf') {
      showToast('Please choose a PDF file', 'error')
      return null
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path     = `po-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
    const { error } = await supabase.storage
      .from('customer-orders')
      .upload(path, file, { contentType: 'application/pdf', upsert: false })
    if (error) {
      showToast(`Upload failed: ${error.message}`, 'error')
      return null
    }
    const { data } = supabase.storage.from('customer-orders').getPublicUrl(path)
    return { url: data.publicUrl, name: file.name }
  }

  // Upload a PO and create a new "received" job from it
  const handleCreateJobFromPO = async (file) => {
    setPoUploading(true)
    const uploaded = await uploadPOFile(file)
    if (!uploaded) { setPoUploading(false); return }
    const { data, error } = await supabase
      .from('mfg_jobs')
      .insert({
        customer_name: '', job_number: '', status: 'received',
        po_pdf_url: uploaded.url, po_pdf_name: uploaded.name,
      })
      .select().single()
    if (error) {
      showToast('Failed to create job', 'error')
    } else {
      const job = { ...data, windows: [] }
      setJobs(prev => [job, ...prev])
      setCurrentJob(job)
      showToast('PO uploaded — job created ✓', 'success')
    }
    setPoUploading(false)
  }

  // Attach / replace the PO PDF on the current job
  const handleAttachPO = async (file) => {
    setPoUploading(true)
    const uploaded = await uploadPOFile(file)
    if (!uploaded) { setPoUploading(false); return }
    await handleJobUpdate({ po_pdf_url: uploaded.url, po_pdf_name: uploaded.name })
    showToast('PO attached ✓', 'success')
    setPoUploading(false)
  }

  const handleJobUpdate = async (updates) => {
    const updated = { ...currentJob, ...updates }
    setCurrentJob(updated)
    setJobs(prev => prev.map(j => j.id === updated.id ? updated : j))
    await supabase.from('mfg_jobs').update(updates).eq('id', currentJob.id)
  }

  /**
   * Deleting a job is two questions, so it is two steps.
   *
   * The first is what happens to any stock already deducted. That used to be
   * decided for the user — the confirm said the stock would NOT come back —
   * but a job cancelled before cutting should return its parts to the shelf
   * and a job deleted after fitting should not, and only the person deleting
   * it knows which. So the plan is worked out first and put to them.
   */
  // What returning this job's stock would do. Read fresh rather than from
  // jobMovements, which is only loaded when the deduct modal is opened.
  const buildRestorePlan = useCallback(async (jobId) => {
    const [{ data: movements }, { data: jobBars }] = await Promise.all([
      supabase.from('stock_movements').select('*').eq('job_id', jobId).eq('movement_type', 'deduct'),
      supabase.from('stock_bars').select('*').eq('job_id', jobId),
    ])
    return planStockRestore({ movements: movements || [], jobBars: jobBars || [], components })
  }, [components])

  /**
   * Put a job's stock back. Shared by deleting and by moving back to Received,
   * because it is the same undo either way. Returns the failures rather than
   * toasting them, so the caller can decide whether to carry on — deleting
   * must not, moving back may.
   */
  const returnJobStock = useCallback(async (plan) => {
    const failures = []

    for (const line of plan.quantities) {
      const row = stockMap[stockKey(line.component_id, line.colour_variant)]
      if (!row?.id) { failures.push(`${line.component?.name || 'a part'} has no stock row`); continue }
      const { error } = await supabase.from('stock')
        .update({ qty_on_hand: (Number(row.qty_on_hand) || 0) + line.qty })
        .eq('id', row.id)
      if (error) failures.push(`${line.component?.name || 'a part'}: ${error.message}`)
    }

    if (plan.pieces.length) {
      const { error } = await supabase.from('stock_bars')
        .update({ status: 'available', job_id: null })
        .in('id', plan.pieces.map(b => b.id))
      if (error) failures.push(`bars and rolls: ${error.message}`)
    }

    // Offcuts the job created come back out, or it would leave stock behind
    // that was never there before.
    if (plan.offcuts.length) {
      const { error } = await supabase.from('stock_bars')
        .delete().in('id', plan.offcuts.map(b => b.id))
      if (error) failures.push(`offcuts: ${error.message}`)
    }

    return failures
  }, [stockMap])

  const handleJobDeleteRequest = async () => {
    setDeleteJobPlan({ job: currentJob, plan: await buildRestorePlan(currentJob.id) })
  }

  /* ---- Moving backwards through the statuses ----------------------------
   * Completed -> In Progress is just a status change; nothing was locked or
   * consumed by completing it.
   *
   * In Progress -> Received is not: confirming took a pricing snapshot and
   * may have deducted stock, and both have to be dealt with. Hence the modal.
   * -------------------------------------------------------------------- */
  const handleJobBackToReceivedRequest = async () => {
    setRevertPlan({ job: currentJob, plan: await buildRestorePlan(currentJob.id) })
  }

  const handleJobBackToReceivedConfirm = async ({ restoreStock }) => {
    const job = revertPlan?.job
    const plan = revertPlan?.plan
    if (!job) return
    setReverting(true)
    try {
      if (restoreStock && plan) {
        const failures = await returnJobStock(plan)
        if (failures.length) {
          showToast(`Stock not fully returned — job left In Progress. ${failures[0]}`, 'error')
          return
        }
        // The deduction is undone, so its record has to go too — otherwise
        // deducting again after the next Confirm would look like a second
        // deduction on top of one that no longer exists.
        await supabase.from('stock_movements').delete().eq('job_id', job.id)
        const moved = plan.quantities.length + plan.pieces.length
        if (moved) showToast(`Returned ${moved} stock line${moved !== 1 ? 's' : ''}`, 'success')
      }

      // Drop the pricing lock: Received is editable, and an editable job
      // quoting a snapshot taken before the edits is worse than no snapshot.
      await handleJobUpdate({
        status: 'received',
        price_snapshot: null,
        qty_snapshot: null,
        locked_total: null,
      })
      setRevertPlan(null)
      showToast('Back to Received — pricing unlocked')
      await loadAll()
    } finally {
      setReverting(false)
    }
  }

  /**
   * Put the stock back, then delete.
   *
   * Order matters: the movements and bar rows are what say WHAT to return, and
   * the delete clears them, so returning has to finish first. If any part of
   * the return fails the delete is abandoned — a half-returned job that no
   * longer exists is the one outcome with no way back.
   */
  const handleJobDeleteConfirm = async ({ restoreStock }) => {
    const job  = deleteJobPlan?.job
    const plan = deleteJobPlan?.plan
    if (!job) return
    const jobId = job.id
    setDeletingJob(true)

    try {
      if (restoreStock && plan) {
        const failures = await returnJobStock(plan)
        if (failures.length) {
          showToast(`Stock not fully returned — job NOT deleted. ${failures[0]}`, 'error')
          return
        }

        const movedBack = plan.quantities.length + plan.pieces.length
        if (movedBack) showToast(`Returned ${movedBack} stock line${movedBack !== 1 ? 's' : ''}`, 'success')
      }

      // Clear rows that reference this job so the delete can't fail on a
      // foreign key. Anything not returned above is deliberately left as-is.
      await supabase.from('stock_movements').delete().eq('job_id', jobId)
      await supabase.from('stock_bars').update({ job_id: null }).eq('job_id', jobId)

      const { error } = await supabase.from('mfg_jobs').delete().eq('id', jobId)
      if (error) { showToast('Delete failed', 'error'); return }

      setJobs(prev => prev.filter(j => j.id !== jobId))
      setCurrentJob(null)
      setDeleteJobPlan(null)
      showToast(restoreStock ? 'Job deleted, stock returned ✓' : 'Job deleted')
      await loadAll()
    } finally {
      setDeletingJob(false)
    }
  }

  /**
   * The stock position of every in-progress job, keyed by job id.
   *
   * Worked out together, not job by job. Measuring each job against the whole
   * shelf on its own is what let three jobs each be told they could have the
   * same ten parts — on live data that hid five genuinely short items. See
   * stockPositions.
   *
   * Only in-progress jobs: a Received job has not been committed to and a
   * Completed one was already built, so neither has a claim on the shelf.
   * Only computed for /track, because it walks every window of every job and
   * the workshop screens never ask for it.
   */
  const stockByJob = useMemo(() => {
    if (route !== 'track') return {}
    const entries = jobs
      .filter(j => j.status === 'in_progress')
      .map(job => ({ jobId: job.id, summary: calcJobSummary(buildJobWindows(job, true)) }))
    // stockBars carries the loose pieces — offcuts and rolls — which are real
    // stock for a bar or fabric and were being left out of the count.
    return stockPositions(entries, stockMap, stockBars)
  }, [route, jobs, buildJobWindows, stockMap, stockBars])

  // Compute the price snapshot + locked total for a job from current recipes
  const computeJobLock = useCallback((job) => {
    // Nested BEFORE snapshotting, so a confirmed job freezes the metres it
    // will actually pull off the roll — not the sum of its blinds' ideal
    // strips, which nobody could order against.
    const windowsWithBOM = buildJobWindows(job, false)
    // Job extras are part of what the job costs, so they are in the total and
    // in the price snapshot. They need no quantity snapshot: their quantity is
    // the number someone typed and is stored on the job, so unlike a formula's
    // output there is nothing for a later recipe change to move.
    const jobExtraLines = buildJobExtraLines(job, components, null)
    const total = calcJobSummary(windowsWithBOM, jobExtraLines)
      .reduce((s, r) => s + r.total_cost, 0)

    // Sell freezes beside cost, for the same reason. Without it, loading next
    // year's price list would silently rewrite the margin on every job ever
    // completed — and a GP figure that changes when you restate the prices is
    // not a figure anyone can act on. A window with no sell price yet is left
    // OUT of the snapshot rather than frozen at null, so pricing it later
    // still works; only a real number is worth locking.
    const sell_snapshot = {}
    windowsWithBOM.forEach(win => {
      const product = products.find(p => p.id === win.product_id)
      const optDefs = optionDefsFor(win.product_id)
      const fabricCmp = components.find(c => c.id === win.config?.fabric?.component_id) || null
      const { sell } = windowSell({
        win, product, fabricComponent: fabricCmp,
        categories: fabricCategories, optionDefs: optDefs,
        answers: resolveAnswers(optDefs, win.config),
      })
      if (sell !== null && sell !== undefined) sell_snapshot[win.id] = sell
    })

    return {
      price_snapshot: buildPriceSnapshot(windowsWithBOM, jobExtraLines),
      qty_snapshot:   buildQtySnapshot(windowsWithBOM),
      sell_snapshot,
      locked_total:   Math.round(total * 100) / 100,
    }
  }, [buildJobWindows, components, products, optionDefsFor, fabricCategories])

  // One-off: jobs confirmed before pricing was locked have no snapshot, so their
  // value would keep moving with component costs. Lock them at current prices.
  useEffect(() => {
    if (loading || backfilledRef.current) return
    if (jobs.length === 0 || Object.keys(productComponentsMap).length === 0) return
    const stale = jobs.filter(j =>
      (j.status === 'in_progress' || j.status === 'completed') &&
      (!j.price_snapshot || !j.qty_snapshot)
    )
    backfilledRef.current = true
    if (stale.length === 0) return
    ;(async () => {
      let saved = 0
      let firstError = null
      for (const j of stale) {
        const { error } = await supabase.from('mfg_jobs').update(computeJobLock(j)).eq('id', j.id)
        if (error) { firstError = firstError || error; break }
        saved++
      }
      if (firstError) {
        // Don't fake a locked state in the UI when nothing was persisted
        showToast(`Couldn't lock pricing: ${firstError.message}`, 'error')
        return
      }
      setJobs(prev => prev.map(j => {
        const hit = stale.find(s => s.id === j.id)
        return hit ? { ...j, ...computeJobLock(hit) } : j
      }))
      showToast(`Locked pricing on ${saved} existing job${saved !== 1 ? 's' : ''}`, 'success')
    })()
  }, [loading, jobs, productComponentsMap, computeJobLock, showToast])

  const handleJobConfirm = async () => {
    if (!window.confirm('Confirm this job? The BOM, its cost and its sell prices will be locked.')) return
    const updates = { status: 'in_progress', ...computeJobLock(currentJob) }
    // Default the manufacture date to today if not already set
    if (!currentJob.date_manufacture) {
      updates.date_manufacture = new Date().toISOString().slice(0, 10)
    }
    await handleJobUpdate(updates)
    showToast('Job confirmed — pricing locked ✓', 'success')
  }

  const handleJobComplete = async () => {
    if (!window.confirm('Mark this job as completed and ready for pickup?')) return
    await handleJobUpdate({ status: 'completed' })
    showToast('Job completed ✓', 'success')
  }

  // Completed -> In Progress. Nothing was locked or consumed by completing a
  // job, so there is nothing to undo but the status itself.
  const handleJobReopen = async () => {
    if (!window.confirm('Move this job back to In Progress?')) return
    await handleJobUpdate({ status: 'in_progress' })
    showToast('Back to In Progress')
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
        substitutions: winData.substitutions || {},
        extra_lines:   [],
        config:        winData.config || {},
      })
      .select().single()
    if (error) { showToast('Failed to add window', 'error'); return }
    const newWin = {
      ...data,
      bom_overrides: {},
      substitutions: data.substitutions || {},
      extra_lines:   [],
      config:        data.config || {},
    }
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

  // Copies everything but identity — product, dimensions, options, fabric —
  // so a near-identical window (same track/blind, same config, different
  // room and maybe a tweaked size) doesn't mean re-answering every option
  // from scratch. Lands at the end of the list, ready to open and adjust.
  const handleWindowDuplicate = async (idx) => {
    const source = currentJob.windows[idx]
    const sortOrder = (currentJob.windows || []).length
    const { data, error } = await supabase
      .from('mfg_windows')
      .insert({
        job_id:        currentJob.id,
        product_id:    source.product_id,
        label:         source.label ? `${source.label} (copy)` : '',
        width_mm:      source.width_mm,
        drop_mm:       source.drop_mm,
        sort_order:    sortOrder,
        bom_overrides: {},
        substitutions: source.substitutions || {},
        // A duplicate of a window that needed a joiner needs the joiner too —
        // the copy is for a near-identical window, extras included.
        extra_lines:   source.extra_lines || [],
        config:        source.config || {},
      })
      .select().single()
    if (error) { showToast('Failed to duplicate window', 'error'); return }
    const newWin = { ...data, bom_overrides: {}, substitutions: data.substitutions || {}, extra_lines: data.extra_lines || [], config: data.config || {} }
    const updated = { ...currentJob, windows: [...(currentJob.windows || []), newWin] }
    setCurrentJob(updated)
    setJobs(prev => prev.map(j => j.id === updated.id ? updated : j))
    setCurrentWindow({ win: newWin, idx: updated.windows.length - 1 })
  }

  // Move one window to another position. sort_order is renumbered 0..n-1 over
  // the whole list rather than nudged, so a list that arrives with duplicate
  // or gappy orders comes out clean; only the rows that actually moved are
  // written back. Nothing costed depends on position — the qty snapshot is
  // keyed by window id — so this is safe on a confirmed job too.
  const handleWindowsReorder = async (from, to) => {
    const windows = [...(currentJob.windows || [])]
    if (from === to || !windows[from]) return
    const [moved] = windows.splice(from, 1)
    windows.splice(to, 0, moved)

    const renumbered = windows.map((w, i) => ({ ...w, sort_order: i }))
    const wasAt      = new Map((currentJob.windows || []).map(w => [w.id, w.sort_order]))
    const changed    = renumbered.filter(w => wasAt.get(w.id) !== w.sort_order)

    const updated = { ...currentJob, windows: renumbered }
    setCurrentJob(updated)
    setJobs(prev => prev.map(j => j.id === updated.id ? updated : j))

    const results = await Promise.all(changed.map(w =>
      supabase.from('mfg_windows').update({ sort_order: w.sort_order }).eq('id', w.id)))
    if (results.some(r => r.error)) showToast('Failed to save the new order', 'error')
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

  /* -------------------------------------------------------- add to a PO --
   * Reordering from the shelf, where you notice you are short, rather than
   * three screens away in Orders.
   *
   * The order is the supplier's most recent DRAFT, and when they have none —
   * which is the usual case, not the exception — one is started. Draft only:
   * a 'sent' order has gone to the supplier and appending to it would add a
   * line nobody is going to send.
   * --------------------------------------------------------------------- */
  const handleAddToPO = (component, colourVariant) => {
    setAddToPOComp(component)
    setAddToPOColour(colourVariant)
    setAddToPOOpen(true)
  }

  const handleSaveAddToPO = async ({ qty }) => {
    setPoCreating(true)
    const component = addToPOComp
    const supplierId = component.supplier_id
    let po = openPOFor(purchaseOrders, supplierId)
    let created = false

    if (!po) {
      const { data, error } = await supabase
        .from('purchase_orders')
        .insert({ supplier_id: supplierId, status: 'draft', notes: null })
        .select('*, supplier:suppliers(*)').single()
      if (error || !data) {
        showToast(error?.message || 'Could not start an order', 'error')
        setPoCreating(false)
        return
      }
      po = data
      created = true
    }

    const info = orderUnitInfo(component, suppliers.find(sp => sp.id === supplierId))
    const { error } = await supabase.from('purchase_order_lines').insert({
      po_id:          po.id,
      component_id:   component.id,
      colour_variant: addToPOColour || null,
      qty_ordered:    Number(qty) || 0,
      unit_cost:      info.price,
    })

    if (error) {
      showToast(error.message || 'Could not add to the order', 'error')
    } else {
      const unit = component.order_type === 'bar' ? 'bar' : 'pack'
      showToast(
        `${qty} ${unit}${qty !== 1 ? 's' : ''} → ${poDisplayNumber(po)}${created ? ' (new draft)' : ''} ✓`,
        'success')
      setAddToPOOpen(false)
      await loadAll()
    }
    setPoCreating(false)
  }

  /* ---------------------------------------------------------- stocktake --
   * Bars could only ever go up. Receiving added to the count and nothing took
   * away from it, so the one correction a stocktake exists to make had no way
   * in — and a bar count that is too high is worse than one that is too low,
   * because the cut planner will confidently plan against bars that are not
   * on the rack.
   *
   * The count is set, not nudged, and the difference is written to
   * stock_movements as an 'adjust' so the change can be accounted for later.
   * planStockRestore only ever reads 'deduct' rows, so an adjustment cannot be
   * picked up and "returned" by deleting a job.
   * --------------------------------------------------------------------- */
  const handleStocktake = (component, colourVariant, stock) => {
    setStocktakeComp(component)
    setStocktakeColour(colourVariant)
    setStocktakeStock(stock)
    setStocktakeOpen(true)
  }

  const handleSaveStocktake = async ({ counted, qty_minimum }) => {
    setStockSaving(true)
    const before = Number(stocktakeStock?.qty_on_hand) || 0
    const after  = Number(counted) || 0
    const delta  = after - before

    if (stocktakeStock?.id) {
      await supabase.from('stock')
        .update({ qty_on_hand: after, qty_minimum })
        .eq('id', stocktakeStock.id)
    } else {
      await supabase.from('stock').insert({
        component_id:   stocktakeComp.id,
        colour_variant: stocktakeColour || null,
        qty_on_hand:    after,
        qty_minimum,
      })
    }

    // Only when something actually moved. A stocktake that confirms the count
    // is a real and useful outcome, but it is not a stock movement.
    if (delta !== 0) {
      await supabase.from('stock_movements').insert({
        component_id:      stocktakeComp.id,
        colour_variant:    stocktakeColour || null,
        movement_type:     'adjust',
        qty:               delta,
        qty_on_hand_delta: delta,
        notes:             `Stocktake: counted ${after} bar${after !== 1 ? 's' : ''} (was ${before})`,
      })
    }

    showToast(delta === 0
      ? 'Count confirmed — no change'
      : `Stock set to ${after} bar${after !== 1 ? 's' : ''} (${delta > 0 ? '+' : ''}${delta}) ✓`, 'success')
    setStocktakeOpen(false)
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
    // A fabric piece carries its own width; a track offcut has none, and must
    // not have one written over it.
    const isFabric = barModalComp?.order_type === 'fabric'
    const noun     = isFabric ? 'Fabric piece' : 'Bar'
    const widthCol = isFabric ? { roll_width_mm: formData.roll_width_mm } : {}
    if (editingBar) {
      await supabase.from('stock_bars').update({
        label:     formData.label,
        length_mm: formData.length_mm,
        ...widthCol,
      }).eq('id', editingBar.id)
      showToast(`${noun} updated ✓`, 'success')
    } else {
      await supabase.from('stock_bars').insert({
        component_id:   barModalComp.id,
        colour_variant: barModalColour || null,
        label:          formData.label,
        length_mm:      formData.length_mm,
        status:         'available',
        ...widthCol,
      })
      showToast(`${noun} added to stock ✓`, 'success')
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

  /* ------------------------------------------------------------------------
   * Offcuts still owed
   *
   * A bar deduction takes the bars the cutting plan called for and records
   * what it EXPECTS to be left over, but puts nothing on the shelf — the real
   * lengths are only known once the cutting is done. So a job can sit in a
   * state where stock has gone out and the leftovers have not come back, and
   * the job page has to say so, or the offcuts quietly never get entered and
   * the next job plans against a shelf that is emptier than it really is.
   *
   * Movements are therefore loaded whenever a job is open, not only when the
   * deduct modal is, since the prompt has to appear without being asked for.
   * ---------------------------------------------------------------------- */
  useEffect(() => {
    if (currentJob?.id) loadJobMovements(currentJob.id)
    else setJobMovements([])
  }, [currentJob?.id, loadJobMovements])

  const pendingOffcuts = useMemo(() => (jobMovements || [])
    .filter(m => Array.isArray(m.planned_offcuts) && m.planned_offcuts.length > 0
      && !m.offcuts_recorded_at)
    .map(m => ({
      movement_id:    m.id,
      component_id:   m.component_id,
      component:      components.find(c => c.id === m.component_id) || null,
      colour_variant: m.colour_variant || null,
      offcuts:        m.planned_offcuts,
    })), [jobMovements, components])

  /**
   * Put the recorded leftovers on the shelf and stop the job asking.
   *
   * The pieces are stamped with the job, the same as any offcut a job created,
   * so deleting the job can still take back what it made (planStockRestore
   * tells them from the pieces it consumed by status). The movements are
   * stamped whether or not anything was kept — "it all went in the bin" is an
   * answer, and a job that has been answered should stop prompting.
   */
  const handleRecordOffcuts = async ({ pieces = [], movementIds = [] }) => {
    setDeductSaving(true)
    if (pieces.length > 0) {
      await supabase.from('stock_bars').insert(pieces.map(p => ({
        component_id:   p.component_id,
        colour_variant: p.colour_variant || null,
        label:          p.label,
        length_mm:      p.length_mm,
        status:         'available',
        job_id:         currentJob.id,
      })))
    }
    if (movementIds.length > 0) {
      await supabase.from('stock_movements')
        .update({ offcuts_recorded_at: new Date().toISOString() })
        .in('id', movementIds)
    }
    showToast(pieces.length > 0
      ? `${pieces.length} offcut${pieces.length !== 1 ? 's' : ''} on the shelf ✓`
      : 'Offcuts recorded — nothing kept', 'success')
    setRecordOffcutsOpen(false)
    await Promise.all([loadAll(), loadJobMovements(currentJob.id)])
    setDeductSaving(false)
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

      // Record movement. qty is the BOM quantity; qty_on_hand_delta is what
      // actually left the stock ROW, which is a different number for bars
      // (whole bars, not millimetres) and fabric (nothing at all). Without it
      // a deduction cannot be reversed — see planStockRestore.
      const movement = {
        component_id:   d.component.id,
        colour_variant: d.colour_variant || null,
        job_id:         currentJob.id,
        movement_type:  'deduct',
        qty:            -d.qty,
        qty_on_hand_delta: 0,
        // What the cutting plan expects to survive the saw. Held rather than
        // written to stock, because the real lengths are only known once the
        // cutting is done — see supabase_cut_plan_offcuts.sql and the Record
        // Offcuts step. Absent on pack and fabric lines, which have no plan.
        planned_offcuts: d.planned_offcuts || null,
      }
      movements.push(movement)

      // Update pack stock qty. Bars and fabric are held as individual pieces
      // in stock_bars, not as a count on the stock row — decrementing a metre
      // figure off qty_on_hand would be meaningless for either.
      if (stock?.id && !['bar', 'fabric'].includes(d.component.order_type)) {
        stockUpdates.push({ id: stock.id, qty: (stock.qty_on_hand || 0) - d.qty })
        movement.qty_on_hand_delta = -d.qty
      }

      // Fabric — a roll is consumed whole and whatever survives the nesting
      // goes back as new pieces, each with its own width. Same shape as a bar
      // offcut, with the width that decides what will fit on it next time.
      if (d.component.order_type === 'fabric') {
        for (const piece of d.fabric_pieces || []) {
          if (piece.piece_id && piece.piece_id !== '__new_roll__') {
            barUpdates.push(piece.piece_id)
          }
          for (const oc of piece.offcuts || []) {
            offcutInserts.push({
              component_id:   d.component.id,
              colour_variant: d.colour_variant || null,
              label:          oc.label,
              length_mm:      Math.round(oc.length_mm),
              roll_width_mm:  Math.round(oc.roll_width_mm),
              status:         'available',
              // Stamped so that deleting the job can take back what it made.
              // Available + this job = created here; used + this job = taken.
              job_id:         currentJob.id,
            })
          }
        }
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
              job_id:         currentJob.id,
            })
          }
        }
        if (fullBarsUsed > 0 && s?.id) {
          stockUpdates.push({ id: s.id, qty: (s.qty_on_hand || 0) - fullBarsUsed })
          movement.qty_on_hand_delta = -fullBarsUsed
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

    // Check for low stock and auto-generate PO if needed. Passes the movements
    // so the check can use what each deduction really took off the stock row.
    await checkAndGeneratePOs(deductions, movements)

    if (offcutInserts.length > 0) {
      await supabase.from('stock_bars').insert(offcutInserts)
    }

    showToast('Stock deducted ✓', 'success')
    setDeductOpen(false)
    await Promise.all([loadAll(), loadJobMovements(currentJob.id)])
    setDeductSaving(false)
  }

  // Auto-generate draft POs for components that fall below minimum after deduction
  /**
   * Raise draft POs for anything a deduction pushed under its minimum.
   *
   * qtyAfter has to be in the stock row's OWN unit, because that is what the
   * minimum is in. For a bar that is whole bars, while d.qty is the length the
   * BOM asked for — so subtracting d.qty took metres off a bar count, read ten
   * bars minus 17.74m as "-7.74, reorder", and ordered bars by the metre.
   *
   * The deduction already worked out what it really took off the row and
   * recorded it as qty_on_hand_delta (whole bars for a bar, the count for a
   * pack, nothing for fabric). movements is built one per deduction, in order,
   * so it lines up by index. The BOM qty is only a fallback for a movement
   * that somehow carries no delta.
   */
  const checkAndGeneratePOs = async (deductions, movements = []) => {
    const alerts = []
    for (const [i, d] of deductions.entries()) {
      const key   = stockKey(d.component.id, d.colour_variant)
      const stock = stockMap[key]
      if (!stock) continue
      const delta    = movements[i]?.qty_on_hand_delta
      const qtyAfter = (stock.qty_on_hand || 0) + (delta ?? -d.qty)
      if (qtyAfter < (stock.qty_minimum || 0)) {
        alerts.push({ component: d.component, colour_variant: d.colour_variant, stock, qtyAfter })
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
          items.map(item => {
            const info      = orderUnitInfo(item.component, suppliers.find(sp => sp.id === item.component.supplier_id))
            const shortfall = (item.stock.qty_minimum || 0) - item.qtyAfter
            const packQty   = item.component.order_type === 'bar' ? 1 : (Number(item.component.pack_qty) || 1)
            return {
              po_id:          po.id,
              component_id:   item.component.id,
              colour_variant: item.colour_variant || null,
              qty_ordered:    shortfall > 0 ? Math.ceil(shortfall / packQty) : 1,
              unit_cost:      info.price,
            }
          })
        )
      }
    }

    showToast(`⚠️ ${alerts.length} component${alerts.length !== 1 ? 's' : ''} below minimum — draft PO created`, 'success')
  }

  // ==== PURCHASE ORDERS ====

  const handleNewPO = async ({ supplier_id, notes }) => {
    setPoCreating(true)
    const { data, error } = await supabase
      .from('purchase_orders')
      .insert({ supplier_id, status: 'draft', notes })
      .select('*, supplier:suppliers(*)').single()
    if (error) {
      showToast(error.message || 'Failed to create order', 'error')
    } else {
      setPurchaseOrders(prev => [data, ...prev])
      setCurrentPO(data)
      setPoModalOpen(false)
      showToast('Purchase order created ✓', 'success')
    }
    setPoCreating(false)
  }

  const handlePOStatusChange = async (status) => {
    const updated = { ...currentPO, status }
    setCurrentPO(updated)
    setPurchaseOrders(prev => prev.map(p => p.id === updated.id ? updated : p))
    const { error } = await supabase.from('purchase_orders').update({ status }).eq('id', currentPO.id)
    if (error) showToast('Failed to update status', 'error')
    else showToast(`Marked as ${status} ✓`, 'success')
  }

  /**
   * Order the same things again.
   *
   * A new DRAFT carrying the same supplier, the same parts and the same
   * quantities — and today's prices, not the old order's. Every other path
   * that creates a line prices it from the component and its supplier
   * discount (+ PO, Add Items, the low-stock auto-order), and a duplicate
   * creates lines, so a year-old order would otherwise be re-sent at last
   * year's cost.
   *
   * What deliberately does NOT come across: the status, which starts at draft
   * because nothing has been sent; and qty_received, because nothing has
   * arrived. Copying either would produce an order that claims to be part way
   * through a delivery that never happened.
   *
   * The per-line wording does come across — description, colour and order unit
   * overrides are how this supplier likes to be written to, and that does not
   * change between orders.
   */
  const handlePODuplicate = async () => {
    setPoCreating(true)
    const source   = currentPO
    const supplier = suppliers.find(sp => sp.id === source.supplier_id) || null
    const lines    = poLinesMap[source.id] || []

    const { data: po, error } = await supabase.from('purchase_orders').insert({
      supplier_id:  source.supplier_id,
      status:       'draft',
      notes:        source.notes || null,
      hide_pricing: !!source.hide_pricing,
    }).select('*, supplier:suppliers(*)').single()

    if (error || !po) {
      showToast(error?.message || 'Could not duplicate the order', 'error')
      setPoCreating(false)
      return
    }

    let repriced = 0
    if (lines.length > 0) {
      const payload = lines.map(l => {
        // A line whose component has since been removed cannot be re-priced,
        // so it keeps what it was. Better a stale figure than a zero that
        // reads as free.
        const priced = l.component ? orderUnitInfo(l.component, supplier).price : null
        if (priced !== null && Math.abs(priced - (Number(l.unit_cost) || 0)) > 0.005) repriced++
        return {
          po_id:          po.id,
          component_id:   l.component_id,
          colour_variant: l.colour_variant || null,
          qty_ordered:    Number(l.qty_ordered) || 0,
          unit_cost:      priced !== null ? priced : (Number(l.unit_cost) || 0),
          description:    l.description || null,
          order_unit:     l.order_unit || null,
          colour:         l.colour || null,
        }
      })
      const { error: lineErr } = await supabase.from('purchase_order_lines').insert(payload)
      if (lineErr) {
        // The order exists but is empty, which is worse than not having it —
        // take it back out rather than leaving a husk behind.
        await supabase.from('purchase_orders').delete().eq('id', po.id)
        showToast(lineErr.message || 'Could not copy the items', 'error')
        setPoCreating(false)
        return
      }
    }

    showToast(
      `Duplicated to ${poDisplayNumber(po)} — ${lines.length} line${lines.length !== 1 ? 's' : ''}`
      + (repriced > 0 ? `, ${repriced} re-priced` : ''),
      'success')
    await loadAll()
    setCurrentPO(po)
    setPoCreating(false)
  }

  const handlePODelete = async () => {
    if (!window.confirm('Delete this purchase order?')) return
    const id = currentPO.id
    await supabase.from('purchase_order_lines').delete().eq('po_id', id)
    const { error } = await supabase.from('purchase_orders').delete().eq('id', id)
    if (error) { showToast('Delete failed', 'error'); return }
    setPurchaseOrders(prev => prev.filter(p => p.id !== id))
    setPoLinesMap(prev => { const next = { ...prev }; delete next[id]; return next })
    setCurrentPO(null)
    showToast('Purchase order deleted')
  }

  /** Who we are, for documents that leave the building. One row, id 1. */
  const handleSaveCompanyDetails = async (form) => {
    setProdSaving(true)
    const { error } = await supabase.from('company_details').upsert({
      id: 1,
      name: form.name || 'Curtain Ideas',
      abn: form.abn || null,
      address: form.address || null,
      phone: form.phone || null,
      email: form.email || null,
      website: form.website || null,
      delivery_address: form.delivery_address || null,
      delivery_note: form.delivery_note || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    if (error) showToast(error.message || 'Failed to save', 'error')
    else { showToast('Company details saved ✓', 'success'); await loadAll() }
    setProdSaving(false)
  }

  /** Quantities-only mode. Stored on the order so the PDF cannot disagree. */
  const handleTogglePricing = async (hide) => {
    const { error } = await supabase.from('purchase_orders')
      .update({ hide_pricing: hide }).eq('id', currentPO.id)
    if (error) { showToast(error.message || 'Failed to save', 'error'); return }
    setCurrentPO(p => ({ ...p, hide_pricing: hide }))
    setPurchaseOrders(prev => prev.map(p => p.id === currentPO.id ? { ...p, hide_pricing: hide } : p))
    showToast(hide ? 'Pricing hidden on this order' : 'Pricing shown on this order')
  }

  const handleExportPOPdf = async () => {
    setPoExporting(true)
    try {
      const supplier = suppliers.find(sp => sp.id === currentPO.supplier_id) || currentPO.supplier
      await exportPurchaseOrderPDF(currentPO, supplier, poLinesMap[currentPO.id] || [], companyDetails)
    } catch (e) {
      showToast(e.message || 'Could not generate the PDF', 'error')
    } finally {
      setPoExporting(false)
    }
  }

  /* -------------------------------------------------------- receiving --
   * Books a delivery in against its order and onto the shelf in one step.
   *
   * The conversion is the whole job and it differs per kind of part: an order
   * unit is a bar for a bar, a PACK for a pack — three packs of a 50m spline
   * is 150 metres of stock, not three — and fabric is not a count at all, so
   * each roll arrives as its own piece with the width and length the modal
   * asked for.
   *
   * The order closes itself only when every line is fully in. A part delivery
   * leaves it open, showing what is still owed.
   * ------------------------------------------------------------------- */
  const handleReceivePO = async (received) => {
    setReceiving(true)
    const movements = [], pieces = []

    for (const { line, qty, rolls } of received) {
      const component = line.component
      if (!component) continue

      const movement = {
        component_id:      component.id,
        colour_variant:    line.colour_variant || null,
        movement_type:     'receive',
        qty,
        qty_on_hand_delta: 0,
        notes:             `Received ${qty} on ${poDisplayNumber(currentPO)}`,
      }

      if (component.order_type === 'fabric') {
        // Rolls are pieces, not a number. qty_on_hand stays untouched.
        (rolls || []).forEach((r, i) => pieces.push({
          component_id:   component.id,
          colour_variant: line.colour_variant || null,
          label:          `${poDisplayNumber(currentPO)} roll ${i + 1}`,
          length_mm:      r.length_mm,
          roll_width_mm:  r.roll_width_mm,
          status:         'available',
        }))
      } else {
        const delta = receivedToStockQty(component, qty)
        const key   = stockKey(component.id, line.colour_variant)
        const stock = getStock(stockMap, component, line.colour_variant) || stockMap[key]
        if (stock?.id) {
          await supabase.from('stock')
            .update({ qty_on_hand: (Number(stock.qty_on_hand) || 0) + delta })
            .eq('id', stock.id)
        } else {
          await supabase.from('stock').insert({
            component_id:   component.id,
            colour_variant: line.colour_variant || null,
            qty_on_hand:    delta,
            qty_minimum:    0,
          })
        }
        movement.qty_on_hand_delta = delta
      }

      movements.push(movement)

      await supabase.from('purchase_order_lines')
        .update({ qty_received: (Number(line.qty_received) || 0) + qty })
        .eq('id', line.id)
    }

    if (pieces.length)    await supabase.from('stock_bars').insert(pieces)
    if (movements.length) await supabase.from('stock_movements').insert(movements)

    // Close the order only when nothing is left owing.
    const after = (poLinesMap[currentPO.id] || []).map(l => {
      const hit = received.find(r => r.line.id === l.id)
      return hit ? { ...l, qty_received: (Number(l.qty_received) || 0) + hit.qty } : l
    })
    const done = isFullyReceived(after)
    if (done) {
      await supabase.from('purchase_orders').update({ status: 'received' }).eq('id', currentPO.id)
      setCurrentPO(p => ({ ...p, status: 'received' }))
    }

    const still = after.reduce((n, l) => n + (outstandingQty(l) > 0 ? 1 : 0), 0)
    showToast(done
      ? `Delivery received — order complete ✓`
      : `${received.length} line${received.length !== 1 ? 's' : ''} received · ${still} still outstanding`,
      'success')
    setReceivePOOpen(false)
    await loadAll()
    setReceiving(false)
  }

  const handleAddPOLines = async (lines) => {
    setAddingLines(true)
    const payload = lines.map(l => ({ ...l, po_id: currentPO.id }))
    const { error } = await supabase.from('purchase_order_lines').insert(payload)
    if (error) {
      showToast(error.message || 'Failed to add items', 'error')
    } else {
      showToast(`${lines.length} item${lines.length !== 1 ? 's' : ''} added ✓`, 'success')
      setAddLinesOpen(false)
      await loadAll()
    }
    setAddingLines(false)
  }

  const handleUpdatePOLine = async (lineId, updates) => {
    const payload = {}
    if (updates.qty_ordered !== undefined) payload.qty_ordered = Number(updates.qty_ordered) || 0
    if (updates.unit_cost !== undefined) payload.unit_cost = Number(updates.unit_cost) || 0
    // Blank is not a description — it means "use the component's own wording",
    // so it goes back as null rather than as an empty string that would print
    // a blank line on the order.
    if (updates.description !== undefined) payload.description = updates.description.trim() === '' ? null : updates.description
    if (updates.order_unit !== undefined)  payload.order_unit  = updates.order_unit.trim()  === '' ? null : updates.order_unit
    if (updates.colour !== undefined)      payload.colour      = updates.colour.trim()      === '' ? null : updates.colour
    setPoLinesMap(prev => ({
      ...prev,
      [currentPO.id]: (prev[currentPO.id] || []).map(l => l.id === lineId ? { ...l, ...payload } : l),
    }))
    await supabase.from('purchase_order_lines').update(payload).eq('id', lineId)
  }

  const handleRemovePOLine = async (lineId) => {
    setPoLinesMap(prev => ({
      ...prev,
      [currentPO.id]: (prev[currentPO.id] || []).filter(l => l.id !== lineId),
    }))
    await supabase.from('purchase_order_lines').delete().eq('id', lineId)
  }

  const handleExportPO = async () => {
    setPoExporting(true)
    try {
      const supplier = suppliers.find(s => s.id === currentPO.supplier_id) || currentPO.supplier
      await exportPurchaseOrderXLSX(currentPO, supplier, poLinesMap[currentPO.id] || [])
    } finally {
      setPoExporting(false)
    }
  }

  const handleExportPricing = async (product, fabric = null) => {
    setPricingExporting(true)
    try {
      const optionDefs = productOptions[product.product_type] || []
      const { truncated } = await exportProductPricingXLSX(
        product, productComponentsMap[product.id] || [], optionDefs, fabricCategories, fabric)
      if (truncated) showToast('Too many option combinations — export was capped', 'error')
      else showToast('Pricing downloaded ✓', 'success')
    } catch (e) {
      showToast(e.message || 'Export failed', 'error')
    } finally {
      setPricingExporting(false)
    }
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
    // Tracking is its own read-only screen, not one of the workshop tabs.
    if (route === 'track') {
      return (
        <TrackPO
          jobs={jobs}
          products={products}
          stockByJob={stockByJob}
        />
      )
    }

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
          job={currentJob}
          product={product}
          productComponents={recipe}
          optionDefs={optionDefsFor(win.product_id)}
          allComponents={components}
          fabricCategories={fabricCategories}
          stockMap={stockMap}
          suppliers={suppliers}
          kinds={componentKinds}
          nestedFabricQty={liveNestedFabricQty[win.id]}
          onBack={() => setCurrentWindow(null)}
          onUpdate={(updates) => handleWindowUpdate(currentWindow.idx, updates)}
          onDelete={() => handleWindowDelete(currentWindow.idx)}
          readOnly={currentJob.status !== 'received'}
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
          optionDefsFor={optionDefsFor}
          allComponents={components}
          suppliers={suppliers}
          kinds={componentKinds}
          fabricCategories={fabricCategories}
          stockMap={stockMap}
          stockBars={stockBars}
          onBack={() => setCurrentJob(null)}
          onUpdate={handleJobUpdate}
          onDelete={handleJobDeleteRequest}
          onAddWindow={() => setAddWindowOpen(true)}
          onOpenWindow={(win, idx) => setCurrentWindow({ win, idx })}
          onDuplicateWindow={handleWindowDuplicate}
          onReorderWindows={handleWindowsReorder}
          onConfirm={handleJobConfirm}
          onBackToReceived={handleJobBackToReceivedRequest}
          onComplete={handleJobComplete}
          onReopen={handleJobReopen}
          onAttachPO={handleAttachPO}
          poUploading={poUploading}
          onDeductStock={handleOpenDeductModal}
          onRecordOffcuts={() => setRecordOffcutsOpen(true)}
          pendingOffcutCount={pendingOffcuts.length}
        />
      )
    }

    if (navTab === 'bom') {
      return <JobList jobs={jobs} products={products} onOpen={setCurrentJob} onNew={handleNewJob} onUploadPO={handleCreateJobFromPO} poUploading={poUploading} />
    }

    // Product detail
    if (navTab === 'products' && currentProduct) {
      return (
        <ProductDetail
          product={currentProduct}
          productComponents={productComponentsMap[currentProduct.id] || []}
          allComponents={components}
          suppliers={suppliers}
          kinds={componentKinds}
          optionDefs={productOptions[currentProduct.product_type] || []}
          widthSchedules={widthSchedules}
          fabricCategories={fabricCategories}
          onSaveSchedule={handleSaveWidthSchedule}
          onDeleteSchedule={handleDeleteWidthSchedule}
          onBack={() => setCurrentProduct(null)}
          onUpdateProduct={handleProductUpdate}
          onAddComponent={handleAddProductComponent}
          onUpdateComponent={handleUpdateProductComponent}
          onRemoveComponent={handleRemoveProductComponent}
          onDuplicate={handleDuplicate}
          onDeleteProduct={handleProductDelete}
          onExportPricing={(fabric) => handleExportPricing(currentProduct, fabric)}
          pricingExporting={pricingExporting}
          saving={prodSaving}
        />
      )
    }

    if (navTab === 'products') {
      return <ProductList products={activeProducts} onOpen={setCurrentProduct} onNew={handleNewProduct} />
    }

    // Admin — a hub of config sections, each with its own back button
    if (navTab === 'admin' && adminSection === 'options') {
      return (
        <OptionsAdmin
          productOptions={productOptions}
          onBack={() => setAdminSection(null)}
          onSaveOption={handleSaveOption}
          onDeleteOption={handleDeleteOption}
          onSaveChoice={handleSaveChoice}
          onDeleteChoice={handleDeleteChoice}
          saving={prodSaving}
        />
      )
    }

    if (navTab === 'admin' && adminSection === 'fabric_categories') {
      return (
        <FabricCategoriesAdmin
          categories={fabricCategories}
          components={components}
          onBack={() => setAdminSection(null)}
          onSaveGrids={handleSaveFabricGrids}
          onTagFabrics={handleTagFabrics}
          saving={prodSaving}
        />
      )
    }

    if (navTab === 'admin' && adminSection === 'company_details') {
      return (
        <CompanyDetailsAdmin
          company={companyDetails}
          onBack={() => setAdminSection(null)}
          onSave={handleSaveCompanyDetails}
          saving={prodSaving}
        />
      )
    }

    if (navTab === 'admin' && adminSection === 'deleted_records') {
      return (
        <DeletedRecordsAdmin
          records={deletedRecords || []}
          available={deletedRecords !== null}
          onBack={() => setAdminSection(null)}
          onRestore={handleRestoreRecord}
          restoring={restoringId}
        />
      )
    }

    if (navTab === 'admin' && adminSection === 'component_kinds') {
      // The real vocabulary rows, not kindOptions — this screen renames and
      // deletes by id, and kindOptions carries id-less stand-ins for kinds a
      // component holds that the table doesn't know about yet.
      return (
        <ComponentKindsAdmin
          kinds={componentKinds}
          components={components}
          onBack={() => setAdminSection(null)}
          onSave={handleSaveKind}
          onDelete={handleDeleteKind}
          saving={prodSaving}
        />
      )
    }

    if (navTab === 'admin') {
      return <AdminHome onOpenOptions={() => setAdminSection('options')}
               onOpenCompanyDetails={() => setAdminSection('company_details')}
               onOpenFabricCategories={() => setAdminSection('fabric_categories')}
               onOpenComponentKinds={() => setAdminSection('component_kinds')}
               onOpenDeletedRecords={() => setAdminSection('deleted_records')} />
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
          kinds={componentKinds}
          onEditStock={handleOpenStockEdit}
          onReceiveBars={handleReceiveBars}
          onStocktake={handleStocktake}
          onAddOffcut={handleAddBar}
          onEditOffcut={handleEditBar}
          purchaseOrders={purchaseOrders}
          poLinesMap={poLinesMap}
          onAddToPO={handleAddToPO}
        />
      )
    }

    // Purchase order detail
    if (navTab === 'orders' && currentPO) {
      return (
        <PurchaseOrderDetail
          po={currentPO}
          lines={poLinesMap[currentPO.id] || []}
          onBack={() => setCurrentPO(null)}
          onDelete={handlePODelete}
          onAddLines={() => setAddLinesOpen(true)}
          onUpdateLine={handleUpdatePOLine}
          onRemoveLine={handleRemovePOLine}
          onStatusChange={handlePOStatusChange}
          onExport={handleExportPO}
          onExportPdf={handleExportPOPdf}
          onTogglePricing={handleTogglePricing}
          onReceive={() => setReceivePOOpen(true)}
          onDuplicate={handlePODuplicate}
          exporting={poExporting}
        />
      )
    }

    if (navTab === 'orders') {
      return (
        <PurchaseOrderList
          purchaseOrders={purchaseOrders.map(po => ({ ...po, lines: poLinesMap[po.id] || [] }))}
          onOpen={setCurrentPO}
          onNew={() => setPoModalOpen(true)}
        />
      )
    }

    // Component library
    return (
      <ComponentLibrary
        components={components}
        suppliers={suppliers}
        componentUsage={componentUsage}
        stockMap={stockMap}
        onEdit={(c) => { setEditingComp(c); setCompModalOpen(true) }}
        onAdd={() => { setEditingComp(null); setCompModalOpen(true) }}
      />
    )
  }

  // Hide bottom nav when drilling into details
  const showBottomNav = route === 'manufacturing'
    && !currentProduct && !currentJob && !currentWindow && !currentSupplier && !currentPO && !adminSection

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
            <button key={tab.id}
              onClick={() => tab.href ? (window.location.href = tab.href) : setNavTab(tab.id)}
              style={{
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
        kinds={kindOptions}
        fabricCategories={fabricCategories}
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

      <BackToReceivedModal
        open={!!revertPlan}
        job={revertPlan?.job}
        plan={revertPlan?.plan}
        working={reverting}
        onClose={() => setRevertPlan(null)}
        onConfirm={handleJobBackToReceivedConfirm}
      />

      <DeleteJobModal
        open={!!deleteJobPlan}
        job={deleteJobPlan?.job}
        plan={deleteJobPlan?.plan}
        deleting={deletingJob}
        onClose={() => setDeleteJobPlan(null)}
        onConfirm={handleJobDeleteConfirm}
      />

      <AddWindowModal
        open={addWindowOpen}
        windowNumber={(currentJob?.windows || []).length + 1}
        jobType={currentJob?.product_type || null}
        products={activeProducts}
        productComponentsMap={productComponentsMap}
        productOptions={productOptions}
        allComponents={components}
        fabricCategories={fabricCategories}
        jobSubMap={substitutionsFor(currentJob, null, components)}
        stockMap={stockMap}
        suppliers={suppliers}
        kinds={componentKinds}
        onClose={() => setAddWindowOpen(false)}
        onAdd={handleAddWindow}
      />

      <PurchaseOrderModal
        open={poModalOpen}
        suppliers={suppliers}
        onClose={() => setPoModalOpen(false)}
        onCreate={handleNewPO}
        creating={poCreating}
      />

      <AddPOLinesModal
        open={addLinesOpen}
        supplier={suppliers.find(s => s.id === currentPO?.supplier_id)}
        components={components}
        stockMap={stockMap}
        existingKeys={new Set((poLinesMap[currentPO?.id] || []).map(l => `${l.component_id}__${l.colour_variant?.suffix || ''}`))}
        onClose={() => setAddLinesOpen(false)}
        onAdd={handleAddPOLines}
        adding={addingLines}
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

      {currentPO && (
        <ReceivePOModal
          open={receivePOOpen}
          po={currentPO}
          lines={poLinesMap[currentPO.id] || []}
          onClose={() => setReceivePOOpen(false)}
          onReceive={handleReceivePO}
          saving={receiving}
        />
      )}

      <AddToPOModal
        open={addToPOOpen}
        component={addToPOComp}
        colourVariant={addToPOColour}
        supplier={suppliers.find(s => s.id === addToPOComp?.supplier_id) || null}
        po={openPOFor(purchaseOrders, addToPOComp?.supplier_id)}
        willCreate={!openPOFor(purchaseOrders, addToPOComp?.supplier_id)}
        stockMap={stockMap}
        onClose={() => setAddToPOOpen(false)}
        onAdd={handleSaveAddToPO}
        saving={poCreating}
      />

      <StocktakeModal
        open={stocktakeOpen}
        component={stocktakeComp}
        colourVariant={stocktakeColour}
        stock={stocktakeStock}
        offcuts={stockBars.filter(b =>
          b.component_id === stocktakeComp?.id &&
          b.status === 'available' &&
          (b.colour_variant?.suffix || null) === (stocktakeColour?.suffix || null))}
        onClose={() => setStocktakeOpen(false)}
        onSave={handleSaveStocktake}
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

      {currentJob && (
        <RecordOffcutsModal
          open={recordOffcutsOpen}
          job={currentJob}
          pending={pendingOffcuts}
          onClose={() => setRecordOffcutsOpen(false)}
          onSave={handleRecordOffcuts}
          saving={deductSaving}
        />
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}