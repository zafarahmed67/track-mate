-- Update users table with webhook fields
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS contact_id TEXT,
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS full_name TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS timezone TEXT,
ADD COLUMN IF NOT EXISTS company_name TEXT,
ADD COLUMN IF NOT EXISTS contact_type TEXT,
ADD COLUMN IF NOT EXISTS location JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS order_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS workflow JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add unique constraint on contact_id if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'users_contact_id_key'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_contact_id_key UNIQUE (contact_id);
    END IF;
END $$;

-- Create index on contact_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_contact_id ON users(contact_id);
