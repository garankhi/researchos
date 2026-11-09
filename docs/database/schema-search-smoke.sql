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
--
-- The column holds the state of the work, not the state of a review. There is
-- no global REJECTED or DISMISSED value: a rejection belongs to a researcher
-- and lives in publication_claims, so a rejected work stays a CANDIDATE.
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

-- A rejection is per researcher, and it never touches the work.
--
-- The work keeps import_state = 'CANDIDATE' when one researcher rejects it:
-- a work is shared between researchers, and one of them saying "not mine"
-- says nothing about whether a co-author may still claim it. The decision
-- lives in publication_claims, so it is reversible - the rejection list
-- reads the same row back.
DO $$
DECLARE
 alice uuid=gen_random_uuid(); bob uuid=gen_random_uuid(); carol uuid=gen_random_uuid();
 o uuid; n int; s output_import_state;
BEGIN
 INSERT INTO users(id,user_type,email,full_name,department_unit)
 VALUES(alice,'FACULTY','reject-alice@test.invalid','Alice Rejector','FPTU'),
      (bob,'FACULTY','reject-bob@test.invalid','Bob Coauthor','FPTU'),
      (carol,'FACULTY','reject-carol@test.invalid','Carol Outsider','FPTU');

 -- A candidate pulled from OpenAlex: nobody owns it yet.
 INSERT INTO research_outputs(id,sharing_status,created_by,import_state)
 VALUES(gen_random_uuid(),'DRAFT',alice,'CANDIDATE') RETURNING id INTO o;

 -- Both researchers get a suggestion claim for the same work.
 INSERT INTO publication_claims(output_id,user_id,status,match_source)
 VALUES(o,alice,'SUGGESTED','OPENALEX'),(o,bob,'SUGGESTED','OPENALEX');

 -- Alice rejects it.
 UPDATE publication_claims SET status='REJECTED',reviewed_at=clock_timestamp()
  WHERE output_id=o AND user_id=alice;

 -- The work itself is unchanged: it is still a candidate.
 SELECT import_state INTO s FROM research_outputs WHERE id=o;
 PERFORM pg_temp.assert_true(s='CANDIDATE','a rejected candidate stays a candidate');

 -- Alice no longer sees it in the suggestion list...
 SELECT count(*) INTO n FROM visible_candidate_suggestions(alice) WHERE output_id=o;
 PERFORM pg_temp.assert_true(n=0,'a rejected candidate leaves the suggestion list');

 -- ...but she does see it in the rejection list, so the decision is reversible.
 SELECT count(*) INTO n FROM visible_rejected_candidates(alice) WHERE output_id=o;
 PERFORM pg_temp.assert_true(n=1,'the rejected candidate stays in the rejection list');

 -- Bob still gets it: the rejection is not global.
 SELECT count(*) INTO n FROM visible_candidate_suggestions(bob) WHERE output_id=o;
 PERFORM pg_temp.assert_true(n=1,'another researcher still sees the candidate');

 -- Carol, who has no claim, sees nothing.
 SELECT count(*) INTO n FROM visible_candidate_suggestions(carol) WHERE output_id=o;
 PERFORM pg_temp.assert_true(n=0,'an unrelated researcher sees no candidate');
 SELECT count(*) INTO n FROM visible_rejected_candidates(carol) WHERE output_id=o;
 PERFORM pg_temp.assert_true(n=0,'an unrelated researcher sees no rejection');

 -- Alice can still reach the work through the review queue, so she can
 -- accept it later without the row being deleted.
 SELECT count(*) INTO n FROM visible_candidate_reviews(alice) WHERE output_id=o;
 PERFORM pg_temp.assert_true(n=1,'a rejected candidate stays in the review queue');

 -- Accepting it later is the reverse transition on the same row. The claim
 -- goes back to SUGGESTED, which puts the work back into the suggestion
 -- list, and it can then be confirmed with an author_id.
 UPDATE publication_claims SET status='SUGGESTED',reviewed_at=NULL
  WHERE output_id=o AND user_id=alice;
 SELECT count(*) INTO n FROM visible_candidate_suggestions(alice) WHERE output_id=o;
 PERFORM pg_temp.assert_true(n=1,'reversing the rejection restores the suggestion');

 -- A confirmed claim needs the author it claims to be.
 PERFORM pg_temp.expect_error(
  format('UPDATE publication_claims SET status=''CONFIRMED'',reviewed_at=clock_timestamp() WHERE output_id=%L AND user_id=%L',o,alice),'23514');

 RAISE NOTICE 'PASS per-researcher rejection leaves the work a candidate and stays reversible';
