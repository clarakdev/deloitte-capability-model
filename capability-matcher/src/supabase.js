// supabase.js — initialises the Supabase client once and exports it.
// All database calls across the app import from this file.
// Credentials are stored in .env and never hardcoded here.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)