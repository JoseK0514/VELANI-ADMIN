BEGIN;
CREATE SCHEMA velani_admin_projection;
REVOKE ALL ON SCHEMA velani_admin_projection FROM PUBLIC;
CREATE TABLE velani_admin_projection.binding(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),system text NOT NULL CHECK(system='velani'),environment text NOT NULL,project_id text NOT NULL,branch_id text NOT NULL,version int NOT NULL CHECK(version=1));
CREATE VIEW velani_admin_projection.requests WITH(security_barrier=true) AS
 SELECT r.id,r.created_at,concat_ws(' ',r.reference,r.fields->>'company',r.fields->>'project') AS search_text,lower(r.fields->>'email') AS search_email,
 jsonb_build_object('id',r.id,'reference',r.reference,'type',r.fields->>'type','company',r.fields->>'company','project',r.fields->>'project','urgency',r.fields->>'urgency','language',r.fields->>'language','createdAt',r.created_at,'expiresAt',r.expires_at,'contactProvenance','asserted','emailSubmissions',COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',o.kind,'state',o.status,'attempts',o.attempts) ORDER BY o.kind) FROM public.client_hub_outbox o WHERE o.request_id=r.id),'[]'::jsonb)) AS data
 FROM public.client_hub_requests r WHERE r.expires_at>statement_timestamp() AND r.created_at+interval '90 days'>statement_timestamp();
CREATE VIEW velani_admin_projection.request_details WITH(security_barrier=true) AS
 SELECT r.id,r.created_at,r.search_text,r.search_email,r.data || jsonb_build_object('name',s.fields->>'name','email',s.fields->>'email','description',s.fields->>'description') AS data
 FROM velani_admin_projection.requests r JOIN public.client_hub_requests s ON s.id=r.id;
REVOKE ALL ON ALL TABLES IN SCHEMA velani_admin_projection FROM PUBLIC;
COMMIT;
