import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import SubmitPO from './pages/SubmitPO.jsx'
import './index.css'

// Simple path-based routing (no router lib): /submit is the public PO portal.
const isSubmit = window.location.pathname.replace(/\/+$/, '').endsWith('/submit')
const Root = isSubmit ? SubmitPO : App

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
