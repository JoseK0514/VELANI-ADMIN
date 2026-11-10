BEGIN;
CREATE SCHEMA velani_admin_projection;
REVOKE ALL ON SCHEMA velani_admin_projection FROM PUBLIC;
CREATE TABLE velani_admin_projection.binding(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),system text NOT NULL CHECK(system='catalog'),environment text NOT NULL,project_id text NOT NULL,branch_id text NOT NULL,version int NOT NULL CHECK(version=1));
CREATE VIEW velani_admin_projection.catalog WITH(security_barrier=true) AS
 SELECT a.id,a.created_at,a.profile->>'businessName' AS search_text,lower(a.email) AS search_email,
 jsonb_build_object('id',a.id,'enrollmentName',a.profile->>'businessName','enrollmentEmail',a.email,'contactProvenance','source_enrollment','environment',i.environment,'incarnation',i.incarnation::text,'trialStartedAt',b.trial_started_at,'trialEndsAt',b.trial_ends_at,'paidThrough',b.paid_through,'pastDueSince',b.past_due_since,'subscriptionStatus',b.subscription_status,'planKey',b.plan_key,'observedAt',b.sync_at,'createdAt',a.created_at) AS data
 FROM commerce.accounts a JOIN commerce.businesses b ON b.id=a.id JOIN commerce.external_installations i ON i.business_id=a.id JOIN velani_admin_projection.binding s ON s.environment=i.environment;
REVOKE ALL ON ALL TABLES IN SCHEMA velani_admin_projection FROM PUBLIC;
COMMIT;
