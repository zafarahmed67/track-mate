-- Add 'saved' as a valid trip status
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_status_check;
ALTER TABLE trips ADD CONSTRAINT trips_status_check CHECK (status IN ('planned', 'saved', 'in_progress', 'completed', 'cancelled'));
