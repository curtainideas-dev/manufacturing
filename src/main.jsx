import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import HomePage from './pages/HomePage.jsx'
import SubmitPO from './pages/SubmitPO.jsx'
import RomanBlinds from './pages/RomanBlinds.jsx'
import './index.css'

/**
 * Path-based routing, still without a router library.
 *
 *   /               the five tiles — needs no data, so it paints immediately
 *   /submit         the public PO portal, standalone
 *   /track          where every order is up to (read-only)
 *   /manufacturing  the workshop screens — the day-to-day app
 *   /romanblinds    the roman blind calculator, standalone
 *   /admin          setup, out of the workshop tabs and on its own
 *
 * /romanblinds is standalone like /submit: it reads and writes nothing, so it
 * doesn't wait on App's data load.
 *
 * /track, /manufacturing and /admin are all App, because App owns every
 * Supabase read in this codebase and splitting them would mean loading the
 * same data three ways. It takes the route and decides what to show.
 *
 * Anything unrecognised falls back to the tiles rather than to the app, so a
 * mistyped URL lands somewhere a person can navigate from.
 */
const segment = window.location.pathname.replace(/\/+$/, '').split('/').pop() || ''

const ROUTES = {
  '':              () => <HomePage />,
  'submit':        () => <SubmitPO />,
  'romanblinds':   () => <RomanBlinds />,
  'track':         () => <App route="track" />,
  'manufacturing': () => <App route="manufacturing" />,
  'admin':         () => <App route="admin" />,
}

const render = ROUTES[segment] || ROUTES['']

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {render()}
  </StrictMode>,
)
