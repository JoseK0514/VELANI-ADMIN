/** Operator-reviewed grants for new dedicated databases only; no credentials. */
export function adminGrants(web:string,maintenance:string):string[]{
 for(const role of [web,maintenance])if(!/^velani_admin_(web|maintenance)(_[a-f0-9]{8,32})?$/.test(role))throw Error('invalid_runtime_role');
 const business=['clients','contacts','projects','cases','source_links','notes','commands','limits'];
 return [
 `GRANT USAGE ON SCHEMA admin TO ${web},${maintenance}`,
 `GRANT SELECT ON ALL TABLES IN SCHEMA admin TO ${maintenance}`,
 `GRANT SELECT ON admin.schema_migrations,admin.actors,admin.credentials,admin.sessions,admin.pending_logins,admin.challenges,admin.classifications,admin.retention_holds,admin.restore_barrier,admin.maintenance_state TO ${web}`,
 `GRANT SELECT,INSERT,UPDATE ON ${business.map(t=>'admin.'+t).join(',')} TO ${web}`,
 `GRANT INSERT ON admin.audit,admin.sessions,admin.pending_logins,admin.challenges,admin.credentials TO ${web}`,
 `GRANT UPDATE(revoked_at,idle_expires_at,factor_at) ON admin.sessions TO ${web}`,
 `GRANT UPDATE(used_at) ON admin.challenges TO ${web}`,
 `GRANT UPDATE(counter) ON admin.credentials TO ${web}`,
 `GRANT USAGE ON SEQUENCE admin.audit_id_seq TO ${web},${maintenance}`,
 `GRANT INSERT ON admin.audit,admin.deletions TO ${maintenance}`,
 `GRANT DELETE ON admin.clients,admin.cases,admin.commands,admin.audit,admin.limits,admin.challenges,admin.pending_logins,admin.sessions TO ${maintenance}`,
 `GRANT UPDATE ON admin.restore_barrier,admin.maintenance_state TO ${maintenance}`,
 ];
}
export function journalGrants(reader:string,writer:string):string[]{
 if(!/^velani_admin_journal_read(_[a-f0-9]{8,32})?$/.test(reader)||!/^velani_admin_journal_write(_[a-f0-9]{8,32})?$/.test(writer))throw Error('invalid_journal_role');
 return [`GRANT USAGE ON SCHEMA admin_journal TO ${reader},${writer}`,`GRANT SELECT ON admin_journal.deletions TO ${reader},${writer}`,`GRANT INSERT ON admin_journal.deletions TO ${writer}`,`GRANT USAGE ON SEQUENCE admin_journal.deletions_sequence_seq TO ${writer}`];
}
