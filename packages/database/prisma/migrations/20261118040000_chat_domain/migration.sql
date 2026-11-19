-- Standalone real-time chat domain (RES-166).
-- Decoupled from research_groups and all other domain entities.

CREATE TYPE "chat_conversation_type" AS ENUM (
  'DIRECT',
  'GROUP'
);

CREATE TYPE "chat_participant_role" AS ENUM (
  'MEMBER',
  'OWNER'
);

CREATE TYPE "chat_receipt_status" AS ENUM (
  'PENDING',
  'SENT',
  'DELIVERED',
  'FAILED'
);

CREATE TABLE "chat_conversations" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "title" varchar(120),
  "type" chat_conversation_type NOT NULL DEFAULT 'DIRECT',
  "created_by" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "updated_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "archived_at" timestamptz,
  CONSTRAINT "ck_chat_conversation_title" CHECK (title IS NULL OR btrim(title) <> '')
);

CREATE TABLE "chat_conversation_participants" (
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" chat_participant_role NOT NULL DEFAULT 'MEMBER',
  "joined_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "last_read_message_id" uuid,
  "last_read_at" timestamptz,
  "notification_muted" boolean NOT NULL DEFAULT false,
  PRIMARY KEY ("conversation_id", "user_id")
);

CREATE TABLE "chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "conversation_id" uuid NOT NULL,
  "sender_id" uuid NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "client_nonce" varchar(128),
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "edited_at" timestamptz,
  "deleted_at" timestamptz,
  "deleted_by" uuid,
  CONSTRAINT "ck_chat_message_body_len" CHECK (char_length(body) <= 4000),
  CONSTRAINT "ck_chat_message_deleted_pair" CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);

CREATE TABLE "chat_message_mentions" (
  "message_id" uuid NOT NULL,
  "mentioned_user_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "mentioned_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY ("message_id", "mentioned_user_id")
);

CREATE TABLE "chat_message_reactions" (
  "message_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "reaction" varchar(32) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY ("message_id", "user_id", "reaction"),
  CONSTRAINT "ck_chat_reaction_nonempty" CHECK (btrim(reaction) <> '')
);

CREATE TABLE "chat_message_attachments" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "message_id" uuid,
  "conversation_id" uuid NOT NULL,
  "uploaded_by" uuid NOT NULL,
  "storage_key" text UNIQUE NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "size_bytes" bigint NOT NULL,
  "sha256" varchar(64) NOT NULL,
  "width" integer,
  "height" integer,
  "created_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT "ck_chat_attachment_size" CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  CONSTRAINT "ck_chat_attachment_sha256" CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ck_chat_attachment_dimensions" CHECK ((width IS NULL AND height IS NULL) OR (width > 0 AND height > 0))
);

CREATE TABLE "chat_message_reads" (
  "message_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "read_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY ("message_id", "user_id")
);

CREATE TABLE "chat_message_receipts" (
  "message_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "status" chat_receipt_status NOT NULL DEFAULT 'PENDING',
  "updated_at" timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY ("message_id", "user_id")
);

