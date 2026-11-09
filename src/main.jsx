import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import HomePage from './pages/HomePage.jsx'
import SubmitPO from './pages/SubmitPO.jsx'
import RomanBlinds from './pages/RomanBlinds.jsx'
import { READ_ONLY } from './lib/supabase'
import './index.css'

/**
 * Path-based routing, still without a router library.
 *
 *   /               the tiles — needs no data, so it paints immediately
 *   /submit         the PO portal, standalone
 *   /romanblinds    the roman blind calculator, standalone
 *   /manufacturing  the workshop app; everything under it (a job, an order,
 *                   a setup section) is addressed by lib/route.js
 *   /admin          old address for setup — now a section of the workshop app
 *
 * Routed on the FIRST path segment, so /manufacturing/jobs/<id> is the app.
 * Anything unrecognised falls back to the tiles rather than to the app, so a
 * mistyped URL lands somewhere a person can navigate from.
 */
const segment = window.location.pathname.split('/').filter(Boolean)[0] || ''

const ROUTES = {
  '':              () => <HomePage />,
  'submit':        () => <SubmitPO />,
  'romanblinds':   () => <RomanBlinds />,
  'manufacturing': () => <App />,
  'admin':         () => <App />,
}

const render = ROUTES[segment] || ROUTES['']

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {READ_ONLY && (
      <div className="read-only-banner">
        Read-only preview: you can click anything, but nothing is saved.
      </div>
    )}
    {render()}
  </StrictMode>,
)
