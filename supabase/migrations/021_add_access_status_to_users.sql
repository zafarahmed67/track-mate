-- Add access_status to users table for purchase-gated access control
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS access_status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (access_status IN ('active', 'inactive', 'suspended'));

-- Existing users who have a completed purchase should be marked active
UPDATE users u
SET access_status = 'active'
WHERE EXISTS (
  SELECT 1 FROM purchases p
  WHERE p.user_id = u.id
    AND p.payment_status = 'paid'
);

-- Index for fast gate checks
CREATE INDEX IF NOT EXISTS idx_users_access_status ON users(access_status);
