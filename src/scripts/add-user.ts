import { supabaseAdmin } from "../config/supabase"

async function main() {
  if (!supabaseAdmin) {
    console.error("Supabase admin client not initialized")
    process.exit(1)
  }

  const email = "muzammilsafdarofficial@gmail.com"
  
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", email)
    .single()
    
  if (existing) {
    console.log("User already exists:", existing.id)
    return
  }

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

  console.log("User created:", data.id)
}

main()
