\set ON_ERROR_STOP on
-- Disposable database only. Every fixture and helper is rolled back.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',message; END IF; END $$;
CREATE FUNCTION pg_temp.expect_error(command text, expected text) RETURNS void LANGUAGE plpgsql AS $$
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
 a uuid=gen_random_uuid(); b uuid=gen_random_uuid(); s uuid=gen_random_uuid(); x uuid=gen_random_uuid();
 g1 uuid=gen_random_uuid(); g2 uuid=gen_random_uuid(); f uuid=gen_random_uuid(); sf uuid=gen_random_uuid();
 topic uuid=gen_random_uuid(); imported uuid=gen_random_uuid(); work uuid=gen_random_uuid(); otherwork uuid=gen_random_uuid();
 r1 uuid=gen_random_uuid(); r2 uuid=gen_random_uuid(); file1 uuid=gen_random_uuid(); file2 uuid=gen_random_uuid();
 opp uuid=gen_random_uuid(); app1 uuid=gen_random_uuid(); app2 uuid=gen_random_uuid(); scoped uuid=gen_random_uuid();
 ident uuid=gen_random_uuid(); sess uuid=gen_random_uuid(); login uuid=gen_random_uuid();
 delivery uuid=gen_random_uuid(); event1 uuid; event2 uuid; saved_due timestamptz; changed int;
