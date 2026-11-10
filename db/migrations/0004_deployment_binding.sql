BEGIN;
CREATE TABLE admin.deployment_binding(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),environment text NOT NULL CHECK(environment IN('test','staging','production')),project_id text NOT NULL,branch_id text NOT NULL,journal_project_id text NOT NULL,journal_branch_id text NOT NULL,CHECK(project_id<>journal_project_id));
REVOKE ALL ON admin.deployment_binding FROM PUBLIC;
COMMIT;
