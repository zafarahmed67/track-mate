import "dotenv/config"
import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"

async function main() {
  const migrationsPath = path.join(process.cwd(), "supabase/migrations")
  if (!fs.existsSync(migrationsPath)) {
    console.error("Migrations directory not found:", migrationsPath)
    process.exit(1)
  }

  const files = fs.readdirSync(migrationsPath).sort()
  if (files.length === 0) {
    console.log("No migration files found.")
    return
  }

  console.log("Applying Supabase migrations with CLI (linked project)...")
  const result = spawnSync(
    "npx",
    ["supabase", "db", "push", "--linked", "--include-all"],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
    }
  )

  if (result.error) {
    console.error("Failed to execute Supabase CLI:", result.error.message)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  console.log("\nAll migrations completed via Supabase CLI.")
}

main().catch(console.error)
