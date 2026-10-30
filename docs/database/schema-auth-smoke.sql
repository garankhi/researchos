\set ON_ERROR_STOP on
-- Disposable empty test database only. No password/login integration is performed.
-- Password values below are visibly synthetic, non-authenticating hash fixtures.
BEGIN;
CREATE FUNCTION pg_temp.auth_assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Auth assertion failed: %',message; END IF; END $$;
CREATE FUNCTION pg_temp.auth_error(command text, expected text) RETURNS void LANGUAGE plpgsql AS $$
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
 faculty uuid=gen_random_uuid(); student uuid=gen_random_uuid(); staff uuid=gen_random_uuid();
 admin_user uuid=gen_random_uuid(); future_user uuid=gen_random_uuid(); grant_id uuid=gen_random_uuid();
 local_session uuid=gen_random_uuid(); oidc_session uuid=gen_random_uuid(); identity uuid=gen_random_uuid();
 second_identity uuid=gen_random_uuid(); expired uuid=gen_random_uuid(); idle_expired uuid=gen_random_uuid();
 work uuid=gen_random_uuid(); rev uuid=gen_random_uuid(); grp uuid=gen_random_uuid(); file_id uuid=gen_random_uuid();
 opportunity uuid=gen_random_uuid(); changed_at timestamptz;
