BEGIN;

-- The group release view selects `output_revisions` with `r.*`, and a view
-- freezes the column list at creation time. The article creation migration
-- added publication_date, volume, issue, pages and peer_reviewed to
-- output_revisions with ALTER TABLE, which does not expand an existing
-- view. The view therefore still exposed the old 19-column shape while the
-- table had 24 columns.
--
-- Recreate the view so its column list matches the table. The new columns
-- are appended by `r.*` in table order, which is where the table itself
-- carries them, so the view and the table agree.
--
-- `visible_group_output_releases` returns SETOF group_output_releases, so
-- it depends on the view's row type and has to go first. It is recreated
-- unchanged below.

DROP FUNCTION IF EXISTS visible_group_output_releases(actor uuid, target_group uuid);

DROP VIEW IF EXISTS group_output_releases;

CREATE VIEW group_output_releases AS
 SELECT l.group_id,l.accepted_at,r.*
 FROM group_output_links l JOIN research_groups g ON g.id=l.group_id
 JOIN research_outputs o ON o.id=l.output_id
 JOIN output_revisions r ON r.id=l.accepted_revision_id AND r.output_id=l.output_id
 WHERE g.is_active AND g.archived_at IS NULL AND o.sharing_status='SHARED' AND r.released_at IS NOT NULL;

COMMENT ON VIEW group_output_releases IS
  'Releases accepted into a group, one row per accepted link, carrying the full accepted revision.';

CREATE FUNCTION visible_group_output_releases(actor uuid,target_group uuid) RETURNS SETOF group_output_releases LANGUAGE sql STABLE AS $$
 SELECT r.* FROM group_output_releases r WHERE r.group_id=target_group AND can_view_output(actor,r.output_id);
$$;

COMMIT;
