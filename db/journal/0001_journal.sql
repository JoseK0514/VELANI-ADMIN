BEGIN;
CREATE SCHEMA admin_journal;
REVOKE ALL ON SCHEMA admin_journal FROM PUBLIC;
CREATE TABLE admin_journal.deletions(sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,entity_type text NOT NULL CHECK(entity_type IN('client','case')),entity_id uuid NOT NULL,deleted_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(entity_type,entity_id));
REVOKE ALL ON ALL TABLES IN SCHEMA admin_journal FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA admin_journal FROM PUBLIC;
COMMIT;
