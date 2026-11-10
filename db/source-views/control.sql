BEGIN;
CREATE SCHEMA velani_admin_projection;
REVOKE ALL ON SCHEMA velani_admin_projection FROM PUBLIC;
CREATE TABLE velani_admin_projection.binding(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),system text NOT NULL CHECK(system='control'),environment text NOT NULL,project_id text NOT NULL,branch_id text NOT NULL,version int NOT NULL CHECK(version=1));
CREATE VIEW velani_admin_projection.workplaces WITH(security_barrier=true) AS
 SELECT w.id,w.created_at,w.canonical_origin AS search_text,NULL::text AS search_email,
 jsonb_build_object('id',w.id,'origin',w.canonical_origin,'environment',b.environment,'incarnation',w.incarnation::text,'revision',w.revision::text,'lifecycle',w.lifecycle,'createdAt',w.created_at) AS data
 FROM nevora_onboarding.workspace_registry w JOIN velani_admin_projection.binding b ON w.environment=CASE b.environment WHEN 'staging' THEN 'development' ELSE b.environment END;
CREATE VIEW velani_admin_projection.workplace_details WITH(security_barrier=true) AS
 SELECT w.id,w.created_at,w.search_text,w.search_email,w.data || jsonb_build_object('provisioning',COALESCE((SELECT jsonb_agg(jsonb_build_object('state',p.state,'observedAt',p.updated_at) ORDER BY p.updated_at) FROM nevora_onboarding.provisioning_operations p WHERE p.workspace_id=w.id),'[]'::jsonb)) AS data FROM velani_admin_projection.workplaces w;
CREATE VIEW velani_admin_projection.registrations WITH(security_barrier=true) AS
 SELECT r.id,r.created_at,NULL::text AS search_text,NULL::text AS search_email,
 jsonb_build_object('id',r.id,'stage',r.state,'language',r.locale,'version',r.version::text,'verifiedAt',r.verified_at,'expiresAt',r.expires_at,'createdAt',r.created_at) AS data
 FROM nevora_onboarding.registrations r JOIN velani_admin_projection.binding b ON r.environment=CASE b.environment WHEN 'staging' THEN 'development' ELSE b.environment END WHERE r.state<>'READY' AND r.expires_at>statement_timestamp();
REVOKE ALL ON ALL TABLES IN SCHEMA velani_admin_projection FROM PUBLIC;
COMMIT;