BEGIN
 INSERT INTO users(id,user_type,email,full_name,department_unit,academic_title,academic_degree) VALUES
 (faculty,'FACULTY','  FACULTY@auth.test  ','Faculty','FPTU','PGS','TS'),
 (student,'STUDENT','student@auth.test','Student','FPTU',NULL,NULL),
 (staff,'STAFF','staff@auth.test','Staff','FPTU',NULL,'ThS'),
 (admin_user,'STAFF','admin@auth.test','Admin','FPTU',NULL,NULL),
 (future_user,'STAFF','future@auth.test','Future grant','FPTU',NULL,NULL);
 PERFORM pg_temp.auth_assert((SELECT email='faculty@auth.test' AND fptu_guid IS NULL AND academic_title='PGS' AND academic_degree='TS' FROM users WHERE id=faculty),'normalized login email, optional FPTU GUID, separate degree/title');
 PERFORM pg_temp.auth_error('INSERT INTO users(user_type,email,full_name,department_unit) VALUES(''STAFF'','' Faculty@auth.test '',''Duplicate'',''FPTU'')','23505');
 PERFORM pg_temp.auth_error('INSERT INTO users(user_type,email,full_name,department_unit) VALUES(''STAFF'',''  '',''Blank'',''FPTU'')','23514');
 UPDATE users SET fptu_guid='verified-fptu-identity' WHERE id=faculty;
 PERFORM pg_temp.auth_error(format('UPDATE users SET fptu_guid=''verified-fptu-identity'' WHERE id=%L',student),'23505');
 PERFORM pg_temp.auth_assert(is_researcher(faculty) AND NOT is_admin(faculty),'A: faculty baseline researcher only');
 PERFORM pg_temp.auth_assert(NOT EXISTS(SELECT 1 FROM user_role_assignments WHERE user_id=faculty),'faculty needs no SYSTEM baseline grant');
 PERFORM pg_temp.auth_assert(NOT is_researcher(student) AND NOT is_admin(student) AND NOT is_researcher(staff) AND NOT is_admin(staff),'B: student and staff start guest');
 -- Trusted fixture bootstrap: these rows do not imply a public SYSTEM endpoint exists.
 INSERT INTO user_role_assignments(user_id,role,grant_source,reason) VALUES(admin_user,'ADMIN','SYSTEM','Controlled test bootstrap');
 PERFORM pg_temp.auth_assert(is_admin(admin_user) AND NOT is_researcher(admin_user),'C: STAFF ADMIN is not automatically researcher');
 INSERT INTO user_role_assignments(user_id,role,granted_by) VALUES(staff,'ADMIN',admin_user),(staff,'RESEARCHER',admin_user),(student,'RESEARCHER',admin_user);
 PERFORM pg_temp.auth_assert(is_admin(staff) AND is_researcher(staff) AND is_researcher(student),'D: both independent grants; student researcher');
 UPDATE user_role_assignments SET revoked_at=clock_timestamp(),revoked_by=admin_user WHERE user_id=staff AND role='ADMIN';
 PERFORM pg_temp.auth_assert(NOT is_admin(staff) AND is_researcher(staff),'E: revoke ADMIN leaves RESEARCHER');
 UPDATE user_role_assignments SET revoked_at=clock_timestamp(),revoked_by=admin_user WHERE user_id=staff AND role='RESEARCHER';
 PERFORM pg_temp.auth_assert(NOT is_admin(staff) AND NOT is_researcher(staff),'revoke all staff grants returns guest');
 INSERT INTO user_role_assignments(user_id,role,granted_by) VALUES(faculty,'RESEARCHER',admin_user);
 UPDATE user_role_assignments SET revoked_at=clock_timestamp(),revoked_by=admin_user WHERE user_id=faculty;
 PERFORM pg_temp.auth_assert(is_researcher(faculty),'faculty default survives RESEARCHER grant revocation');
 INSERT INTO user_role_assignments(id,user_id,role,grant_source,granted_at) VALUES(grant_id,future_user,'ADMIN','SYSTEM',CURRENT_TIMESTAMP+interval '1 day');
 PERFORM pg_temp.auth_assert(NOT is_admin(future_user),'future grant is not yet active');
 INSERT INTO user_role_assignments(user_id,role,grant_source,granted_at) VALUES(future_user,'RESEARCHER','SYSTEM',CURRENT_TIMESTAMP+interval '1 day');
 PERFORM pg_temp.auth_assert(NOT is_researcher(future_user),'future RESEARCHER grant is not yet active');
 PERFORM pg_temp.auth_error(format('INSERT INTO user_role_assignments(user_id,granted_by) VALUES(%L,%L)',staff,admin_user),'23502');
 PERFORM pg_temp.auth_error(format('INSERT INTO user_role_assignments(user_id,role) VALUES(%L,''ADMIN'')',student),'23514');
 PERFORM pg_temp.auth_error(format('INSERT INTO user_role_assignments(user_id,role,grant_source,granted_by) VALUES(%L,''ADMIN'',''SYSTEM'',%L)',student,admin_user),'23514');
 PERFORM pg_temp.auth_error(format('INSERT INTO user_role_assignments(user_id,role,grant_source,granted_by) VALUES(%L,''ADMIN'',''MANUAL'',%L)',student,student),'23514');
 PERFORM pg_temp.auth_error(format('INSERT INTO user_role_assignments(user_id,role,grant_source) VALUES(%L,''ADMIN'',''SYSTEM'')',admin_user),'23505');
 PERFORM pg_temp.auth_assert((SELECT count(*)=2 FROM user_role_assignments WHERE user_id=staff AND revoked_at IS NOT NULL),'revoked grants preserve history');
 RAISE NOTICE 'PASS A-F: account types, independent roles, grant source/actor, future grant, revoke and uniqueness';

 INSERT INTO local_credentials(user_id,password_hash) VALUES(admin_user,'TEST_ONLY_NON_AUTHENTICATING_HASH_V1');
 SELECT password_changed_at INTO changed_at FROM local_credentials WHERE user_id=admin_user;
 PERFORM pg_temp.auth_assert((SELECT must_change_password FROM local_credentials WHERE user_id=admin_user),'provisioned password requires change');
 PERFORM pg_temp.auth_error(format('INSERT INTO local_credentials(user_id,password_hash) VALUES(%L,''TEST_ONLY_HASH'')',admin_user),'23505');
 PERFORM pg_temp.auth_error(format('INSERT INTO local_credentials(user_id,password_hash) VALUES(%L,''  '')',student),'23514');
 PERFORM pg_temp.auth_error(format('INSERT INTO local_credentials(user_id,password_hash) VALUES(%L,''TEST_ONLY_HASH'')',gen_random_uuid()),'23503');
 INSERT INTO user_sessions(id,user_id,auth_method,session_token_hash,authenticated_at,expires_at,idle_expires_at)
 VALUES(local_session,admin_user,'LOCAL',repeat('1',64),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval '1 day',CURRENT_TIMESTAMP+interval '1 hour');
 PERFORM pg_temp.auth_assert((SELECT identity_id IS NULL FROM user_sessions WHERE id=local_session) AND EXISTS(SELECT 1 FROM active_user_sessions WHERE id=local_session),'G: LOCAL session without fake OIDC identity');
 PERFORM pg_temp.auth_error(format('INSERT INTO user_sessions(user_id,auth_method,session_token_hash,authenticated_at,expires_at,idle_expires_at) VALUES(%L,''LOCAL'',%L,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval ''1 day'',CURRENT_TIMESTAMP+interval ''1 hour'')',gen_random_uuid(),repeat('2',64)),'23503');
 INSERT INTO oidc_identities(id,user_id,issuer,subject) VALUES(identity,admin_user,'https://test.idp.invalid','admin-subject'),(second_identity,student,'https://test.idp.invalid','student-subject');
 INSERT INTO user_sessions(id,user_id,auth_method,identity_id,session_token_hash,authenticated_at,expires_at,idle_expires_at)
 VALUES(oidc_session,admin_user,'OIDC',identity,repeat('3',64),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval '1 day',CURRENT_TIMESTAMP+interval '1 hour');
 PERFORM pg_temp.auth_assert((SELECT count(*)=2 FROM active_user_sessions WHERE user_id=admin_user),'same users.id supports both login methods');
 PERFORM pg_temp.auth_error(format('INSERT INTO user_sessions(user_id,auth_method,session_token_hash,authenticated_at,expires_at,idle_expires_at) VALUES(%L,''OIDC'',%L,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval ''1 day'',CURRENT_TIMESTAMP+interval ''1 hour'')',admin_user,repeat('4',64)),'23514');
 PERFORM pg_temp.auth_error(format('INSERT INTO user_sessions(user_id,auth_method,identity_id,session_token_hash,authenticated_at,expires_at,idle_expires_at) VALUES(%L,''OIDC'',%L,%L,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval ''1 day'',CURRENT_TIMESTAMP+interval ''1 hour'')',admin_user,second_identity,repeat('5',64)),'23503');
 PERFORM pg_temp.auth_error(format('UPDATE user_sessions SET auth_method=''LOCAL'' WHERE id=%L',oidc_session),'23514');
 INSERT INTO user_sessions(id,user_id,auth_method,session_token_hash,authenticated_at,created_at,last_seen_at,expires_at,idle_expires_at) VALUES
 (expired,admin_user,'LOCAL',repeat('6',64),CURRENT_TIMESTAMP-interval '2 days',CURRENT_TIMESTAMP-interval '2 days',CURRENT_TIMESTAMP-interval '2 days',CURRENT_TIMESTAMP-interval '1 day',CURRENT_TIMESTAMP-interval '1 day'),
 (idle_expired,admin_user,'LOCAL',repeat('7',64),CURRENT_TIMESTAMP-interval '2 hours',CURRENT_TIMESTAMP-interval '2 hours',CURRENT_TIMESTAMP-interval '2 hours',CURRENT_TIMESTAMP+interval '1 day',CURRENT_TIMESTAMP-interval '1 hour');
 PERFORM pg_temp.auth_assert(NOT EXISTS(SELECT 1 FROM active_user_sessions WHERE id IN (expired,idle_expired)),'I: absolute and idle expiration');
 INSERT INTO user_role_assignments(user_id,role,grant_source) VALUES(admin_user,'RESEARCHER','SYSTEM');
 UPDATE users SET is_active=false WHERE id=admin_user;
 PERFORM pg_temp.auth_assert(NOT is_admin(admin_user) AND NOT is_researcher(admin_user) AND NOT EXISTS(SELECT 1 FROM active_user_sessions WHERE user_id=admin_user),'inactive disables both roles and every session');
 PERFORM pg_temp.auth_error(format('INSERT INTO user_sessions(user_id,auth_method,session_token_hash,authenticated_at,expires_at,idle_expires_at) VALUES(%L,''LOCAL'',%L,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval ''1 day'',CURRENT_TIMESTAMP+interval ''1 hour'')',admin_user,repeat('d',64)),'23514');
 PERFORM pg_temp.auth_error(format('INSERT INTO user_sessions(user_id,auth_method,identity_id,session_token_hash,authenticated_at,expires_at,idle_expires_at) VALUES(%L,''OIDC'',%L,%L,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval ''1 day'',CURRENT_TIMESTAMP+interval ''1 hour'')',admin_user,identity,repeat('e',64)),'23514');
 UPDATE users SET is_active=true WHERE id=admin_user;
 PERFORM pg_temp.auth_assert(NOT EXISTS(SELECT 1 FROM active_user_sessions WHERE user_id=admin_user),'reactivation must not revive sessions revoked on deactivation');
 local_session=gen_random_uuid(); oidc_session=gen_random_uuid();
 INSERT INTO user_sessions(id,user_id,auth_method,identity_id,session_token_hash,authenticated_at,expires_at,idle_expires_at) VALUES
 (local_session,admin_user,'LOCAL',NULL,repeat('a',64),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval '1 day',CURRENT_TIMESTAMP+interval '1 hour'),
 (oidc_session,admin_user,'OIDC',identity,repeat('b',64),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval '1 day',CURRENT_TIMESTAMP+interval '1 hour');
 UPDATE user_sessions SET revoked_at=clock_timestamp(),revocation_reason='LOGOUT' WHERE id=local_session;
 PERFORM pg_temp.auth_assert(NOT EXISTS(SELECT 1 FROM active_user_sessions WHERE id=local_session) AND EXISTS(SELECT 1 FROM active_user_sessions WHERE id=oidc_session),'logout only chosen session');
 UPDATE local_credentials SET password_hash='TEST_ONLY_NON_AUTHENTICATING_HASH_V2',must_change_password=false WHERE user_id=admin_user;
 PERFORM pg_temp.auth_assert((SELECT password_changed_at>=changed_at AND NOT must_change_password FROM local_credentials WHERE user_id=admin_user),'password timestamp and first-change flag');
 PERFORM pg_temp.auth_assert(NOT EXISTS(SELECT 1 FROM active_user_sessions WHERE user_id=admin_user) AND (SELECT revocation_reason='PASSWORD_CHANGED' FROM user_sessions WHERE id=oidc_session),'password change revokes existing sessions including OIDC');
 INSERT INTO user_sessions(user_id,auth_method,session_token_hash,authenticated_at,expires_at,idle_expires_at)
 VALUES(admin_user,'LOCAL',repeat('8',64),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval '1 day',CURRENT_TIMESTAMP+interval '1 hour');
 UPDATE local_credentials SET password_hash='TEST_ONLY_RESET_HASH',must_change_password=true WHERE user_id=admin_user;
 PERFORM pg_temp.auth_assert(NOT EXISTS(SELECT 1 FROM active_user_sessions WHERE user_id=admin_user) AND (SELECT must_change_password FROM local_credentials WHERE user_id=admin_user),'authorized reset schema supports mandatory change and revocation');
 RAISE NOTICE 'PASS G-I: credentials, LOCAL/OIDC identity shape/FKs, expiration/inactive/logout and password-change revocation';

 -- ADMIN remains ordinary for resource access, even with RESEARCHER as well.
 INSERT INTO research_groups(id,code,name,lead_id) VALUES(grp,'auth-test-group','Private test group',faculty);
 INSERT INTO research_outputs(id,owner_id,created_by,visibility) VALUES(work,faculty,faculty,'PRIVATE');
 INSERT INTO output_revisions(id,output_id,revision_no,title,created_by) VALUES(rev,work,1,'Private work',faculty);
 INSERT INTO output_files(id,output_id,uploaded_by,storage_key,file_name,mime_type,size_bytes,sha256)
 VALUES(file_id,work,faculty,'auth-test-private-file','private.pdf','application/pdf',1,repeat('a',64));
 INSERT INTO output_revision_files(output_id,revision_id,file_id) VALUES(work,rev,file_id);
 UPDATE output_revisions SET released_by=faculty,released_at=clock_timestamp() WHERE id=rev;
 UPDATE research_outputs SET sharing_status='SHARED',current_release_id=rev,first_shared_at=clock_timestamp() WHERE id=work;
 INSERT INTO research_opportunities(id,creator_id,group_id,title,opportunity_kind) VALUES(opportunity,faculty,grp,'Group-only management','RESEARCH_COLLABORATION');
 PERFORM pg_temp.auth_assert(is_admin(admin_user) AND is_researcher(admin_user),'fixture holds both roles');
 PERFORM pg_temp.auth_assert(NOT can_manage_output(admin_user,work) AND NOT can_manage_group(admin_user,grp) AND NOT can_manage_opportunity(admin_user,opportunity),'J: ADMIN does not bypass resource ownership/leadership');
 PERFORM pg_temp.auth_assert(NOT can_view_output(admin_user,work) AND NOT can_view_output_file(admin_user,file_id) AND NOT EXISTS(SELECT 1 FROM visible_output_releases(admin_user) WHERE output_id=work),'J: ADMIN cannot see private work/file');
 PERFORM pg_temp.auth_error(format('UPDATE research_outputs SET current_release_id=%L WHERE id=%L',gen_random_uuid(),work),'23514');
 RAISE NOTICE 'PASS J: ADMIN plus RESEARCHER has no owner/group/private bypass';
END $$;
ROLLBACK;
