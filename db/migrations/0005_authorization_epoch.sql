BEGIN;
CREATE TABLE admin.authorization_state(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),epoch bigint NOT NULL DEFAULT 1 CHECK(epoch>0));
INSERT INTO admin.authorization_state(singleton) VALUES(true);
REVOKE ALL ON admin.authorization_state FROM PUBLIC;
COMMIT;
