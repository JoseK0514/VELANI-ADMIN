BEGIN;
CREATE TABLE admin_journal.authorization_state(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),epoch bigint NOT NULL DEFAULT 1 CHECK(epoch>0),recovery_pending boolean NOT NULL DEFAULT true,root_fingerprints jsonb,CHECK(recovery_pending OR root_fingerprints IS NOT NULL));
INSERT INTO admin_journal.authorization_state(singleton) VALUES(true);
REVOKE ALL ON admin_journal.authorization_state FROM PUBLIC;
COMMIT;
