/**
 * Server-side Supabase client for the notification endpoints.
 *
 * Separate from src/lib/supabase.js because that one reads import.meta.env
 * (browser) and this runs in Node. Prefers the service-role key so scheduled
 * sweeps keep working if RLS is ever switched on; falls back to the anon key,
 * which is all the app uses today.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
