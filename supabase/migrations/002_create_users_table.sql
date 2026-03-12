-- Create stops table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('customer', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (optional - enable if you want row-level security)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create index on role for faster filters
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
