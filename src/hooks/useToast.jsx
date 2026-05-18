import { useState, useCallback } from 'react'

export function useToast() {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((msg, type = '') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2800)
  }, [])

  return { toasts, showToast }
}

export function ToastContainer({ toasts }) {
  // Only show the most recent toast
  const toast = toasts[toasts.length - 1]
  if (!toast) return null
  return (
    <div
      key={toast.id}
      className={`toast ${toast.type ? 'toast-' + toast.type : ''}`}
    >
      {toast.msg}
    </div>
  )
}
