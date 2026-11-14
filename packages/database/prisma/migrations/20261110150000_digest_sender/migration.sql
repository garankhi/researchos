ALTER TABLE digest_preferences ALTER COLUMN language SET DEFAULT 'en';

CREATE OR REPLACE FUNCTION guard_digest_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND (NEW.status<>'PENDING' OR NEW.attempts<>0) THEN RAISE EXCEPTION 'New digest starts pending with zero attempts' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
   IF OLD.status IN ('SENT','CANCELLED') OR (NEW.id,NEW.user_id,NEW.period_start,NEW.period_end) IS DISTINCT FROM (OLD.id,OLD.user_id,OLD.period_start,OLD.period_end) THEN
     RAISE EXCEPTION 'Terminal delivery or recipient/window identity is immutable' USING ERRCODE='23514'; END IF;
   IF NEW.attempts<OLD.attempts THEN RAISE EXCEPTION 'Attempts cannot decrease' USING ERRCODE='23514'; END IF;
   IF NEW.status='SENT' AND OLD.status<>'PROCESSING' THEN RAISE EXCEPTION 'Only a processing delivery can become sent' USING ERRCODE='23514'; END IF;
   IF NEW.status='PROCESSING' AND (OLD.status<>'PROCESSING' OR OLD.locked_until<=clock_timestamp()) AND NEW.attempts<>OLD.attempts+1 THEN
     RAISE EXCEPTION 'Each processing lease increments attempts' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.status='PROCESSING' AND (NEW.locked_until IS NULL OR NEW.locked_until<=clock_timestamp()) THEN RAISE EXCEPTION 'Processing requires a future lease' USING ERRCODE='23514'; END IF;
 -- Eligibility gates attempts. SENT records acceptance of an earlier submission.
 IF NEW.status='PROCESSING' THEN
   IF NOT is_researcher(NEW.user_id) OR NOT EXISTS (SELECT 1 FROM digest_preferences WHERE user_id=NEW.user_id AND enabled)
   OR NOT EXISTS (SELECT 1 FROM digest_items WHERE delivery_id=NEW.id) THEN
     RAISE EXCEPTION 'Dispatch requires eligible opted-in researcher and nonempty items' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
