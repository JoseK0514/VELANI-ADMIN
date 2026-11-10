BEGIN;
-- Both defaults must share one timestamp: volatile clock_timestamp() can differ
-- by microseconds and violate the exact ninety-day upper bound on insertion.
ALTER TABLE admin.clients ALTER COLUMN created_at SET DEFAULT statement_timestamp(),ALTER COLUMN prospect_expires_at SET DEFAULT statement_timestamp()+interval '90 days';
COMMIT;
