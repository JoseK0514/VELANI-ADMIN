BEGIN;
ALTER TABLE admin.actors ADD COLUMN pending_google_subject text,ADD COLUMN pending_identity_id uuid,ADD COLUMN pending_identity_expires_at timestamptz;
COMMIT;
