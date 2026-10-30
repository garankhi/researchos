\set ON_ERROR_STOP on
-- v4.3 policy regressions. Disposable database only; all fixtures roll back.
BEGIN;
CREATE FUNCTION pg_temp.policy_assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Policy assertion failed: %',message; END IF; END $$;
CREATE FUNCTION pg_temp.policy_error(command text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
 BEGIN EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE;
   IF actual=expected THEN RETURN; END IF;
   RAISE EXCEPTION 'Expected %, got %: % / %',expected,actual,command,SQLERRM;
 END;
 RAISE EXCEPTION 'Expected % but succeeded: %',expected,command;
END $$;
DO $$
DECLARE
 admin1 uuid=gen_random_uuid(); admin2 uuid=gen_random_uuid(); owner1 uuid=gen_random_uuid();
 recipient uuid=gen_random_uuid(); student uuid=gen_random_uuid(); guest uuid=gen_random_uuid();
 work uuid=gen_random_uuid(); revision uuid=gen_random_uuid(); grp uuid=gen_random_uuid(); other_grp uuid=gen_random_uuid();
 log1 uuid=gen_random_uuid(); session1 uuid=gen_random_uuid(); actor_sql text;
 other_work uuid=gen_random_uuid(); doi_variant text;
BEGIN
 INSERT INTO users(id,user_type,email,full_name,department_unit) VALUES
 (admin1,'STAFF','policy-admin1@test.invalid','Admin One','FPTU'),
 (admin2,'STAFF','policy-admin2@test.invalid','Admin Two','FPTU'),
 (owner1,'FACULTY','policy-owner@test.invalid','Owner','FPTU'),
 (recipient,'FACULTY','policy-recipient@test.invalid','Recipient','FPTU'),
 (student,'STUDENT','policy-student@test.invalid','Student','FPTU'),
 (guest,'STAFF','policy-guest@test.invalid','Guest','FPTU');
 INSERT INTO user_role_assignments(user_id,role,grant_source) VALUES(admin1,'ADMIN','SYSTEM');
 PERFORM pg_temp.policy_error(format('SELECT assert_admin_removal_allowed(%L)',admin1),'23514');
 INSERT INTO user_role_assignments(user_id,role,granted_by) VALUES(admin2,'ADMIN',admin1);
 PERFORM assert_admin_removal_allowed(admin2);
 UPDATE user_role_assignments SET revoked_at=clock_timestamp(),revoked_by=admin1 WHERE user_id=admin2 AND role='ADMIN';
 PERFORM pg_temp.policy_error(format('SELECT assert_admin_removal_allowed(%L)',admin1),'23514');
 PERFORM pg_temp.policy_assert(is_admin(admin1) AND NOT is_admin(admin2),'last admin guard contract');
 RAISE NOTICE 'PASS last-active-admin management guard (backend must call before mutation)';

 INSERT INTO user_role_assignments(user_id,role,granted_by) VALUES(student,'RESEARCHER',admin1);
 INSERT INTO research_groups(id,code,name,lead_id) VALUES(grp,'policy-student-group','Student singleton',student),(other_grp,'policy-owner-group','Owner singleton',owner1);
 PERFORM pg_temp.policy_assert(can_manage_group(student,grp) AND NOT EXISTS(SELECT 1 FROM group_members WHERE group_id=grp),'granted student can lead singleton group');
 PERFORM pg_temp.policy_error(format('INSERT INTO research_groups(code,name,lead_id) VALUES(''policy-guest-group'',''Invalid'',%L)',guest),'23514');
 PERFORM pg_temp.policy_error(format('INSERT INTO research_groups(code,name,lead_id) VALUES(''policy-admin-only-group'',''Invalid'',%L)',admin1),'23514');

 INSERT INTO research_outputs(id,owner_id,created_by,doi,visibility) VALUES(work,owner1,owner1,'  HTTPS://DOI.ORG/10.1234/Policy.Article  ','FPTU_COMMUNITY');
 PERFORM pg_temp.policy_assert((SELECT doi='10.1234/policy.article' FROM research_outputs WHERE id=work),'DOI canonical form');
 PERFORM pg_temp.policy_error(format('INSERT INTO research_outputs(owner_id,doi) VALUES(%L,''DOI:10.1234/POLICY.ARTICLE'')',recipient),'23505');
 PERFORM pg_temp.policy_error(format('INSERT INTO research_outputs(owner_id,doi) VALUES(%L,''http://dx.doi.org/10.1234/POLICY.ARTICLE'')',recipient),'23505');
 FOREACH doi_variant IN ARRAY ARRAY[E'\t\r\nHTTPS://DOI.ORG/10.1234/POLICY.ARTICLE\r\n\t',
   E'\nDOI:\t10.1234/POLICY.ARTICLE\r',E'\t10.1234/POLICY.ARTICLE\n'] LOOP
   PERFORM pg_temp.policy_error(format('INSERT INTO research_outputs(owner_id,doi) VALUES(%L,%L)',recipient,doi_variant),'23505');
 END LOOP;
 UPDATE research_outputs SET doi=E'\r\nHTTPS://DOI.ORG/10.1234/POLICY.ARTICLE\t' WHERE id=work;
 PERFORM pg_temp.policy_assert((SELECT doi='10.1234/policy.article' FROM research_outputs WHERE id=work),'DOI UPDATE trims outer whitespace too');
 INSERT INTO research_outputs(id,owner_id,created_by,doi) VALUES(other_work,owner1,owner1,E'\t\r\n ');
 PERFORM pg_temp.policy_assert((SELECT doi IS NULL FROM research_outputs WHERE id=other_work),'blank whitespace DOI becomes NULL');
 INSERT INTO output_revisions(id,output_id,revision_no,title,created_by) VALUES(revision,work,1,'Shared policy fixture',owner1);
 UPDATE output_revisions SET released_by=owner1,released_at=clock_timestamp() WHERE id=revision;
 UPDATE research_outputs SET sharing_status='SHARED',current_release_id=revision,first_shared_at=clock_timestamp() WHERE id=work;
 INSERT INTO user_sessions(id,user_id,auth_method,session_token_hash,authenticated_at,expires_at,idle_expires_at)
 VALUES(session1,owner1,'LOCAL',repeat('c',64),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval '1 day',CURRENT_TIMESTAMP+interval '1 hour');
 UPDATE users SET is_active=false WHERE id=owner1;
 PERFORM pg_temp.policy_assert(NOT can_manage_output(owner1,work) AND (SELECT revocation_reason='ACCOUNT_DEACTIVATED' FROM user_sessions WHERE id=session1),'inactive disables writes and revokes sessions');
 PERFORM pg_temp.policy_assert(EXISTS(SELECT 1 FROM visible_output_releases(guest) WHERE output_id=work) AND (SELECT lead_id=owner1 FROM research_groups WHERE id=other_grp),'inactive preserves shared work and group without automatic reassignment');
 UPDATE users SET is_active=true WHERE id=owner1;
 PERFORM pg_temp.policy_assert(NOT EXISTS(SELECT 1 FROM active_user_sessions WHERE id=session1),'old session stays revoked after reactivation');
 RAISE NOTICE 'PASS group creation eligibility, DOI reuse constraint and inactive-account preservation';

 actor_sql=format('INSERT INTO resource_handovers(output_id,previous_user_id,new_user_id,performed_by,basis,authorization_reference,reason) VALUES(%L,%L,%L,%%L,''HOLDER_CONSENT'',''verified-consent/test'',''Handover'')',work,owner1,recipient);
 PERFORM pg_temp.policy_error(format(actor_sql,guest),'23514');
 PERFORM pg_temp.policy_error(format('INSERT INTO resource_handovers(output_id,group_id,previous_user_id,new_user_id,performed_by,basis,authorization_reference,reason) VALUES(%L,%L,%L,%L,%L,''HOLDER_CONSENT'',''ref'',''reason'')',work,grp,owner1,recipient,admin1),'23514');
 PERFORM pg_temp.policy_error(format('INSERT INTO resource_handovers(previous_user_id,new_user_id,performed_by,basis,authorization_reference,reason) VALUES(%L,%L,%L,''HOLDER_CONSENT'',''ref'',''reason'')',owner1,recipient,admin1),'23514');
 PERFORM pg_temp.policy_error(format('INSERT INTO resource_handovers(output_id,previous_user_id,new_user_id,performed_by,basis,authorization_reference,reason) VALUES(%L,%L,%L,%L,''HOLDER_CONSENT'',''ref'',''reason'')',work,owner1,guest,admin1),'23514');
 PERFORM pg_temp.policy_error(format('INSERT INTO resource_handovers(output_id,previous_user_id,new_user_id,performed_by,basis,authorization_reference,reason) VALUES(%L,%L,%L,%L,''HOLDER_CONSENT'',''ref'',''reason'')',work,owner1,admin1,admin1),'23514');
 PERFORM pg_temp.policy_error(format('INSERT INTO resource_handovers(output_id,previous_user_id,new_user_id,performed_by,basis,authorization_reference,reason) VALUES(%L,%L,%L,%L,''HOLDER_CONSENT'',''  '',''reason'')',work,owner1,recipient,admin1),'23514');
 PERFORM pg_temp.policy_assert((SELECT owner_id=owner1 FROM research_outputs WHERE id=work) AND NOT EXISTS(SELECT 1 FROM resource_handovers WHERE output_id=work),'invalid handover rolls back resource update and history together');
 INSERT INTO resource_handovers(id,output_id,previous_user_id,new_user_id,performed_by,basis,authorization_reference,reason)
 VALUES(log1,work,owner1,recipient,admin1,'HOLDER_CONSENT','Verified consent ticket #1','Owner requested handover');
 PERFORM pg_temp.policy_assert((SELECT owner_id=recipient AND current_release_id=revision AND sharing_status='SHARED' FROM research_outputs WHERE id=work) AND EXISTS(SELECT 1 FROM resource_handovers WHERE id=log1),'owner handover preserves work/release');
 -- Exact retry and conflicting payload must both leave resources untouched.
 INSERT INTO resource_handovers(id,output_id,previous_user_id,new_user_id,performed_by,basis,authorization_reference,reason)
 VALUES(log1,work,owner1,recipient,admin1,'HOLDER_CONSENT','Verified consent ticket #1','Owner requested handover') ON CONFLICT(id) DO NOTHING;
 INSERT INTO resource_handovers(id,output_id,previous_user_id,new_user_id,performed_by,basis,authorization_reference,reason)
 VALUES(log1,other_work,owner1,recipient,admin1,'HOLDER_CONSENT','Test conflict','Must not transfer') ON CONFLICT(id) DO NOTHING;
 INSERT INTO resource_handovers(id,group_id,previous_user_id,new_user_id,performed_by,basis,authorization_reference,reason)
 VALUES(log1,other_grp,owner1,recipient,admin1,'HOLDER_CONSENT','Test conflict','Must not transfer') ON CONFLICT(id) DO NOTHING;
 PERFORM pg_temp.policy_assert((SELECT owner_id=owner1 FROM research_outputs WHERE id=other_work)
   AND (SELECT lead_id=owner1 FROM research_groups WHERE id=other_grp)
   AND (SELECT count(*)=1 FROM resource_handovers)
   AND NOT EXISTS(SELECT 1 FROM resource_handovers WHERE output_id=other_work OR group_id=other_grp),
   'ON CONFLICT skipped handovers never change owner/Leader or add history');
 PERFORM pg_temp.policy_error(format(actor_sql,admin1),'23514');
 PERFORM pg_temp.policy_error(format('UPDATE resource_handovers SET reason=''changed'' WHERE id=%L',log1),'23514');
 PERFORM pg_temp.policy_error(format('DELETE FROM resource_handovers WHERE id=%L',log1),'23514');
 UPDATE users SET is_active=false WHERE id=owner1;
 PERFORM pg_temp.policy_error(format('INSERT INTO resource_handovers(group_id,previous_user_id,new_user_id,performed_by,basis,authorization_reference,reason) VALUES(%L,%L,%L,%L,''HOLDER_CONSENT'',''ref'',''reason'')',other_grp,owner1,student,admin1),'23514');
 INSERT INTO resource_handovers(group_id,previous_user_id,new_user_id,performed_by,basis,authorization_reference,reason)
 VALUES(other_grp,owner1,student,admin1,'INSTITUTIONAL_AUTHORIZATION','Official decision #2','Replacement of inactive leader');
 PERFORM pg_temp.policy_assert((SELECT lead_id=student FROM research_groups WHERE id=other_grp) AND can_manage_group(student,other_grp) AND NOT can_manage_group(admin1,other_grp),'leader handover grants only recipient group authority');
 UPDATE research_outputs SET visibility='PRIVATE' WHERE id=work;
 PERFORM pg_temp.policy_assert(NOT can_view_output(admin1,work) AND NOT can_manage_output(admin1,work) AND can_manage_output(recipient,work),'admin handover does not grant admin private/owner rights');
 RAISE NOTICE 'PASS atomic owner/Leader handover, conflict no-op, evidence shape, stale holder, immutability and admin scope';
END $$;
ROLLBACK;
