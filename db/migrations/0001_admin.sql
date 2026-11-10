BEGIN;
CREATE SCHEMA admin;
REVOKE ALL ON SCHEMA admin FROM PUBLIC;
CREATE TABLE admin.schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE admin.actors(
 id uuid PRIMARY KEY,singleton boolean NOT NULL DEFAULT true UNIQUE CHECK(singleton),
 email text NOT NULL CHECK(email=lower(email)),google_subject text UNIQUE,
 enabled boolean NOT NULL DEFAULT false,generation bigint NOT NULL DEFAULT 1 CHECK(generation>0),
 enrollment_until timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE admin.credentials(
 id text PRIMARY KEY,actor_id uuid NOT NULL REFERENCES admin.actors(id),public_key bytea NOT NULL,
 counter bigint NOT NULL DEFAULT 0 CHECK(counter>=0),transports jsonb NOT NULL DEFAULT '[]',
 device_type text NOT NULL,backed_up boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),revoked_at timestamptz
);
CREATE TABLE admin.pending_logins(
 hash text PRIMARY KEY,actor_id uuid NOT NULL REFERENCES admin.actors(id),generation bigint NOT NULL,
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE admin.sessions(
 hash text PRIMARY KEY,actor_id uuid NOT NULL REFERENCES admin.actors(id),generation bigint NOT NULL,
 factor_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,idle_expires_at timestamptz NOT NULL,
 revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE admin.challenges(
 id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN('oidc','authenticate','register','step_up')),
 binding_hash text NOT NULL,actor_id uuid REFERENCES admin.actors(id),generation bigint,
 challenge text NOT NULL,data_ciphertext text,expires_at timestamptz NOT NULL,used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX challenge_expiry ON admin.challenges(expires_at);
CREATE TABLE admin.clients(
 id uuid PRIMARY KEY,display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 160),
 relationship_state text NOT NULL DEFAULT 'prospect' CHECK(relationship_state IN('prospect','active','inactive')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 prospect_expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '90 days',
 engaged_at timestamptz,closed_at timestamptz,delete_after timestamptz,
 CHECK(relationship_state<>'active' OR(engaged_at IS NOT NULL AND closed_at IS NULL AND delete_after IS NULL)),
 CHECK(engaged_at IS NULL OR relationship_state<>'prospect'),
 CHECK(relationship_state<>'inactive' OR engaged_at IS NULL OR(closed_at IS NOT NULL AND delete_after IS NOT NULL)),
 CHECK(prospect_expires_at<=created_at+interval '90 days')
);
CREATE TABLE admin.contacts(
 id uuid PRIMARY KEY,client_id uuid NOT NULL REFERENCES admin.clients(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),email text NOT NULL CHECK(email=lower(email) AND length(email)<=254),phone text,
 language text NOT NULL CHECK(language IN('en','es')),active boolean NOT NULL DEFAULT true,
 provenance text NOT NULL CHECK(provenance IN('asserted','source_enrollment','operator_verified')),
 source_id uuid,verified_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX active_contact_email ON admin.contacts(client_id,email) WHERE active;
CREATE TABLE admin.projects(
 id uuid PRIMARY KEY,client_id uuid NOT NULL REFERENCES admin.clients(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),stage text NOT NULL CHECK(stage IN('planned','in_progress','waiting_client','completed','canceled')),
 target_date date,version bigint NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE admin.cases(
 id uuid PRIMARY KEY,source_request_id uuid NOT NULL UNIQUE,reference text NOT NULL,
 source_created_at timestamptz NOT NULL,source_expires_at timestamptz NOT NULL,purge_by timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'new' CHECK(state IN('new','reviewing','waiting_client','resolved','closed')),
 client_id uuid REFERENCES admin.clients(id) ON DELETE SET NULL,project_id uuid REFERENCES admin.projects(id) ON DELETE SET NULL,
 follow_up_at timestamptz,version bigint NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(purge_by<=source_created_at+interval '90 days'),CHECK(source_expires_at<=purge_by)
);
CREATE TABLE admin.source_links(
 id uuid PRIMARY KEY,client_id uuid NOT NULL REFERENCES admin.clients(id) ON DELETE CASCADE,
 system text NOT NULL CHECK(system='nevora'),environment text NOT NULL CHECK(environment IN('production','staging','test')),
 source_id uuid NOT NULL,source_revision bigint NOT NULL CHECK(source_revision>0),incarnation bigint NOT NULL CHECK(incarnation>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(system,environment,source_id)
);
CREATE TABLE admin.classifications(
 source_id uuid NOT NULL,system text NOT NULL,environment text NOT NULL,
 classification text NOT NULL CHECK(classification IN('internal','real','unclassified')),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(system,environment,source_id)
);
CREATE TABLE admin.notes(
 id uuid PRIMARY KEY,client_id uuid REFERENCES admin.clients(id) ON DELETE CASCADE,
 project_id uuid REFERENCES admin.projects(id) ON DELETE CASCADE,case_id uuid REFERENCES admin.cases(id) ON DELETE CASCADE,
 text text NOT NULL CHECK(length(text) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(num_nonnulls(client_id,project_id,case_id)=1)
);
CREATE TABLE admin.commands(
 actor_id uuid NOT NULL REFERENCES admin.actors(id),operation_id uuid NOT NULL,request_hash text NOT NULL,
 receipt jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_id,operation_id)
);
CREATE TABLE admin.audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id uuid REFERENCES admin.actors(id),
 action text NOT NULL,entity_type text NOT NULL,entity_id text,reason_code text,result text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE admin.limits(key text PRIMARY KEY,hits integer NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE admin.retention_holds(
 entity_type text NOT NULL CHECK(entity_type IN('client')),entity_id uuid NOT NULL,
 owner_ref text NOT NULL,reason_code text NOT NULL,review_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(entity_type,entity_id)
);
CREATE TABLE admin.deletions(
 sequence bigint PRIMARY KEY,entity_type text NOT NULL CHECK(entity_type IN('client','case')),
 entity_id uuid NOT NULL,deleted_at timestamptz NOT NULL
);
CREATE TABLE admin.restore_barrier(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),applied_sequence bigint NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
INSERT INTO admin.restore_barrier(singleton) VALUES(true);
CREATE TABLE admin.maintenance_state(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),last_success_at timestamptz,removed_clients integer,removed_cases integer);
INSERT INTO admin.maintenance_state(singleton) VALUES(true);
CREATE INDEX client_retention ON admin.clients(prospect_expires_at,delete_after);
CREATE INDEX case_retention ON admin.cases(source_expires_at,purge_by);
REVOKE ALL ON ALL TABLES IN SCHEMA admin FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA admin FROM PUBLIC;
COMMIT;
