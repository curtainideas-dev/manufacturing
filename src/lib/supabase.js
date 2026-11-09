import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Read-only mode, for looking around against the live database safely.
 *
 * Set VITE_READ_ONLY=true (the "dev (read-only)" launch config does) and every
 * request that would change something — insert, update, delete, upload — is
 * refused before it leaves the browser. Reads still go through, so every
 * screen shows real data. The app reports each refusal the same way it reports
 * any failed save, so nothing looks saved that wasn't.
 */
export const READ_ONLY = import.meta.env.VITE_READ_ONLY === 'true'

const readOnlyFetch = (input, init = {}) => {
  const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (method === 'GET' || method === 'HEAD') return fetch(input, init)
  console.warn(`[read-only] blocked ${method} ${String(input instanceof Request ? input.url : input).split('?')[0]}`)
  return Promise.resolve(new Response(
    JSON.stringify({ message: 'Read-only preview: changes are not saved', code: 'READ_ONLY' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } },
  ))
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY,
  READ_ONLY ? { global: { fetch: readOnlyFetch } } : undefined)