END $$;

-- The candidate review queue has its own access rule. A candidate has no
-- owner and is not shared, so can_view_output cannot reach it at all.
DO $$
DECLARE
 u uuid=gen_random_uuid(); other uuid=gen_random_uuid(); o uuid; n int;
BEGIN
 INSERT INTO users(id,user_type,email,full_name,department_unit)
 VALUES(u,'FACULTY','candidate@test.invalid','Candidate Puller','FPTU'),
      (other,'FACULTY','candidate-other@test.invalid','Other Researcher','FPTU');
 INSERT INTO research_outputs(id,sharing_status,created_by,import_state)
 VALUES(gen_random_uuid(),'DRAFT',u,'CANDIDATE') RETURNING id INTO o;

 -- The puller can see their own candidate.
 PERFORM pg_temp.assert_true(can_view_candidate(u,o),'the puller sees their candidate');

 -- Another researcher cannot, until they have a claim for it.
 PERFORM pg_temp.assert_true(NOT can_view_candidate(other,o),'an unrelated researcher sees no candidate');
 PERFORM pg_temp.assert_true(NOT can_view_output(other,o),'can_view_output does not reach a candidate');

 INSERT INTO publication_claims(output_id,user_id,status,match_source)
 VALUES(o,other,'SUGGESTED','OPENALEX');
 PERFORM pg_temp.assert_true(can_view_candidate(other,o),'a claim opens the candidate');

 -- An accepted work is not a candidate any more.
 UPDATE research_outputs SET import_state='ACCEPTED',owner_id=u WHERE id=o;
 PERFORM pg_temp.assert_true(NOT can_view_candidate(u,o),'an accepted work is not a candidate');

 -- A candidate is not an owner working copy either.
 UPDATE research_outputs SET import_state='CANDIDATE',owner_id=NULL WHERE id=o;
 SELECT count(*) INTO n FROM owner_output_versions WHERE output_id=o;
 PERFORM pg_temp.assert_true(n=0,'a candidate is not an owner working copy');

 -- A candidate never reaches Discovery or Search.
 SELECT count(*) INTO n FROM released_output_versions WHERE output_id=o;
 PERFORM pg_temp.assert_true(n=0,'a candidate is not a released version');
 SELECT count(*) INTO n FROM search_index WHERE entity_type='OUTPUT' AND entity_id=o;
 PERFORM pg_temp.assert_true(n=0,'a candidate is not in the search index');

 -- The claim of somebody else does not hide the candidate from the actor
 -- who pulled it: the review queue holds one row per work, not one row
 -- per claim. The claim above already belongs to `other`.
 SELECT count(*) INTO n FROM visible_candidate_reviews(u) WHERE output_id=o;
 PERFORM pg_temp.assert_true(n=1,'the puller sees the candidate once, not once per claim');
 SELECT count(*) INTO n FROM visible_candidate_suggestions(u) WHERE output_id=o;
 PERFORM pg_temp.assert_true(n=1,'the puller sees the candidate in the suggestion list');

 RAISE NOTICE 'PASS candidate access rule and its exclusion from the released views';
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

-- Visible search rows need an active account, exactly like can_view_output.
-- A NULL, unknown or inactive actor must not reach community rows, and an
-- inactive owner must not reach their own private rows either.
DO $$
DECLARE
 u uuid=gen_random_uuid(); inactive uuid=gen_random_uuid(); o uuid; r uuid; n int;
