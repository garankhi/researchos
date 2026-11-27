\set ON_ERROR_STOP on
-- The scope and the audience of a work (RES-205). Disposable database only;
-- every fixture rolls back.
--
-- Two questions used to share one column, `visibility`: where was the work
-- posted and who owns it (the scope), and who may read it (the audience).
-- Fusing them made a contradiction possible - a group lead could alter a
-- personal post that merely carried the group banner. This file pins down
-- the two answers separately, for all four containers:
--
--   PERSONAL              - the author owns it
--   GROUP                 - the group's leads own it
--   PROJECT inside a group - the project lead and the parent group's leads own it
--   PROJECT standalone    - the project lead owns it
--
-- The rules are enforced by the database, so these are the only tests that
-- notice when a policy function stops doing what the schema says it does.
BEGIN;
CREATE FUNCTION pg_temp.scope_assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Scope assertion failed: %',message; END IF; END $$;
CREATE FUNCTION pg_temp.scope_error(command text, expected text) RETURNS void LANGUAGE plpgsql AS $$
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
 author uuid=gen_random_uuid();        -- the researcher who posts everything
 group_lead uuid=gen_random_uuid();     -- leads the group below
 group_member uuid=gen_random_uuid();  -- an ordinary member of that group
 project_lead uuid=gen_random_uuid();   -- leads both projects below
 project_member uuid=gen_random_uuid(); -- an ordinary member of the standalone project
 outsider uuid=gen_random_uuid();       -- a researcher in neither container
 grp uuid=gen_random_uuid(); other_grp uuid=gen_random_uuid();
 grp_project uuid=gen_random_uuid(); standalone_project uuid=gen_random_uuid();
 personal_work uuid=gen_random_uuid(); group_work uuid=gen_random_uuid();
 grp_project_work uuid=gen_random_uuid(); standalone_work uuid=gen_random_uuid();
 banner_work uuid=gen_random_uuid(); feed_banner_work uuid=gen_random_uuid();
 rev_personal uuid=gen_random_uuid(); rev_group uuid=gen_random_uuid();
 rev_grp_project uuid=gen_random_uuid(); rev_standalone uuid=gen_random_uuid();
 rev_feed_banner uuid=gen_random_uuid();
