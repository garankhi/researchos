-- The rebuild path: the index must be recoverable from the source tables.
--
-- The maintenance trigger only ever sees the rows written after it exists.
-- `rebuild_search_index()` is the way back for the rows it never saw, so it
-- has to produce exactly the index the trigger would have produced.
--
-- The last block writes one set of rows with the triggers turned off, using
-- `session_replication_role = replica`. That parameter is `SUSET`, so this
-- file needs a superuser. The CI job and the local test cluster both run as
-- `postgres`, which is a superuser.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',message; END IF; END $$;

-- A rebuild on an empty index stays empty.
DO $$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM search_index;
 PERFORM pg_temp.assert_true(n=0,'the index starts empty');
 PERFORM rebuild_search_index();
 SELECT count(*) INTO n FROM search_index;
 PERFORM pg_temp.assert_true(n=0,'a rebuild of an empty database leaves the index empty');
END $$;

-- Build one of every entity type.
DO $$
DECLARE
 u uuid=gen_random_uuid(); lead uuid=gen_random_uuid(); o uuid; r uuid; g uuid; op uuid; n int;
BEGIN
 INSERT INTO users(id,user_type,email,full_name,department_unit)
 VALUES(u,'FACULTY','rebuild@test.invalid','Rebuild Tester','FPTU'),
      (lead,'FACULTY','rebuild-lead@test.invalid','Rebuild Lead','FPTU');

 -- A confirmed profile makes the researcher indexable.
 INSERT INTO researcher_profiles(user_id,profile_confirmed_at,bio)
 VALUES(u,clock_timestamp(),'Rebuild researcher bio.');

 -- A group needs an active researcher as its lead.
 INSERT INTO research_groups(id,code,name,lead_id,description)
 VALUES(gen_random_uuid(),'REBUILD-GRP','Rebuild Group',u,'Rebuild group description.');

 -- An open opportunity. It is created as DRAFT and then published, because
 -- the trigger normalize_opportunity rejects an opportunity that is created
 -- in any other state.
 INSERT INTO research_opportunities(id,opportunity_kind,target_audience,creator_id,title,description)
 VALUES(gen_random_uuid(),'RESEARCH_COLLABORATION','ANY_RESEARCHER',u,'Rebuild Opportunity','Rebuild opportunity description.');
 UPDATE research_opportunities
    SET status='OPEN', application_deadline=clock_timestamp()+interval '30 days'
  WHERE title='Rebuild Opportunity';

 -- A published work with a released revision.
 INSERT INTO research_outputs(id,sharing_status,owner_id,created_by)
 VALUES(gen_random_uuid(),'DRAFT',u,u) RETURNING id INTO o;
 INSERT INTO output_revisions(id,output_id,revision_no,title,abstract,created_by)
 VALUES(gen_random_uuid(),o,1,'Rebuild Work','Rebuild abstract.',u) RETURNING id INTO r;
 UPDATE output_revisions SET released_at=clock_timestamp(),released_by=u WHERE id=r;
 UPDATE research_outputs SET sharing_status='SHARED',first_shared_at=clock_timestamp(),current_release_id=r WHERE id=o;

 -- The trigger already indexed everything. Drop the index rows so the
 -- rebuild has to put them back on its own. This is the situation the
 -- rebuild exists for: rows the trigger never saw.
 DELETE FROM search_index;
 SELECT count(*) INTO n FROM search_index;
 PERFORM pg_temp.assert_true(n=0,'the index rows are gone before the rebuild');

 -- The rebuild puts every entity type back.
 PERFORM rebuild_search_index();
 SELECT count(*) INTO n FROM search_index WHERE entity_type='OUTPUT';
 PERFORM pg_temp.assert_true(n=1,'the rebuild indexes the published work');
 SELECT count(*) INTO n FROM search_index WHERE entity_type='RESEARCHER';
 PERFORM pg_temp.assert_true(n=1,'the rebuild indexes the confirmed researcher');
 SELECT count(*) INTO n FROM search_index WHERE entity_type='GROUP';
 PERFORM pg_temp.assert_true(n=1,'the rebuild indexes the active group');
 SELECT count(*) INTO n FROM search_index WHERE entity_type='OPPORTUNITY';
 PERFORM pg_temp.assert_true(n=1,'the rebuild indexes the open opportunity');

 -- The rebuilt payload is searchable, so the rebuilt row is a real index row.
 PERFORM pg_temp.assert_true(
  EXISTS(SELECT 1 FROM search_index WHERE entity_type='OUTPUT'
    AND doc @@ websearch_to_tsquery('simple','rebuild')),'the rebuilt payload is searchable');

 -- The rebuild is idempotent: running it twice gives the same index.
 PERFORM rebuild_search_index();
 SELECT count(*) INTO n FROM search_index;
 PERFORM pg_temp.assert_true(n=4,'a second rebuild leaves the same four rows');

 RAISE NOTICE 'PASS the rebuild restores every entity type and is idempotent';