BEGIN
 INSERT INTO users(id,user_type,email,full_name,department_unit)
 VALUES(u,'FACULTY','active-search@test.invalid','Active Searcher','FPTU'),
      (inactive,'FACULTY','inactive-search@test.invalid','Inactive Searcher','FPTU');
 UPDATE users SET is_active=false WHERE id=inactive;

 INSERT INTO research_outputs(id,sharing_status,owner_id,created_by)
 VALUES(gen_random_uuid(),'DRAFT',u,u) RETURNING id INTO o;
 INSERT INTO output_revisions(id,output_id,revision_no,title,created_by)
 VALUES(gen_random_uuid(),o,1,'Active Visibility Work',u) RETURNING id INTO r;
 UPDATE output_revisions SET released_at=clock_timestamp(),released_by=u WHERE id=r;
 UPDATE research_outputs SET sharing_status='SHARED',first_shared_at=clock_timestamp(),current_release_id=r WHERE id=o;

 -- An active actor sees the community row.
 SELECT count(*) INTO n FROM visible_search_index(u) WHERE entity_id=o;
 PERFORM pg_temp.assert_true(n=1,'an active actor sees the shared work');

 -- A NULL actor sees nothing.
 SELECT count(*) INTO n FROM visible_search_index(NULL) WHERE entity_id=o;
 PERFORM pg_temp.assert_true(n=0,'a NULL actor sees no search row');

 -- An unknown actor sees nothing.
 SELECT count(*) INTO n FROM visible_search_index(gen_random_uuid()) WHERE entity_id=o;
 PERFORM pg_temp.assert_true(n=0,'an unknown actor sees no search row');

 -- An inactive actor sees nothing, not even the community row.
 SELECT count(*) INTO n FROM visible_search_index(inactive) WHERE entity_id=o;
 PERFORM pg_temp.assert_true(n=0,'an inactive actor sees no search row');

 -- An inactive owner does not reach their own private row either.
 UPDATE research_outputs SET visibility='PRIVATE' WHERE id=o;
 UPDATE users SET is_active=false WHERE id=u;
 SELECT count(*) INTO n FROM visible_search_index(u) WHERE entity_id=o;
 PERFORM pg_temp.assert_true(n=0,'an inactive owner does not see their own private work');
 RAISE NOTICE 'PASS visible_search_index requires an active account';
END $$;

-- The search document of a work contains its author names, so a change to the
-- author list has to rebuild the document right away.
DO $$
DECLARE
 u uuid=gen_random_uuid(); o uuid; r uuid; a uuid; n int;
BEGIN
 INSERT INTO users(id,user_type,email,full_name,department_unit)
 VALUES(u,'FACULTY','authors-search@test.invalid','Author Tester','FPTU');
 INSERT INTO research_outputs(id,sharing_status,owner_id,created_by)
 VALUES(gen_random_uuid(),'DRAFT',u,u) RETURNING id INTO o;
 INSERT INTO output_revisions(id,output_id,revision_no,title,created_by)
 VALUES(gen_random_uuid(),o,1,'Author Document Work',u) RETURNING id INTO r;
 UPDATE output_revisions SET released_at=clock_timestamp(),released_by=u WHERE id=r;
 UPDATE research_outputs SET sharing_status='SHARED',first_shared_at=clock_timestamp(),current_release_id=r WHERE id=o;

 -- An added author becomes searchable without touching the work itself.
 INSERT INTO output_authors(id,output_id,author_name_string,author_order)
 VALUES(gen_random_uuid(),o,'Kandinsky Author',1) RETURNING id INTO a;
 SELECT count(*) INTO n FROM search_index
  WHERE entity_type='OUTPUT' AND entity_id=o AND doc @@ websearch_to_tsquery('simple','kandinsky');
 PERFORM pg_temp.assert_true(n=1,'an added author is searchable at once');

 -- A second author joins; the document holds both names.
 INSERT INTO output_authors(id,output_id,author_name_string,author_order)
 VALUES(gen_random_uuid(),o,'Malevich Author',2);
 SELECT count(*) INTO n FROM search_index
  WHERE entity_type='OUTPUT' AND entity_id=o AND doc @@ websearch_to_tsquery('simple','malevich');
 PERFORM pg_temp.assert_true(n=1,'a second added author is searchable at once');

 -- A renamed author replaces the old name in the document.
 UPDATE output_authors SET author_name_string='Kandinsky Renamed' WHERE id=a;
 SELECT count(*) INTO n FROM search_index
  WHERE entity_type='OUTPUT' AND entity_id=o AND doc @@ websearch_to_tsquery('simple','kandinsky');
 PERFORM pg_temp.assert_true(n=1,'a renamed author stays searchable');
 SELECT count(*) INTO n FROM search_index
  WHERE entity_type='OUTPUT' AND entity_id=o AND doc @@ websearch_to_tsquery('simple','malevich');
 PERFORM pg_temp.assert_true(n=1,'the other author is unaffected');

 -- A removed author stops matching at once.
 DELETE FROM output_authors WHERE id=a;
 SELECT count(*) INTO n FROM search_index
  WHERE entity_type='OUTPUT' AND entity_id=o AND doc @@ websearch_to_tsquery('simple','kandinsky');
 PERFORM pg_temp.assert_true(n=0,'a removed author stops matching');
 SELECT count(*) INTO n FROM search_index
  WHERE entity_type='OUTPUT' AND entity_id=o AND doc @@ websearch_to_tsquery('simple','malevich');
 PERFORM pg_temp.assert_true(n=1,'the remaining author is still searchable');
 RAISE NOTICE 'PASS output_authors changes refresh the search document';
