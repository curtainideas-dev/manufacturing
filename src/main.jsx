import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import HomePage from './pages/HomePage.jsx'
import SubmitPO from './pages/SubmitPO.jsx'
import './index.css'

/**
 * Path-based routing, still without a router library.
 *
 *   /               the four tiles — needs no data, so it paints immediately
 *   /submit         the public PO portal, standalone
 *   /track          where every order is up to (read-only)
 *   /manufacturing  the workshop screens — the day-to-day app
 *   /admin          setup, out of the workshop tabs and on its own
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