BEGIN
 INSERT INTO users(id,user_type,email,full_name,department_unit) VALUES
 (author,'FACULTY','scope-author@test.invalid','Author','FPTU'),
 (group_lead,'FACULTY','scope-group-lead@test.invalid','Group Lead','FPTU'),
 (group_member,'FACULTY','scope-group-member@test.invalid','Group Member','FPTU'),
 (project_lead,'FACULTY','scope-project-lead@test.invalid','Project Lead','FPTU'),
 (project_member,'FACULTY','scope-project-member@test.invalid','Project Member','FPTU'),
 (outsider,'FACULTY','scope-outsider@test.invalid','Outsider','FPTU');
 INSERT INTO research_groups(id,code,name,lead_id) VALUES
 (grp,'scope-group','Scope group',group_lead),(other_grp,'scope-other-group','Other group',group_lead);
 INSERT INTO group_members(group_id,user_id,role) VALUES
 (grp,group_member,'MEMBER'),(grp,author,'MEMBER');
 -- A project inside the group, and a project that stands alone.
 INSERT INTO research_projects(id,code,title,project_type,group_id,lead_id,status) VALUES
 (grp_project,'scope-grp-project','Project in a group','COLLABORATIVE_RESEARCH',grp,project_lead,'IN_PROGRESS'),
 (standalone_project,'scope-standalone-project','Standalone project','COLLABORATIVE_RESEARCH',NULL,project_lead,'IN_PROGRESS');
 INSERT INTO project_members(project_id,user_id,role) VALUES
 (standalone_project,project_member,'CO_PI');

 -- ---------------------------------------------------------------------
 -- The scope of a work is fixed at creation.
 -- ---------------------------------------------------------------------
 INSERT INTO research_outputs(id,owner_id,created_by,scope_type,scope_group_id,scope_project_id,audience) VALUES
 (personal_work,author,author,'PERSONAL',NULL,NULL,'PRIVATE'),
 (group_work,author,author,'GROUP',grp,NULL,'CONTAINER'),
 (grp_project_work,author,author,'PROJECT',grp,grp_project,'CONTAINER'),
 (standalone_work,author,author,'PROJECT',NULL,standalone_project,'CONTAINER');
 -- Moving a work to another container would silently change who may edit
 -- it, so the scope columns are immutable.
 PERFORM pg_temp.scope_error(
   format('UPDATE research_outputs SET scope_type=''GROUP'', scope_group_id=%L, scope_project_id=NULL WHERE id=%L',grp,personal_work),'23514');
 PERFORM pg_temp.scope_error(
   format('UPDATE research_outputs SET scope_group_id=%L WHERE id=%L',other_grp,group_work),'23514');
 PERFORM pg_temp.scope_error(
   format('UPDATE research_outputs SET scope_project_id=%L WHERE id=%L',standalone_project,grp_project_work),'23514');
 PERFORM pg_temp.scope_assert(
   (SELECT scope_type='PERSONAL' AND scope_group_id IS NULL AND scope_project_id IS NULL FROM research_outputs WHERE id=personal_work),
   'a refused scope change leaves the scope untouched');
 -- The audience is the part that does change.
 UPDATE research_outputs SET audience='FPTU_COMMUNITY' WHERE id=personal_work;
 PERFORM pg_temp.scope_assert(
   (SELECT audience='FPTU_COMMUNITY' FROM research_outputs WHERE id=personal_work),
   'the audience may change while the scope may not');

 -- ---------------------------------------------------------------------
 -- The scope must name a container that exists and is coherent.
 -- ---------------------------------------------------------------------
 -- A group scope needs its group, and may not also name a project.
 PERFORM pg_temp.scope_error(
   format('INSERT INTO research_outputs(owner_id,created_by,scope_type,scope_group_id,scope_project_id,audience) VALUES(%L,%L,''GROUP'',%L,%L,''CONTAINER'')',author,author,grp,grp_project),'23514');
 PERFORM pg_temp.scope_error(
   format('INSERT INTO research_outputs(owner_id,created_by,scope_type,audience) VALUES(%L,%L,''GROUP'',''CONTAINER'')',author,author),'23514');
 -- The scope must name a container that exists.
 PERFORM pg_temp.scope_error(
   format('INSERT INTO research_outputs(owner_id,created_by,scope_type,scope_group_id,audience) VALUES(%L,%L,''GROUP'',%L,''CONTAINER'')',author,author,gen_random_uuid()),'23503');
 PERFORM pg_temp.scope_error(
   format('INSERT INTO research_outputs(owner_id,created_by,scope_type,scope_project_id,audience) VALUES(%L,%L,''PROJECT'',%L,''CONTAINER'')',author,author,gen_random_uuid()),'23503');
 -- A personal work may never carry the container audience.
 PERFORM pg_temp.scope_error(
   format('INSERT INTO research_outputs(owner_id,created_by,scope_type,audience) VALUES(%L,%L,''PERSONAL'',''CONTAINER'')',author,author),'23514');
 -- The affiliation banner is display information: it may name the scope
 -- group, and it grants no authority over the work.
 INSERT INTO research_outputs(id,owner_id,created_by,scope_type,scope_group_id,audience,access_group_id)
 VALUES(banner_work,author,author,'PERSONAL',NULL,'PRIVATE',grp);
 PERFORM pg_temp.scope_assert(
   NOT can_manage_output_content(group_lead,banner_work)
   AND NOT can_change_output_visibility(group_lead,banner_work),
   'a group lead has no say over a personal work that merely carries the banner');

 -- ---------------------------------------------------------------------
 -- Who manages the content of a work. The affiliation plays no part.
 -- ---------------------------------------------------------------------
 -- A personal work is managed by its owner.
 PERFORM pg_temp.scope_assert(
   can_manage_output_content(author,personal_work) AND NOT can_manage_output_content(group_lead,personal_work)
   AND NOT can_manage_output_content(project_lead,personal_work),
   'a personal work is managed by its author alone');
 -- A group work is managed by the group's leads, and by nobody else.
 PERFORM pg_temp.scope_assert(
   can_manage_output_content(group_lead,group_work) AND NOT can_manage_output_content(group_member,group_work)
   AND NOT can_manage_output_content(author,group_work) AND NOT can_manage_output_content(outsider,group_work),
   'a group work is managed by the group leads, not by its poster');
 -- A project work inside a group is managed by the project lead and by the
 -- parent group's leads.
 PERFORM pg_temp.scope_assert(
   can_manage_output_content(project_lead,grp_project_work) AND can_manage_output_content(group_lead,grp_project_work)
   AND NOT can_manage_output_content(group_member,grp_project_work) AND NOT can_manage_output_content(author,grp_project_work),
   'a project work in a group is managed by the project lead and the group leads');
 -- A standalone project work is managed by the project lead alone: there is
 -- no parent group to share the authority with.
 PERFORM pg_temp.scope_assert(
   can_manage_output_content(project_lead,standalone_work) AND NOT can_manage_output_content(group_lead,standalone_work)
   AND NOT can_manage_output_content(project_member,standalone_work) AND NOT can_manage_output_content(author,standalone_work),
   'a standalone project work is managed by the project lead alone');

 -- ---------------------------------------------------------------------
 -- Who may set the audience, and which audiences are on offer.
 --
 -- The rule differs between a personal work and a container work, because
 -- a container work belongs to the container, not to its poster.
 -- ---------------------------------------------------------------------
 PERFORM pg_temp.scope_assert(
   allowed_output_audiences(personal_work)=ARRAY['PRIVATE'::output_audience,'FPTU_COMMUNITY'::output_audience],
   'a personal work offers private and community');
 PERFORM pg_temp.scope_assert(
   allowed_output_audiences(group_work)=ARRAY['CONTAINER'::output_audience,'FPTU_COMMUNITY'::output_audience]
   AND allowed_output_audiences(grp_project_work)=ARRAY['CONTAINER'::output_audience,'FPTU_COMMUNITY'::output_audience]
   AND allowed_output_audiences(standalone_work)=ARRAY['CONTAINER'::output_audience,'FPTU_COMMUNITY'::output_audience],
   'a container work offers its container and the community');
 -- The author of a personal work sets its audience, freely.
 PERFORM pg_temp.scope_assert(
   can_set_output_audience(author,personal_work,'PRIVATE')
   AND can_set_output_audience(author,personal_work,'FPTU_COMMUNITY')
   AND NOT can_set_output_audience(author,personal_work,'CONTAINER'),
   'the author of a personal work sets its audience');
 -- The poster of a group work may not: the group owns that post.
 PERFORM pg_temp.scope_assert(
   NOT can_set_output_audience(author,group_work,'CONTAINER')
   AND NOT can_set_output_audience(author,group_work,'FPTU_COMMUNITY'),
   'the poster of a group work may not set its audience');
 -- The group's leads may.
 PERFORM pg_temp.scope_assert(
   can_set_output_audience(group_lead,group_work,'CONTAINER')
   AND can_set_output_audience(group_lead,group_work,'FPTU_COMMUNITY')
   AND NOT can_set_output_audience(group_lead,group_work,'PRIVATE'),
   'the group leads set the audience of a group work');
 -- The project lead and the parent group's leads set the audience of a
 -- project work; an ordinary member may not.
 PERFORM pg_temp.scope_assert(
   can_set_output_audience(project_lead,grp_project_work,'FPTU_COMMUNITY')
   AND can_set_output_audience(group_lead,grp_project_work,'FPTU_COMMUNITY')
   AND NOT can_set_output_audience(group_member,grp_project_work,'FPTU_COMMUNITY'),
   'the project lead and the parent group leads set the audience of a project work');
 PERFORM pg_temp.scope_assert(
   can_set_output_audience(project_lead,standalone_work,'CONTAINER')
   AND NOT can_set_output_audience(group_lead,standalone_work,'CONTAINER')
   AND NOT can_set_output_audience(project_member,standalone_work,'CONTAINER'),
   'the project lead alone sets the audience of a standalone project work');

 -- ---------------------------------------------------------------------
 -- Who may read a work. A work is only readable once it is shared.
 -- ---------------------------------------------------------------------
 -- Nothing is readable while it is a draft.
 PERFORM pg_temp.scope_assert(
   NOT can_view_output(group_lead,group_work) AND NOT can_view_output(outsider,personal_work),
   'a draft is readable by nobody but its owner');
 -- Publish each work: a released revision and a shared status.
 INSERT INTO output_revisions(id,output_id,revision_no,title,created_by) VALUES
 (rev_personal,personal_work,1,'Personal work',author),
 (rev_group,group_work,1,'Group work',author),
 (rev_grp_project,grp_project_work,1,'Project in a group work',author),
 (rev_standalone,standalone_work,1,'Standalone project work',author);
 UPDATE output_revisions SET released_by=author,released_at=clock_timestamp() WHERE id IN (rev_personal,rev_group,rev_grp_project,rev_standalone);
 UPDATE research_outputs SET sharing_status='SHARED',current_release_id=rev_personal,first_shared_at=clock_timestamp() WHERE id=personal_work;
 UPDATE research_outputs SET sharing_status='SHARED',current_release_id=rev_group,first_shared_at=clock_timestamp() WHERE id=group_work;
 UPDATE research_outputs SET sharing_status='SHARED',current_release_id=rev_grp_project,first_shared_at=clock_timestamp() WHERE id=grp_project_work;
 UPDATE research_outputs SET sharing_status='SHARED',current_release_id=rev_standalone,first_shared_at=clock_timestamp() WHERE id=standalone_work;

 -- A personal work with the community audience is readable by any active
 -- researcher; with the private audience, by its owner alone.
 PERFORM pg_temp.scope_assert(
   can_view_output(group_lead,personal_work) AND can_view_output(outsider,personal_work),
   'a community personal work is readable by any researcher');
 UPDATE research_outputs SET audience='PRIVATE' WHERE id=personal_work;
 PERFORM pg_temp.scope_assert(
   NOT can_view_output(group_lead,personal_work) AND NOT can_view_output(outsider,personal_work)
   AND can_view_output(author,personal_work),
   'a private personal work is readable by its owner alone');

 -- A group work with the container audience is readable by the members of
 -- its group, and by nobody else.
 PERFORM pg_temp.scope_assert(
   can_view_output(group_member,group_work) AND can_view_output(group_lead,group_work)
   AND NOT can_view_output(outsider,group_work),
   'a group work with the container audience is readable by the group members');
 -- The group's default audience is what its new posts inherit.
 PERFORM pg_temp.scope_assert(
   group_default_audience(grp)='CONTAINER'::output_audience
   AND group_default_audience(other_grp)='CONTAINER'::output_audience,
   'a group defaults to the container audience');
 UPDATE research_groups SET visibility='FPTU_COMMUNITY' WHERE id=grp;
 PERFORM pg_temp.scope_assert(
   group_default_audience(grp)='FPTU_COMMUNITY'::output_audience,
   'a group may change its default audience');
 -- The audience of a work that already exists does not follow the change:
 -- a post snapshots the default when it is created.
 PERFORM pg_temp.scope_assert(
   (SELECT audience='CONTAINER' FROM research_outputs WHERE id=group_work),
   'a post keeps the audience it was created with');
 -- With the community audience, the group work reaches everybody.
 UPDATE research_outputs SET audience='FPTU_COMMUNITY' WHERE id=group_work;
 PERFORM pg_temp.scope_assert(
   can_view_output(outsider,group_work),
   'a community group work is readable by any researcher');
 UPDATE research_outputs SET audience='CONTAINER' WHERE id=group_work;

 -- A project work inside a group is readable by the whole parent group.
 PERFORM pg_temp.scope_assert(
   can_view_output(group_member,grp_project_work) AND can_view_output(group_lead,grp_project_work)
   AND can_view_output(project_lead,grp_project_work)
   AND NOT can_view_output(outsider,grp_project_work),
   'a project work in a group is readable by the parent group');
 -- A standalone project work is readable by the project members, and by
 -- nobody who is not one.
 PERFORM pg_temp.scope_assert(
   can_view_output(project_member,standalone_work) AND can_view_output(project_lead,standalone_work)
   AND NOT can_view_output(group_member,standalone_work) AND NOT can_view_output(outsider,standalone_work),
   'a standalone project work is readable by the project members');

 -- The search index applies the same rule, so a work never leaks through
 -- the search screen.
 PERFORM pg_temp.scope_assert(
   EXISTS(SELECT 1 FROM visible_search_index(group_member) WHERE entity_type='OUTPUT' AND entity_id=group_work)
   AND NOT EXISTS(SELECT 1 FROM visible_search_index(outsider) WHERE entity_type='OUTPUT' AND entity_id=group_work),
   'the search index follows the container audience');
 PERFORM pg_temp.scope_assert(
   EXISTS(SELECT 1 FROM visible_search_index(project_member) WHERE entity_type='OUTPUT' AND entity_id=standalone_work)
   AND NOT EXISTS(SELECT 1 FROM visible_search_index(group_member) WHERE entity_type='OUTPUT' AND entity_id=standalone_work),
   'the search index follows the standalone project membership');

 -- ---------------------------------------------------------------------
 -- A container's feed lists the works it owns, and only those.
 --
 -- The affiliation banner is display information: it may name a group
 -- without the group owning the work. So it must not decide membership of
 -- the group's feed. The feed is the query the API runs for a group, so
 -- a work that leaks in here is readable by every member of that group.
 -- ---------------------------------------------------------------------
 -- A personal work that merely carries the banner, published to the
 -- community so that anybody could read it.
 INSERT INTO research_outputs(id,owner_id,created_by,scope_type,scope_group_id,audience,access_group_id)
 VALUES(feed_banner_work,author,author,'PERSONAL',NULL,'FPTU_COMMUNITY',grp);
 INSERT INTO output_revisions(id,output_id,revision_no,title,created_by)
 VALUES(rev_feed_banner,feed_banner_work,1,'Personal work with a banner',author);
 UPDATE output_revisions SET released_by=author,released_at=clock_timestamp() WHERE id=rev_feed_banner;
 UPDATE research_outputs SET sharing_status='SHARED',current_release_id=rev_feed_banner,first_shared_at=clock_timestamp() WHERE id=feed_banner_work;

 -- The feed of a group: the works whose scope names it, plus the ones the
 -- group explicitly accepted.
 PERFORM pg_temp.scope_assert(
   NOT EXISTS (
     SELECT 1 FROM research_outputs o
     WHERE can_view_output(group_member,o.id)
       AND (o.scope_group_id=grp OR EXISTS (
         SELECT 1 FROM group_output_links gol
         WHERE gol.output_id=o.id AND gol.group_id=grp AND gol.status='ACCEPTED'
       ))
       AND o.id=feed_banner_work
   ),
   'a personal work that merely carries the banner is not in the group feed');
 -- The work the group owns is in its feed.
 PERFORM pg_temp.scope_assert(
   EXISTS (
     SELECT 1 FROM research_outputs o
     WHERE can_view_output(group_member,o.id)
       AND (o.scope_group_id=grp OR EXISTS (
         SELECT 1 FROM group_output_links gol
         WHERE gol.output_id=o.id AND gol.group_id=grp AND gol.status='ACCEPTED'
       ))
       AND o.id=group_work
   ),
   'the work a group owns is in the group feed');
 -- A standalone project work names no group, so it cannot appear in any
 -- group's feed.
 PERFORM pg_temp.scope_assert(
   (SELECT scope_group_id IS NULL AND scope_project_id=standalone_project FROM research_outputs WHERE id=standalone_work)
   AND NOT EXISTS (
     SELECT 1 FROM research_outputs o
     WHERE o.scope_type='PROJECT' AND o.scope_group_id IS NOT NULL AND o.scope_project_id=standalone_project
   ),
   'a standalone project work names no group at all');

 -- ---------------------------------------------------------------------
 -- An inactive account loses every access, even the owner's own.
 -- ---------------------------------------------------------------------
 UPDATE users SET is_active=false WHERE id=group_lead;
 PERFORM pg_temp.scope_assert(
   NOT can_view_output(group_lead,group_work) AND NOT can_manage_output_content(group_lead,group_work)
   AND NOT can_set_output_audience(group_lead,group_work,'CONTAINER'),
   'an inactive account keeps no access to a group work');
 UPDATE users SET is_active=true WHERE id=group_lead;
 PERFORM pg_temp.scope_assert(
   can_manage_output_content(group_lead,group_work),
   'reactivating the account restores the access');

 RAISE NOTICE 'PASS output scope immutability, container authority, audience choices and container audiences';
END $$;
ROLLBACK;
