import { config } from "dotenv"
import path from "path"

config({ path: path.join(process.cwd(), ".env.local") })

import { supabaseAdmin } from "../config/supabase"

async function main() {
  if (!supabaseAdmin) {
    console.error("Supabase admin not initialized")
    process.exit(1)
  }

  const email = "muzammilsafdarofficial@gmail.com"
  
  // Check if exists
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("email", email)
    .single()
    
  if (existing) {
    console.log("User already exists:", existing)
    return
  }

  // Create user
  const { data, error } = await supabaseAdmin
    .from("users")
    .insert({
      email,
      role: "customer",
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error("Error:", error)
    return
  }

  console.log("User created:", data)
}

main()
