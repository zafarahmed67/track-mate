import { createClient } from "@supabase/supabase-js"

const supabaseUrl = "https://dfxcpqgxiatgnnuxbqei.supabase.co";
const supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmeGNwcWd4aWF0Z25udXhicWVpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzAxODAxNCwiZXhwIjoyMDg4NTk0MDE0fQ.4OuQIcrY97biGVAnPp7S4h1h1O2XsLRws3t4AB9tDc0";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

const email = process.argv[2] || "test@yopmail.com"

console.log(`Generating magic link for: ${email}\n`)

async function generateMagicLink() {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    email,
    type: "magiclink",
  })

  if (error) {
    console.error("Error:", error.message)
    return
  }


  console.log("Magic link generated successfully!", data);

  console.log("=== MAGIC LINK ===")
  console.log(data.properties?.action_link || "No action_link found")
  console.log("==================\n")
  
  if (data.properties?.hashed_token) {
    const anonKey = "sb_publishable_A1XSkJ1eQeP_WH7MQBgs2g_5sZaqKwW"
    const manualLink = `${supabaseUrl}/auth/v1/verify?token=${data.properties.hashed_token}&type=magiclink&redirect_to=${encodeURIComponent(supabaseUrl)}&apikey=${anonKey}`
    console.log("=== MANUAL LINK ===")
    console.log(manualLink)
    console.log("==================\n")
  }
}

generateMagicLink()
