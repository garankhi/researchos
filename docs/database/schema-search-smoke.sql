\set ON_ERROR_STOP on
-- Disposable database only. Every fixture and helper is rolled back.
-- Covers the F0 schema additions: output_import_state, field_provenance,
-- search_index (4 entity types) and owner_output_versions.
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

-- Output import state: NONE by default, ACCEPTED requires an owner.
DO $$
DECLARE
 u uuid=gen_random_uuid(); o uuid; r uuid; n int; s output_import_state;
BEGIN
 INSERT INTO users(id,user_type,email,full_name,department_unit)
 VALUES(u,'FACULTY','import@test.invalid','Import Tester','FPTU');
 INSERT INTO research_outputs(id,sharing_status,owner_id,created_by)
 VALUES(gen_random_uuid(),'DRAFT',u,u) RETURNING id INTO o;
 SELECT import_state INTO s FROM research_outputs WHERE id=o;
 PERFORM pg_temp.assert_true(s='NONE','import_state defaults to NONE');
 PERFORM pg_temp.expect_error(
  'INSERT INTO research_outputs(sharing_status,import_state) VALUES(''DRAFT'',''ACCEPTED'')','23514');
 INSERT INTO research_outputs(id,sharing_status,owner_id,created_by,import_state)
 VALUES(gen_random_uuid(),'DRAFT',u,u,'ACCEPTED');
 RAISE NOTICE 'PASS output_import_state default and ck_output_import_owner';
END $$;

-- Field provenance: a blank source_ref is rejected, the PK keeps history per source_ref.
DO $$
DECLARE e uuid=gen_random_uuid(); n int;
BEGIN
 INSERT INTO field_provenance(entity_type,entity_id,field_name,source,source_ref)
 VALUES('OUTPUT',e,'title','EXT','OPENALEX:W1');
 PERFORM pg_temp.expect_error(
  'INSERT INTO field_provenance(entity_type,entity_id,field_name,source,source_ref) VALUES(''OUTPUT'',gen_random_uuid(),''title'',''EXT'',''  '')','23514');
 INSERT INTO field_provenance(entity_type,entity_id,field_name,source,source_ref)
 VALUES('OUTPUT',e,'title','EXT','OPENALEX:W2');
 SELECT count(*) INTO n FROM field_provenance WHERE entity_type='OUTPUT' AND entity_id=e AND field_name='title';
 PERFORM pg_temp.assert_true(n=2,'provenance keeps one row per source_ref');
 PERFORM pg_temp.assert_true(
  EXISTS(SELECT 1 FROM field_provenance WHERE entity_type='OUTPUT' AND entity_id=e AND is_locked=false),
  'provenance rows are unlocked by default');
 RAISE NOTICE 'PASS field_provenance history and ck_field_provenance_ref';
END $$;

-- Search index: entity scope, polymorphic guard, and the shared-output lifecycle.
DO $$
DECLARE
 u uuid=gen_random_uuid(); o uuid; r uuid; n int;
BEGIN
 INSERT INTO users(id,user_type,email,full_name,department_unit)
 VALUES(u,'FACULTY','search@test.invalid','Search Tester','FPTU');

 INSERT INTO research_outputs(id,sharing_status,owner_id,created_by)
 VALUES(gen_random_uuid(),'DRAFT',u,u) RETURNING id INTO o;
 INSERT INTO output_revisions(id,output_id,revision_no,title,created_by)
 VALUES(gen_random_uuid(),o,1,'Indexed Work',u) RETURNING id INTO r;
 UPDATE output_revisions SET released_at=clock_timestamp(),released_by=u WHERE id=r;

 -- The polymorphic entity_id has no foreign key, so the trigger guards it.
 PERFORM pg_temp.expect_error(format(
  'INSERT INTO search_index(entity_type,entity_id,visibility,title,doc) VALUES(''OUTPUT'',%L,''FPTU_COMMUNITY'',''x'',to_tsvector(''simple'',''x''))',gen_random_uuid()),'23503');
 -- RESEARCH_GROUP visibility needs an access_group_id.
 PERFORM pg_temp.expect_error(format(
  'INSERT INTO search_index(entity_type,entity_id,visibility,title,doc) VALUES(''OUTPUT'',%L,''RESEARCH_GROUP'',''x'',to_tsvector(''simple'',''x''))',o),'23514');

 -- A draft is not indexed.
 SELECT count(*) INTO n FROM search_index WHERE entity_type='OUTPUT' AND entity_id=o;
 PERFORM pg_temp.assert_true(n=0,'a draft work stays out of the index');

 UPDATE research_outputs SET sharing_status='SHARED',first_shared_at=clock_timestamp(),current_release_id=r WHERE id=o;
 SELECT count(*) INTO n FROM search_index WHERE entity_type='OUTPUT' AND entity_id=o;
 PERFORM pg_temp.assert_true(n=1,'a shared work is indexed');
 PERFORM pg_temp.assert_true(
  EXISTS(SELECT 1 FROM search_index WHERE entity_type='OUTPUT' AND entity_id=o
    AND doc @@ websearch_to_tsquery('simple','indexed')),'the index payload is searchable');

 -- Leaving SHARED removes the index row again.
 UPDATE research_outputs SET sharing_status='ARCHIVED',archived_at=clock_timestamp() WHERE id=o;
 SELECT count(*) INTO n FROM search_index WHERE entity_type='OUTPUT' AND entity_id=o;
 PERFORM pg_temp.assert_true(n=0,'an archived work leaves the index');
 RAISE NOTICE 'PASS search_index scope, polymorphic guard and shared-output lifecycle';
END $$;

-- The owner working copy stays out of the released views but is visible to its owner.
DO $$
DECLARE
 u uuid=gen_random_uuid(); other uuid=gen_random_uuid(); o uuid; r uuid; n int;
BEGIN
 INSERT INTO users(id,user_type,email,full_name,department_unit)
 VALUES(u,'FACULTY','owner@test.invalid','Owner Tester','FPTU'),
      (other,'FACULTY','other@test.invalid','Other Tester','FPTU');
 INSERT INTO research_outputs(id,sharing_status,owner_id,created_by,import_state)
 VALUES(gen_random_uuid(),'DRAFT',u,u,'ACCEPTED') RETURNING id INTO o;
 INSERT INTO output_revisions(id,output_id,revision_no,title,created_by)
 VALUES(gen_random_uuid(),o,1,'Owner Copy',u) RETURNING id INTO r;

 SELECT count(*) INTO n FROM owner_output_versions WHERE output_id=o;
 PERFORM pg_temp.assert_true(n=1,'owner_output_versions shows the owner working copy');
 SELECT count(*) INTO n FROM released_output_versions WHERE output_id=o;
 PERFORM pg_temp.assert_true(n=0,'the owner working copy is not a released version');
 SELECT count(*) INTO n FROM visible_owner_output_versions(u) WHERE output_id=o;
 PERFORM pg_temp.assert_true(n=1,'the owner sees their working copy');
 SELECT count(*) INTO n FROM visible_owner_output_versions(other) WHERE output_id=o;
 PERFORM pg_temp.assert_true(n=0,'another actor does not see the working copy');
 SELECT count(*) INTO n FROM visible_search_index(u) WHERE entity_id=o;
 PERFORM pg_temp.assert_true(n=0,'the owner working copy is not in the search index');
 RAISE NOTICE 'PASS owner_output_versions visibility and Search exclusion';
END $$;
ROLLBACK;