END $$;

-- Deleting a researcher profile of a retained user removes the search row.
-- The account stays, but the profile's bio, title and document must not
-- stay publicly searchable.
DO $$
DECLARE
 u uuid=gen_random_uuid(); o uuid; r uuid; n int;
BEGIN
 INSERT INTO users(id,user_type,email,full_name,department_unit,academic_title)
 VALUES(u,'FACULTY','profile-search@test.invalid','Profile Searcher','FPTU','GS');
 INSERT INTO researcher_profiles(user_id,bio,profile_confirmed_at)
 VALUES(u,'A searchable biography',clock_timestamp());
 INSERT INTO research_outputs(id,sharing_status,owner_id,created_by)
 VALUES(gen_random_uuid(),'DRAFT',u,u) RETURNING id INTO o;
 INSERT INTO output_revisions(id,output_id,revision_no,title,created_by)
 VALUES(gen_random_uuid(),o,1,'Profile Visibility Work',u) RETURNING id INTO r;
 UPDATE output_revisions SET released_at=clock_timestamp(),released_by=u WHERE id=r;
 UPDATE research_outputs SET sharing_status='SHARED',first_shared_at=clock_timestamp(),current_release_id=r WHERE id=o;

 SELECT count(*) INTO n FROM search_index WHERE entity_type='RESEARCHER' AND entity_id=u;
 PERFORM pg_temp.assert_true(n=1,'a confirmed profile is indexed');

 DELETE FROM researcher_profiles WHERE user_id=u;
 SELECT count(*) INTO n FROM search_index WHERE entity_type='RESEARCHER' AND entity_id=u;
 PERFORM pg_temp.assert_true(n=0,'deleting the profile removes its search row');

 -- The account itself is untouched.
 SELECT count(*) INTO n FROM users WHERE id=u;
 PERFORM pg_temp.assert_true(n=1,'the account survives the profile deletion');
 RAISE NOTICE 'PASS researcher_profiles deletion clears the search row';
END $$;

-- An opportunity is a public job posting. A group publishes it to attract
-- people from outside the group, so the scope of the row never narrows who
-- may read it: the index row is community-wide even when the opportunity
-- belongs to a group.
DO $$
DECLARE
 u uuid=gen_random_uuid(); lead uuid=gen_random_uuid(); g uuid; op uuid; outsider uuid=gen_random_uuid(); n int;
BEGIN
 INSERT INTO users(id,user_type,email,full_name,department_unit)
 VALUES(u,'FACULTY','opp-search@test.invalid','Opportunity Tester','FPTU'),
      (lead,'FACULTY','opp-lead@test.invalid','Opportunity Lead','FPTU'),
      (outsider,'FACULTY','opp-outsider@test.invalid','Opportunity Outsider','FPTU');
 INSERT INTO research_groups(id,code,name,lead_id,description)
 VALUES(gen_random_uuid(),'OPP-SEARCH-GRP','Opportunity Search Group',lead,'Opportunity search group.');

 -- A group-scoped opportunity, published by the group's lead.
 INSERT INTO research_opportunities(id,group_id,opportunity_kind,target_audience,creator_id,title,description)
 VALUES(gen_random_uuid(),(SELECT id FROM research_groups WHERE code='OPP-SEARCH-GRP'),'RESEARCH_COLLABORATION','ANY_RESEARCHER',lead,'Group Opportunity','Group opportunity description.');
 UPDATE research_opportunities
    SET status='OPEN', application_deadline=clock_timestamp()+interval '30 days'
  WHERE title='Group Opportunity';

 SELECT id INTO op FROM research_opportunities WHERE title='Group Opportunity';

 -- The index row is community-wide, and carries no group scope.
 PERFORM pg_temp.assert_true(
  EXISTS(SELECT 1 FROM search_index WHERE entity_type='OPPORTUNITY' AND entity_id=op
    AND visibility='FPTU_COMMUNITY' AND access_group_id IS NULL),
  'a group opportunity is indexed as community-wide');

 -- An actor outside the group still sees it.
 SELECT count(*) INTO n FROM visible_search_index(outsider) WHERE entity_id=op;
 PERFORM pg_temp.assert_true(n=1,'an outsider sees a group opportunity in the index');

 RAISE NOTICE 'PASS a group opportunity is indexed as a public posting';
END $$;
ROLLBACK;
