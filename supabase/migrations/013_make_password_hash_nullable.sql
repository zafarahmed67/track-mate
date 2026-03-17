-- Make password_hash nullable for magic link users
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
