BEGIN;
CREATE TABLE admin.business_records(
 id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN('inquiry','plan','milestone','expense','budget')),
 client_id uuid REFERENCES admin.clients(id) ON DELETE CASCADE,
 project_id uuid REFERENCES admin.projects(id) ON DELETE CASCADE,
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz DEFAULT clock_timestamp()+interval '90 days'
);
CREATE UNIQUE INDEX business_inquiry_reference ON admin.business_records((data->>'channel'),(data->>'reference')) WHERE kind='inquiry';
CREATE UNIQUE INDEX business_project_plan ON admin.business_records(project_id) WHERE kind='plan';
CREATE UNIQUE INDEX business_budget_period ON admin.business_records((data->>'product'),(data->>'month')) WHERE kind='budget';
CREATE INDEX business_parent ON admin.business_records(client_id,project_id);
CREATE TABLE admin.business_feeds(
 system text PRIMARY KEY CHECK(system IN('finance','health')),
 environment text NOT NULL CHECK(environment IN('test','staging','production')),
 account_id text NOT NULL,observed_at timestamptz NOT NULL,valid_until timestamptz NOT NULL,
 coverage text NOT NULL CHECK(coverage IN('complete','partial')),
 provenance text NOT NULL CHECK(provenance IN('operator_recorded','provider_verified')),
 item_count integer NOT NULL CHECK(item_count BETWEEN 0 AND 5000),
 history_from date,history_through date,
 content_hash text NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(valid_until>observed_at AND valid_until<=observed_at+interval '1 day'),
 CHECK(system<>'finance' OR (history_from IS NOT NULL AND history_through IS NOT NULL AND history_from<=history_through))
);
CREATE TABLE admin.business_observations(
 system text NOT NULL REFERENCES admin.business_feeds(system) ON DELETE CASCADE,
 source_id text NOT NULL,client_id uuid NOT NULL REFERENCES admin.clients(id) ON DELETE CASCADE,
 project_id uuid REFERENCES admin.projects(id) ON DELETE CASCADE,
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),PRIMARY KEY(system,source_id)
);
CREATE FUNCTION admin.guard_business_record_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW.kind<>OLD.kind OR NEW.created_at<>OLD.created_at OR (OLD.expires_at IS NOT NULL AND (NEW.expires_at IS NULL OR NEW.expires_at>OLD.expires_at)) THEN
  RAISE EXCEPTION 'immutable_business_identity';
 END IF;
 IF (NEW.client_id IS DISTINCT FROM OLD.client_id AND (OLD.kind<>'inquiry' OR OLD.client_id IS NOT NULL)) OR (NEW.project_id IS DISTINCT FROM OLD.project_id AND (OLD.kind<>'inquiry' OR OLD.project_id IS NOT NULL)) THEN
  RAISE EXCEPTION 'immutable_business_parent';
 END IF;
 IF OLD.kind='inquiry' AND (NEW.data->>'channel' IS DISTINCT FROM OLD.data->>'channel' OR NEW.data->>'reference' IS DISTINCT FROM OLD.data->>'reference' OR NEW.data->>'receivedAt' IS DISTINCT FROM OLD.data->>'receivedAt') THEN
  RAISE EXCEPTION 'immutable_inquiry_source';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_business_identity BEFORE UPDATE ON admin.business_records FOR EACH ROW EXECUTE FUNCTION admin.guard_business_record_identity();
REVOKE ALL ON admin.business_records,admin.business_feeds,admin.business_observations FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.guard_business_record_identity() FROM PUBLIC;
COMMIT;