BEGIN
 INSERT INTO users(id,fptu_guid,user_type,email,full_name,department_unit) VALUES
 (a,'test-a','FACULTY','a@test.invalid','A','FPTU'),(b,'test-b','FACULTY','b@test.invalid','B','FPTU'),
 (s,'test-s','STUDENT','s@test.invalid','Student','FPTU'),(x,'test-x','FACULTY','x@test.invalid','X','FPTU');
 PERFORM pg_temp.assert_true(is_researcher(a) AND NOT is_researcher(s),'faculty baseline/student guest');
 INSERT INTO researcher_profiles(user_id) VALUES(s);
 PERFORM pg_temp.assert_true(NOT is_researcher(s),'profile is not a grant');
 INSERT INTO oidc_identities(id,user_id,issuer,subject) VALUES(ident,a,'https://idp.invalid','subject-a');
 PERFORM pg_temp.expect_error(format('INSERT INTO oidc_identities(user_id,issuer,subject) VALUES(%L,''https://idp.invalid'',''subject-a'')',b),'23505');
 INSERT INTO user_sessions(id,user_id,auth_method,identity_id,session_token_hash,authenticated_at,expires_at,idle_expires_at)
 VALUES(sess,a,'OIDC',ident,repeat('a',64),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval '1 day',CURRENT_TIMESTAMP+interval '1 hour');
 PERFORM pg_temp.expect_error(format('INSERT INTO user_sessions(user_id,auth_method,identity_id,session_token_hash,authenticated_at,expires_at,idle_expires_at) VALUES(%L,''OIDC'',%L,%L,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval ''1 day'',CURRENT_TIMESTAMP+interval ''1 hour'')',b,ident,repeat('b',64)),'23503');
 PERFORM pg_temp.assert_true(EXISTS(SELECT 1 FROM active_user_sessions WHERE id=sess),'active session');
 UPDATE users SET is_active=false WHERE id=a;
 PERFORM pg_temp.assert_true(NOT is_researcher(a) AND NOT EXISTS(SELECT 1 FROM active_user_sessions WHERE id=sess),'inactive revokes effective access');
 UPDATE users SET is_active=true WHERE id=a;
 UPDATE user_sessions SET revoked_at=clock_timestamp() WHERE id=sess;
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM active_user_sessions WHERE id=sess),'logout');
 INSERT INTO oidc_login_attempts(id,state_hash,nonce_hash,browser_binding_hash,issuer,redirect_uri,pkce_verifier_ciphertext,encryption_key_id,expires_at)
 VALUES(login,repeat('c',64),repeat('d',64),repeat('e',64),'https://idp.invalid','https://app.invalid/callback','encrypted-test','test-key',CURRENT_TIMESTAMP+interval '5 minutes');
 UPDATE oidc_login_attempts SET consumed_at=clock_timestamp() WHERE id=login AND consumed_at IS NULL AND expires_at>clock_timestamp();
 GET DIAGNOSTICS changed=ROW_COUNT; PERFORM pg_temp.assert_true(changed=1,'first state consume');
 UPDATE oidc_login_attempts SET consumed_at=clock_timestamp() WHERE id=login AND consumed_at IS NULL AND expires_at>clock_timestamp();
 GET DIAGNOSTICS changed=ROW_COUNT; PERFORM pg_temp.assert_true(changed=0,'state replay');
 RAISE NOTICE 'PASS roles, OIDC identity/session constraints and atomic state consumption';

 INSERT INTO research_fields(id,name,source,external_id) VALUES(f,'Computer Science','OPENALEX','https://openalex.org/fields/17');
 INSERT INTO research_subfields(id,field_id,name,source,external_id) VALUES(sf,f,'AI','OPENALEX','https://openalex.org/subfields/1702');
 INSERT INTO research_fields(name,source,external_id,last_synced_at) VALUES('Renamed field','OPENALEX','https://openalex.org/fields/17',clock_timestamp())
 ON CONFLICT(source,external_id) DO UPDATE SET name=excluded.name,last_synced_at=excluded.last_synced_at;
 INSERT INTO research_subfields(field_id,name,source,external_id,last_synced_at) VALUES(f,'Renamed subfield','OPENALEX','https://openalex.org/subfields/1702',clock_timestamp())
 ON CONFLICT(source,external_id) DO UPDATE SET name=excluded.name,field_id=excluded.field_id,last_synced_at=excluded.last_synced_at;
 PERFORM pg_temp.assert_true((SELECT name='Renamed field' FROM research_fields WHERE id=f) AND (SELECT name='Renamed subfield' AND field_id=f FROM research_subfields WHERE id=sf),'parent upserts keep IDs and hierarchy');
 INSERT INTO research_topics(id,subfield_id,name,created_by) VALUES(topic,sf,E'  Test\t Topic  ',a);
 PERFORM pg_temp.assert_true((SELECT name='Test Topic' AND is_active FROM research_topics WHERE id=topic),'Other immediate and normalized');
 PERFORM pg_temp.expect_error(format('INSERT INTO research_topics(subfield_id,name,created_by) VALUES(%L,''TEST   TOPIC'',%L)',sf,a),'23505');
 PERFORM pg_temp.expect_error(format('INSERT INTO research_topics(subfield_id,name,created_by) VALUES(%L,''Guest topic'',%L)',sf,s),'23514');
 INSERT INTO research_topics(id,subfield_id,name,source,external_id) VALUES(imported,sf,'Test Topic','OPENALEX','https://openalex.org/T-test');
 INSERT INTO research_topics(subfield_id,name,source,external_id,last_synced_at) VALUES(sf,'Renamed imported','OPENALEX','https://openalex.org/T-test',clock_timestamp())
 ON CONFLICT(source,external_id) DO UPDATE SET name=excluded.name,last_synced_at=excluded.last_synced_at;
 PERFORM pg_temp.assert_true((SELECT name='Renamed imported' FROM research_topics WHERE id=imported) AND (SELECT name='Test Topic' FROM research_topics WHERE id=topic),'upsert rename preserves identity and LOCAL');
 INSERT INTO research_topics(subfield_id,name,source,external_id) VALUES(sf,'Test Topic','OPENALEX','https://openalex.org/T-test-2');
 PERFORM pg_temp.assert_true((SELECT count(*)=3 FROM research_topics WHERE subfield_id=sf),'different IDs same label coexist');
 PERFORM pg_temp.expect_error(format('UPDATE research_topics SET source=''OPENALEX'',external_id=''new'' WHERE id=%L',topic),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO research_subfields(field_id,name,source,external_id) VALUES(%L,''Bad'',''OPENALEX'',''bad'')',gen_random_uuid()),'23503');
 INSERT INTO research_interests(user_id,topic_id,source_type,status) VALUES(a,imported,'DECLARED','ACTIVE'),(a,topic,'INFERRED','SUGGESTED');
 UPDATE research_interests SET status='ACTIVE',reviewed_at=clock_timestamp() WHERE user_id=a AND topic_id=topic;
 PERFORM pg_temp.assert_true((SELECT source_type='INFERRED' FROM research_interests WHERE user_id=a AND topic_id=topic),'inference origin retained after acceptance');
 UPDATE research_interests SET status='REJECTED' WHERE user_id=a AND topic_id=topic;
 PERFORM pg_temp.expect_error(format('DELETE FROM research_topics WHERE id=%L',topic),'23001');
 INSERT INTO user_role_assignments(user_id,role,granted_by) VALUES(s,'RESEARCHER',a);
 PERFORM pg_temp.assert_true(is_researcher(s),'student grant');
 INSERT INTO research_topics(subfield_id,name,created_by) VALUES(sf,'Student topic',s);
 UPDATE user_role_assignments SET revoked_at=clock_timestamp(),revoked_by=a WHERE user_id=s;
 PERFORM pg_temp.assert_true(NOT is_researcher(s),'student revoke');
 RAISE NOTICE 'PASS taxonomy hierarchy, LOCAL/imported names and upserts, interest sources, student capability';

 INSERT INTO research_outputs(id,owner_id,created_by,visibility) VALUES(work,a,a,'FPTU_COMMUNITY'),(otherwork,b,b,'PRIVATE');
 INSERT INTO output_revisions(id,output_id,revision_no,title,created_by) VALUES(r1,work,1,'Released title',a);
 INSERT INTO output_topics(output_id,revision_id,topic_id,added_by) VALUES(work,r1,topic,a);
 INSERT INTO output_files(id,output_id,uploaded_by,storage_key,file_name,mime_type,size_bytes,sha256,visibility) VALUES
 (file1,work,a,'test/private','private.pdf','application/pdf',123,repeat('a',64),'PRIVATE'),
 (file2,work,a,'test/shared','shared.pdf','application/pdf',123,repeat('b',64),'FPTU_COMMUNITY');
 INSERT INTO output_revision_files(output_id,revision_id,file_id) VALUES(work,r1,file1),(work,r1,file2);
 PERFORM pg_temp.expect_error(format('UPDATE research_outputs SET current_release_id=%L WHERE id=%L',r1,work),'23514');
 PERFORM pg_temp.expect_error(format('UPDATE output_revisions SET released_by=%L,released_at=clock_timestamp() WHERE id=%L',b,r1),'23514');
 UPDATE output_revisions SET released_by=a,released_at=clock_timestamp() WHERE id=r1;
 UPDATE research_outputs SET sharing_status='SHARED',first_shared_at=clock_timestamp(),current_release_id=r1 WHERE id=work;
 PERFORM pg_temp.assert_true(EXISTS(SELECT 1 FROM visible_output_releases(s) WHERE output_id=work),'A: personal output visible without group');
 PERFORM pg_temp.assert_true(NOT can_manage_output(b,work),'researcher alone not an editor');
 PERFORM pg_temp.assert_true(NOT can_view_output_file(s,file1) AND can_view_output_file(s,file2),'file permissions intersect');
 INSERT INTO output_revisions(id,output_id,revision_no,title,created_by) VALUES(r2,work,2,'DRAFT SECRET',a);
 INSERT INTO output_topics(output_id,revision_id,topic_id,added_by) VALUES(work,r2,imported,a);
 PERFORM pg_temp.assert_true((SELECT title='Released title' FROM visible_output_releases(s) WHERE output_id=work),'draft title excluded');
 PERFORM pg_temp.expect_error(format('UPDATE output_revisions SET title=''tampered'' WHERE id=%L',r1),'23514');
 PERFORM pg_temp.expect_error(format('DELETE FROM output_topics WHERE revision_id=%L',r1),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO output_topics(output_id,revision_id,topic_id,added_by) VALUES(%L,%L,%L,%L)',otherwork,r2,topic,b),'23503');
 PERFORM pg_temp.expect_error(format('UPDATE output_files SET storage_key=''overwritten'' WHERE id=%L',file1),'23514');
 INSERT INTO research_groups(id,code,name,lead_id) VALUES(g1,'test-g1','Group',b),(g2,'test-g2','Singleton',a);
 INSERT INTO group_members(group_id,user_id) VALUES(g1,a);
 INSERT INTO group_output_links(output_id,group_id,requested_revision_id,requested_by) VALUES(work,g1,r1,a);
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM group_output_releases WHERE group_id=g1),'B: pending not displayed');
 PERFORM pg_temp.expect_error(format('UPDATE group_output_links SET status=''ACCEPTED'',decided_by=%L,decided_at=CURRENT_TIMESTAMP,accepted_revision_id=%L,accepted_by=%L,accepted_at=CURRENT_TIMESTAMP WHERE output_id=%L AND group_id=%L',x,r1,x,work,g1),'23514');
 UPDATE group_output_links SET status='ACCEPTED',decided_by=b,decided_at=CURRENT_TIMESTAMP,accepted_revision_id=r1,accepted_by=b,accepted_at=CURRENT_TIMESTAMP WHERE output_id=work AND group_id=g1;
 INSERT INTO group_output_links(output_id,group_id,requested_revision_id,requested_by,status,decided_by,decided_at,accepted_revision_id,accepted_by,accepted_at)
 VALUES(work,g2,r1,a,'ACCEPTED',a,CURRENT_TIMESTAMP,r1,a,CURRENT_TIMESTAMP);
 PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM group_output_releases WHERE output_id=work) AND NOT EXISTS(SELECT 1 FROM group_members WHERE group_id=g2),'C/D: singleton direct include / one output in two groups');
 UPDATE output_revisions SET released_by=a,released_at=clock_timestamp() WHERE id=r2;
 UPDATE research_outputs SET current_release_id=r2 WHERE id=work;
 PERFORM pg_temp.assert_true((SELECT title='DRAFT SECRET' FROM released_output_versions WHERE output_id=work) AND (SELECT bool_and(title='Released title') FROM group_output_releases WHERE output_id=work),'personal revision advances without changing group pins');
 UPDATE group_output_links SET requested_revision_id=r2,requested_at=clock_timestamp(),status='PENDING',decided_by=NULL,decided_at=NULL WHERE output_id=work AND group_id=g1;
 UPDATE group_output_links SET status='REJECTED',decided_by=b,decided_at=clock_timestamp() WHERE output_id=work AND group_id=g1;
 PERFORM pg_temp.assert_true((SELECT id=r1 FROM group_output_releases WHERE output_id=work AND group_id=g1),'rejected update preserves old accepted release');
 UPDATE research_outputs SET visibility='PRIVATE' WHERE id=work;
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM visible_group_output_releases(b,g1)) AND NOT can_view_output_file(b,file2),'group leader cannot bypass private output');
 UPDATE research_outputs SET visibility='FPTU_COMMUNITY' WHERE id=work;
 UPDATE group_output_links SET status='REMOVED',decided_by=b,decided_at=CURRENT_TIMESTAMP,removed_by=b,removed_at=CURRENT_TIMESTAMP,accepted_revision_id=NULL,accepted_by=NULL,accepted_at=NULL WHERE output_id=work AND group_id=g1;
 PERFORM pg_temp.assert_true(EXISTS(SELECT 1 FROM released_output_versions WHERE output_id=work) AND (SELECT count(*)=1 FROM group_output_releases WHERE output_id=work),'unlink one preserves other group/personal');
 UPDATE research_outputs SET sharing_status='ARCHIVED',archived_at=clock_timestamp() WHERE id=work;
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM visible_output_releases(s) WHERE output_id=work) AND NOT EXISTS(SELECT 1 FROM group_output_releases WHERE output_id=work),'archive hides displays');
 UPDATE research_outputs SET sharing_status='SHARED',archived_at=NULL WHERE id=work;
 RAISE NOTICE 'PASS publication A/B/C/D, immutable versions, draft isolation, visibility, group removal/archive';

 INSERT INTO research_opportunities(id,creator_id,title,opportunity_kind,expected_role,description,application_deadline)
 VALUES(opp,x,'Personal','PROJECT_FORMATION',E'  Experiment\t lead  ','Details',clock_timestamp()+interval '30 days');
 PERFORM pg_temp.assert_true(can_manage_opportunity(x,opp) AND NOT can_manage_opportunity(a,opp),'personal opportunity authority');
 PERFORM pg_temp.expect_error(format('INSERT INTO research_opportunities(creator_id,title,opportunity_kind,status) VALUES(%L,''Bad direct publish'',''FUNDING_CALL'',''OPEN'')',x),'23514');
 UPDATE research_opportunities SET status='OPEN' WHERE id=opp;
 PERFORM pg_temp.assert_true((SELECT expected_role='Experiment lead' AND published_at IS NOT NULL FROM research_opportunities WHERE id=opp),'role normalization/publish');
 INSERT INTO research_opportunities(id,group_id,creator_id,title,opportunity_kind) VALUES(scoped,g1,a,'Scoped','RESEARCH_COLLABORATION');
 PERFORM pg_temp.assert_true(NOT can_manage_opportunity(a,scoped) AND can_manage_opportunity(b,scoped),'creator not scoped leader');
 PERFORM pg_temp.expect_error(format('INSERT INTO opportunity_applications(opportunity_id,applicant_id,applicant_note) VALUES(%L,%L,''guest'')',opp,s),'23514');
 INSERT INTO opportunity_applications(id,opportunity_id,applicant_id,applicant_note) VALUES(app1,opp,a,'First');
 PERFORM pg_temp.assert_true(EXISTS(SELECT 1 FROM visible_opportunity_applications(a) WHERE id=app1) AND EXISTS(SELECT 1 FROM visible_opportunity_applications(x) WHERE id=app1) AND NOT EXISTS(SELECT 1 FROM visible_opportunity_applications(b) WHERE id=app1),'application privacy predicate');
 SELECT response_due_at INTO saved_due FROM opportunity_applications WHERE id=app1;
 PERFORM pg_temp.assert_true((SELECT response_due_at-applied_at=interval '5 days' FROM opportunity_applications WHERE id=app1),'calendar SLA');
 UPDATE research_opportunities SET response_sla_days=7 WHERE id=opp;
 PERFORM pg_temp.assert_true((SELECT response_due_at=saved_due FROM opportunity_applications WHERE id=app1),'SLA snapshot stable');
 PERFORM pg_temp.expect_error(format('INSERT INTO opportunity_applications(opportunity_id,applicant_id,applicant_note) VALUES(%L,%L,''duplicate'')',opp,a),'23505');
 UPDATE opportunity_applications SET status='WITHDRAWN' WHERE id=app1;
 INSERT INTO opportunity_applications(id,opportunity_id,applicant_id,applicant_note) VALUES(app2,opp,a,'Second');
 PERFORM pg_temp.assert_true((SELECT status='WITHDRAWN' FROM opportunity_applications WHERE id=app1) AND (SELECT response_due_at-applied_at=interval '7 days' AND response_due_at>saved_due FROM opportunity_applications WHERE id=app2),'new submission separate ID/SLA/history');
 PERFORM pg_temp.expect_error(format('UPDATE opportunity_applications SET status=''PENDING'' WHERE id=%L',app1),'23514');
 UPDATE research_opportunities SET status='CLOSED' WHERE id=opp;
 PERFORM pg_temp.assert_true((SELECT status='PENDING' FROM opportunity_applications WHERE id=app2),'close preserves pending');
 UPDATE opportunity_applications SET status='INVITED_TO_DISCUSS',responded_by=x,response_note='Discuss' WHERE id=app2;
 PERFORM pg_temp.expect_error(format('UPDATE opportunity_applications SET status=''WITHDRAWN'' WHERE id=%L',app2),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO opportunity_applications(opportunity_id,applicant_id,applicant_note) VALUES(%L,%L,''closed'')',opp,b),'23514');
 UPDATE research_opportunities SET status='OPEN' WHERE id=opp;
 PERFORM pg_temp.expect_error(format('INSERT INTO opportunity_applications(opportunity_id,applicant_id,applicant_note) VALUES(%L,%L,''responded'')',opp,a),'23505');
 UPDATE research_opportunities SET application_deadline=clock_timestamp()-interval '1 second' WHERE id=opp;
 PERFORM pg_temp.expect_error(format('INSERT INTO opportunity_applications(opportunity_id,applicant_id,applicant_note) VALUES(%L,%L,''expired'')',opp,b),'23514');
 UPDATE research_opportunities SET application_deadline=clock_timestamp()+interval '1 day',archived_at=clock_timestamp() WHERE id=opp;
 PERFORM pg_temp.expect_error(format('INSERT INTO opportunity_applications(opportunity_id,applicant_id,applicant_note) VALUES(%L,%L,''archived'')',opp,b),'23514');
 RAISE NOTICE 'PASS opportunity/application authority, SLA, withdrawal/resubmission, closed/expired/archive and terminal states';

 PERFORM pg_temp.expect_error(format('INSERT INTO user_follows(follower_id,entity_type,entity_id) VALUES(%L,''OUTPUT'',%L)',s,work),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO digest_preferences(user_id,enabled) VALUES(%L,true)',s),'23514');
 INSERT INTO user_follows(follower_id,entity_type,entity_id) VALUES(b,'OUTPUT',work),(b,'GROUP',g2);
 INSERT INTO digest_preferences(user_id,enabled) VALUES(b,true);
 PERFORM pg_temp.assert_true((SELECT count(*)=4 FROM research_updates WHERE output_id=work),'only four meaningful release/group events');
 SELECT id INTO event1 FROM research_updates WHERE output_id=work AND event_type='OUTPUT_SHARED';
 SELECT id INTO event2 FROM research_updates WHERE output_id=work AND group_id=g2;
 INSERT INTO digest_deliveries(id,user_id,period_start,period_end) VALUES(delivery,b,CURRENT_TIMESTAMP-interval '7 days',CURRENT_TIMESTAMP);
 PERFORM pg_temp.expect_error(format('UPDATE digest_deliveries SET status=''PROCESSING'',attempts=1,locked_until=clock_timestamp()+interval ''5 minutes'' WHERE id=%L',delivery),'23514');
 INSERT INTO digest_items(delivery_id,event_id,matched_reasons,content_snapshot) VALUES(delivery,event1,'["OUTPUT"]','{"title":"Released"}');
 PERFORM pg_temp.expect_error(format('INSERT INTO digest_items(delivery_id,event_id,content_snapshot) VALUES(%L,%L,''{}'')',delivery,event2),'23505');
 UPDATE digest_items SET event_id=event2,matched_reasons='["OUTPUT","GROUP"]' WHERE delivery_id=delivery;
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM digest_items WHERE delivery_id=delivery),'one output despite multiple follows');
 UPDATE digest_preferences SET enabled=false WHERE user_id=b;
 PERFORM pg_temp.expect_error(format('UPDATE digest_deliveries SET status=''PROCESSING'',attempts=1,locked_until=clock_timestamp()+interval ''5 minutes'' WHERE id=%L',delivery),'23514');
 UPDATE digest_preferences SET enabled=true WHERE user_id=b;
 UPDATE digest_deliveries SET status='PROCESSING',attempts=1,locked_until=clock_timestamp()+interval '5 minutes' WHERE id=delivery;
 UPDATE digest_deliveries SET status='SENT',sent_at=clock_timestamp(),provider_message_id='test-provider' WHERE id=delivery;
 PERFORM pg_temp.expect_error(format('UPDATE digest_deliveries SET status=''PENDING'',sent_at=NULL WHERE id=%L',delivery),'23514');
 PERFORM pg_temp.expect_error(format('DELETE FROM digest_items WHERE delivery_id=%L',delivery),'23514');
 RAISE NOTICE 'PASS follow/digest eligibility, event creation, deduplication, opt-out, empty/terminal guards';
END $$;
ROLLBACK;