ALTER TABLE "chat_conversations"
  ADD CONSTRAINT "chat_conversations_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "chat_conversation_participants"
  ADD CONSTRAINT "chat_conversation_participants_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "chat_conversation_participants"
  ADD CONSTRAINT "chat_conversation_participants_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "chat_conversation_participants"
  ADD CONSTRAINT "chat_conversation_participants_last_read_message_id_fkey"
  FOREIGN KEY ("last_read_message_id") REFERENCES "chat_messages" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_deleted_by_fkey"
  FOREIGN KEY ("deleted_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "chat_message_mentions"
  ADD CONSTRAINT "chat_message_mentions_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "chat_messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "chat_message_mentions"
  ADD CONSTRAINT "chat_message_mentions_mentioned_user_id_fkey"
  FOREIGN KEY ("mentioned_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "chat_message_mentions"
  ADD CONSTRAINT "chat_message_mentions_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "chat_message_reactions"
  ADD CONSTRAINT "chat_message_reactions_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "chat_messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "chat_message_reactions"
  ADD CONSTRAINT "chat_message_reactions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "chat_message_attachments"
  ADD CONSTRAINT "chat_message_attachments_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "chat_messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "chat_message_attachments"
  ADD CONSTRAINT "chat_message_attachments_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "chat_message_attachments"
  ADD CONSTRAINT "chat_message_attachments_uploaded_by_fkey"
  FOREIGN KEY ("uploaded_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "chat_message_reads"
  ADD CONSTRAINT "chat_message_reads_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "chat_messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "chat_message_reads"
  ADD CONSTRAINT "chat_message_reads_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "chat_message_receipts"
  ADD CONSTRAINT "chat_message_receipts_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "chat_messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "chat_message_receipts"
  ADD CONSTRAINT "chat_message_receipts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE INDEX "idx_chat_conversations_created_by" ON "chat_conversations" ("created_by");
CREATE INDEX "idx_chat_conversations_archived_at" ON "chat_conversations" ("archived_at");
CREATE INDEX "idx_chat_conversations_active" ON "chat_conversations" ("updated_at") WHERE (archived_at IS NULL);

CREATE INDEX "idx_chat_participants_user_id" ON "chat_conversation_participants" ("user_id");
CREATE INDEX "idx_chat_participants_user_conversation" ON "chat_conversation_participants" ("user_id", "conversation_id");
CREATE INDEX "idx_chat_participants_last_read_msg" ON "chat_conversation_participants" ("last_read_message_id");

CREATE UNIQUE INDEX "uq_chat_messages_client_nonce"
  ON "chat_messages" ("conversation_id", "sender_id", "client_nonce")
  WHERE (client_nonce IS NOT NULL);
CREATE INDEX "idx_chat_messages_history" ON "chat_messages" ("conversation_id", "created_at", "id");
CREATE INDEX "idx_chat_messages_sender" ON "chat_messages" ("sender_id", "created_at");

CREATE INDEX "idx_chat_mentions_user_id" ON "chat_message_mentions" ("mentioned_user_id");
CREATE INDEX "idx_chat_mentions_conversation_id" ON "chat_message_mentions" ("conversation_id");
CREATE INDEX "idx_chat_mentions_user_time" ON "chat_message_mentions" ("mentioned_user_id", "mentioned_at");

CREATE INDEX "idx_chat_reactions_message_id" ON "chat_message_reactions" ("message_id");

CREATE INDEX "idx_chat_attachments_message_id" ON "chat_message_attachments" ("message_id");
CREATE INDEX "idx_chat_attachments_conversation_id" ON "chat_message_attachments" ("conversation_id");
CREATE INDEX "idx_chat_attachments_uploaded_by" ON "chat_message_attachments" ("uploaded_by");

CREATE INDEX "idx_chat_reads_user_id" ON "chat_message_reads" ("user_id");
CREATE INDEX "idx_chat_reads_message_user" ON "chat_message_reads" ("message_id", "user_id");

CREATE INDEX "idx_chat_receipts_user_status" ON "chat_message_receipts" ("user_id", "status");

-- Database-level participant & attachment consistency guards for chat.
CREATE OR REPLACE FUNCTION guard_chat_message_participant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM chat_conversation_participants
    WHERE conversation_id = NEW.conversation_id AND user_id = NEW.sender_id
  ) THEN
    RAISE EXCEPTION 'Chat message sender must be a conversation participant' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_chat_message_participant
  BEFORE INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION guard_chat_message_participant();

CREATE OR REPLACE FUNCTION guard_chat_attachment_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  msg_conv uuid;
BEGIN
  IF NEW.message_id IS NOT NULL THEN
    SELECT conversation_id INTO msg_conv FROM chat_messages WHERE id = NEW.message_id;
    IF msg_conv IS NULL OR msg_conv <> NEW.conversation_id THEN
      RAISE EXCEPTION 'Chat attachment message must belong to the same conversation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_chat_attachment_consistency
  BEFORE INSERT OR UPDATE ON chat_message_attachments
  FOR EACH ROW EXECUTE FUNCTION guard_chat_attachment_consistency();

CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE FUNCTION guard_chat_message_content() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cur_body text;
  cur_deleted_at timestamptz;
BEGIN
  SELECT body, deleted_at INTO cur_body, cur_deleted_at FROM chat_messages WHERE id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF cur_deleted_at IS NULL AND btrim(cur_body) = '' AND NOT EXISTS (
    SELECT 1 FROM chat_message_attachments WHERE message_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Chat message body cannot be empty without confirmed attachments' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER trg_chat_message_content
  AFTER INSERT OR UPDATE ON chat_messages
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION guard_chat_message_content();