END $$;

-- The rebuild also removes the rows that must not be indexed.
DO $$
DECLARE
 u uuid=gen_random_uuid(); o uuid; r uuid; n int;
BEGIN
 INSERT INTO users(id,user_type,email,full_name,department_unit)
 VALUES(u,'FACULTY','stale@test.invalid','Stale Tester','FPTU');
 INSERT INTO researcher_profiles(user_id,profile_confirmed_at,bio)
 VALUES(u,clock_timestamp(),'Stale bio.');
 INSERT INTO research_outputs(id,sharing_status,owner_id,created_by)
 VALUES(gen_random_uuid(),'DRAFT',u,u) RETURNING id INTO o;
 INSERT INTO output_revisions(id,output_id,revision_no,title,created_by)
 VALUES(gen_random_uuid(),o,1,'Stale Work',u) RETURNING id INTO r;
 UPDATE output_revisions SET released_at=clock_timestamp(),released_by=u WHERE id=r;

 -- The work stays a draft, so the trigger must not index it.
 SELECT count(*) INTO n FROM search_index WHERE entity_type='OUTPUT' AND entity_id=o;
 PERFORM pg_temp.assert_true(n=0,'the draft work is not indexed');

 -- Plant a stale row by hand, the way a broken trigger would. The row is
 -- allowed by the guard, because the draft work does exist.
 INSERT INTO search_index(entity_type,entity_id,visibility,title,doc)
 VALUES('OUTPUT',o,'FPTU_COMMUNITY','Stale Work',to_tsvector('simple','stale work'));
 SELECT count(*) INTO n FROM search_index WHERE entity_type='OUTPUT' AND entity_id=o;
 PERFORM pg_temp.assert_true(n=1,'the stale row is planted');

 -- The rebuild removes it, because the source row is not indexable.
 PERFORM rebuild_search_index();
 SELECT count(*) INTO n FROM search_index WHERE entity_type='OUTPUT' AND entity_id=o;
 PERFORM pg_temp.assert_true(n=0,'the rebuild removes a row that must not be indexed');

 RAISE NOTICE 'PASS the rebuild removes rows that must not be indexed';
END $$;

-- A deactivated researcher leaves the index on a rebuild.
DO $$
DECLARE
 u uuid=gen_random_uuid(); n int;
BEGIN
 INSERT INTO users(id,user_type,email,full_name,department_unit)
 VALUES(u,'FACULTY','deactivated@test.invalid','Deactivated Tester','FPTU');
 INSERT INTO researcher_profiles(user_id,profile_confirmed_at,bio)
 VALUES(u,clock_timestamp(),'Deactivated bio.');

 SELECT count(*) INTO n FROM search_index WHERE entity_type='RESEARCHER' AND entity_id=u;
 PERFORM pg_temp.assert_true(n=1,'the confirmed researcher is indexed');

 UPDATE users SET is_active=false WHERE id=u;
 PERFORM rebuild_search_index();
 SELECT count(*) INTO n FROM search_index WHERE entity_type='RESEARCHER' AND entity_id=u;
 PERFORM pg_temp.assert_true(n=0,'a deactivated researcher leaves the index on a rebuild');

 RAISE NOTICE 'PASS a deactivated researcher leaves the index on a rebuild';
END $$;

-- The rebuild has to produce exactly the index the trigger produces.
--
-- The two paths are only equivalent if they agree on every row. This test
-- builds the same data twice: once letting the trigger index it, and once
-- letting the rebuild index it, then compares the two indexes row by row.
--
-- The second set is written with session_replication_role = replica, which
-- turns the triggers off. That is the situation the rebuild exists for: rows
-- the trigger never saw.
-- The two sets hold exactly the same data. Only the fields that have to be
-- unique carry the prefix, so the indexed text is identical and the two
-- index rows can be compared. The id is the only thing that differs, and
-- the id is not part of the comparison.
--
-- The ids are derived from the prefix with md5, so the two sets never
-- collide on a primary key and each set keeps its own ids even though the
-- rows look the same.
CREATE TEMP TABLE pg_temp.fixture_ids(prefix text, entity_type search_entity_type, entity_id uuid);

