-- Add consolidated user settings/profile fields for Settings page
ALTER TABLE users
ADD COLUMN IF NOT EXISTS default_rig_type TEXT,
ADD COLUMN IF NOT EXISTS default_rig_length_m NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS default_travel_pace TEXT CHECK (default_travel_pace IN ('leisurely', 'moderate', 'fast')),
ADD COLUMN IF NOT EXISTS default_pet_friendly_required BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS default_avoid_gravel_roads BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS default_stay_preference TEXT,
ADD COLUMN IF NOT EXISTS default_budget_preference TEXT,
ADD COLUMN IF NOT EXISTS timezone TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_users_default_travel_pace ON users(default_travel_pace);
