-- Create stops table
CREATE TABLE IF NOT EXISTS stop_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stop_id UUID REFERENCES stops(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (optional - enable if you want row-level security)
ALTER TABLE stop_tags ENABLE ROW LEVEL SECURITY;

-- Create indexes for common tag lookups
CREATE INDEX IF NOT EXISTS idx_stop_tags_stop_id ON stop_tags(stop_id);
CREATE INDEX IF NOT EXISTS idx_stop_tags_tag ON stop_tags(tag);
