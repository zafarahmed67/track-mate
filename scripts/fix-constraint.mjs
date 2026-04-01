import "dotenv/config"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function fixConstraint() {
  console.log("Attempting to fix trips_status_check constraint...")
  
  const { error } = await supabase.rpc("exec_sql", {
    sql: `
      ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_status_check;
      ALTER TABLE trips ADD CONSTRAINT trips_status_check CHECK (status IN ('planned', 'saved', 'in_progress', 'completed', 'cancelled'));
    `
  })
  
  if (error) {
    console.log("RPC method not available, trying direct query approach...")
    console.log("Error:", error.message)
    
    console.log("\nPlease run this SQL manually in your Supabase SQL editor:")
    console.log(`
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_status_check;
ALTER TABLE trips ADD CONSTRAINT trips_status_check CHECK (status IN ('planned', 'saved', 'in_progress', 'completed', 'cancelled'));
    `.trim())
  } else {
    console.log("Constraint updated successfully!")
  }
}

fixConstraint()