CREATE FUNCTION pg_temp.build_fixtures(prefix text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  u uuid; o uuid; g uuid; op uuid;
BEGIN
 u := md5(prefix||'-user')::uuid;
 o := md5(prefix||'-output')::uuid;
 g := md5(prefix||'-group')::uuid;
 op := md5(prefix||'-opportunity')::uuid;

 INSERT INTO users(id,user_type,email,full_name,academic_title,department_unit)
 VALUES(u,'FACULTY',prefix||'-user@test.invalid','Rebuild Tester','Dr','Rebuild Dept');

 INSERT INTO researcher_profiles(user_id,profile_confirmed_at,bio)
 VALUES(u,clock_timestamp(),'Rebuild researcher bio.');

 INSERT INTO research_groups(id,code,name,lead_id,description)
 VALUES(g,prefix||'-GRP','Rebuild Group',u,'Rebuild group description.');

 INSERT INTO research_opportunities(id,opportunity_kind,target_audience,creator_id,title,description)
 VALUES(op,'RESEARCH_COLLABORATION','ANY_RESEARCHER',u,'Rebuild Opportunity','Rebuild opportunity description.');
 UPDATE research_opportunities
    SET status='OPEN', published_at=clock_timestamp(), application_deadline=clock_timestamp()+interval '30 days'
  WHERE id=op;

 INSERT INTO research_outputs(id,sharing_status,owner_id,created_by)
 VALUES(o,'DRAFT',u,u);
 INSERT INTO output_revisions(id,output_id,revision_no,title,abstract,created_by)
 VALUES(md5(prefix||'-revision')::uuid,o,1,'Rebuild Work','Rebuild abstract.',u);
 UPDATE output_revisions SET released_at=clock_timestamp(),released_by=u WHERE output_id=o;
 UPDATE research_outputs SET sharing_status='SHARED',first_shared_at=clock_timestamp(),
   current_release_id=(SELECT id FROM output_revisions WHERE output_id=o) WHERE id=o;

 INSERT INTO pg_temp.fixture_ids VALUES
   (prefix,'RESEARCHER',u),(prefix,'OUTPUT',o),(prefix,'GROUP',g),(prefix,'OPPORTUNITY',op);
END $$;

DO $$
DECLARE
 n int; d int;
BEGIN
 -- The first set is indexed by the trigger as it is written.
 PERFORM pg_temp.build_fixtures('trigger');

 -- The second set is written with the trigger turned off, so only the
 -- rebuild can index it.
 SET session_replication_role = replica;
 PERFORM pg_temp.build_fixtures('rebuild');
 SET session_replication_role = origin;

 -- Only the first set is in the index now. The count is scoped to the
 -- fixtures, because the blocks above left rows of their own behind.
 SELECT count(*) INTO n FROM search_index s
  JOIN pg_temp.fixture_ids f ON f.entity_id=s.entity_id AND f.entity_type=s.entity_type;
 PERFORM pg_temp.assert_true(n=4,'the trigger indexed the first set only');

 -- The rebuild adds the second set.
 PERFORM rebuild_search_index();
 SELECT count(*) INTO n FROM search_index s
  JOIN pg_temp.fixture_ids f ON f.entity_id=s.entity_id AND f.entity_type=s.entity_type;
 PERFORM pg_temp.assert_true(n=8,'the rebuild adds the second set');

 -- The two sets must agree on every column of every row, except the
 -- identity of the row itself.
 SELECT count(*) INTO d FROM (
   SELECT s.entity_type,s.visibility,s.access_group_id,s.title,s.body,s.authors_text,s.doc
     FROM search_index s JOIN pg_temp.fixture_ids f ON f.entity_id=s.entity_id AND f.entity_type=s.entity_type
    WHERE f.prefix='trigger'
   EXCEPT
   SELECT s.entity_type,s.visibility,s.access_group_id,s.title,s.body,s.authors_text,s.doc
     FROM search_index s JOIN pg_temp.fixture_ids f ON f.entity_id=s.entity_id AND f.entity_type=s.entity_type
    WHERE f.prefix='rebuild'
 ) x;
 PERFORM pg_temp.assert_true(d=0,'the trigger index and the rebuilt index agree');

 SELECT count(*) INTO d FROM (
   SELECT s.entity_type,s.visibility,s.access_group_id,s.title,s.body,s.authors_text,s.doc
     FROM search_index s JOIN pg_temp.fixture_ids f ON f.entity_id=s.entity_id AND f.entity_type=s.entity_type
    WHERE f.prefix='rebuild'
   EXCEPT
   SELECT s.entity_type,s.visibility,s.access_group_id,s.title,s.body,s.authors_text,s.doc
     FROM search_index s JOIN pg_temp.fixture_ids f ON f.entity_id=s.entity_id AND f.entity_type=s.entity_type
    WHERE f.prefix='trigger'
 ) x;
 PERFORM pg_temp.assert_true(d=0,'the rebuilt index and the trigger index agree');

 RAISE NOTICE 'PASS the rebuild and the trigger produce the same index';
END $$;

ROLLBACK;
