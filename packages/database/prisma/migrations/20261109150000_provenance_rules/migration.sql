-- Provenance writer rules (RES-14, RES-140).
--
-- The table field_provenance already exists (RES-149). This migration adds
-- the two verification CHECKs from docs/database.md §5.2.4 and the lock
-- trigger that no CHECK can express because it spans rows:
--
-- 1. ck_field_provenance_unk_unverified: a field whose provenance is UNK
--    is never VERIFIED — it needs a human to adjudicate.
-- 2. ck_field_provenance_no_auto_verify: AI_INF is never auto-promoted to
--    VERIFIED. Only a human confirmation (which sets is_locked) may stamp
--    verified_at on an AI_INF row.
-- 3. guard_field_provenance_lock: a field a human has confirmed (is_locked)
--    is never overwritten by a sync. The override direction is one-way,
--    human wins over machine.
--
-- A sync write is any row written with is_locked = false. It is rejected
-- when a locked row already exists for the same (entity_type, entity_id,
-- field_name), whatever its source_ref: the PK keeps per-origin history,
-- so a re-sync under a new source_ref is still an overwrite of the field.
-- The human path always carries is_locked = true, so it passes the INSERT
-- guard; an UPDATE of an already-locked row may only touch
-- is_locked/verified_at — re-confirming, never re-sourcing.
BEGIN;

ALTER TABLE field_provenance
  ADD CONSTRAINT ck_field_provenance_unk_unverified
  CHECK (source <> 'UNK' OR verified_at IS NULL);

ALTER TABLE field_provenance
  ADD CONSTRAINT ck_field_provenance_no_auto_verify
  CHECK (source <> 'AI_INF' OR verified_at IS NULL OR is_locked);

CREATE FUNCTION guard_field_provenance_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NOT NEW.is_locked AND EXISTS (
     SELECT 1 FROM field_provenance
     WHERE entity_type=NEW.entity_type AND entity_id=NEW.entity_id
       AND field_name=NEW.field_name AND is_locked
   ) THEN
     RAISE EXCEPTION 'Field is locked by a human confirmation; sync must not overwrite it' USING ERRCODE='23514';
   END IF;
   RETURN NEW;
 END IF;
 IF OLD.is_locked THEN
   IF (NEW.entity_type,NEW.entity_id,NEW.field_name,NEW.source,NEW.source_ref,NEW.synced_at)
      IS DISTINCT FROM
      (OLD.entity_type,OLD.entity_id,OLD.field_name,OLD.source,OLD.source_ref,OLD.synced_at) THEN
     RAISE EXCEPTION 'Field is locked by a human confirmation; sync must not overwrite it' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER guard_field_provenance_lock BEFORE INSERT OR UPDATE ON field_provenance
 FOR EACH ROW EXECUTE FUNCTION guard_field_provenance_lock();

COMMIT;
