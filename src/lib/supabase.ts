import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabasePublishedKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHED_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabase = createClient(supabaseUrl, supabasePublishedKey)

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)