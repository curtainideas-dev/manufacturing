/**
 * Server-side Supabase client for the notification endpoints.
 *
 * Separate from src/lib/supabase.js because that one reads import.meta.env
 * (browser) and this runs in Node.
 *
 * Important: Vercel does NOT load the repo's committed .env into the function
 * runtime. Vite reads that file at build time for the browser bundle only, so
 * these must exist as Vercel project environment variables or every query here
 * fails. Prefers the service-role key so scheduled sweeps keep working if RLS
 * is ever switched on; falls back to the anon key, which is all the app uses
 * today.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

// Reported by the endpoints instead of letting createClient throw an opaque
// "supabaseUrl is required" at import time, which surfaces as a bare 500.
export const configError = (!url || !key)
  ? 'Supabase not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) on this Vercel project'
  : null

export const supabase = configError ? null : createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
