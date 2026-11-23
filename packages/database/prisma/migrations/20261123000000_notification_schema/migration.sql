BEGIN;

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('OUTPUT_SHARED', 'REVISION_RELEASED', 'OUTPUT_LINKED', 'OPPORTUNITY_OPENED', 'SEMINAR_PUBLISHED', 'CHAT_MENTION', 'DIRECT_MESSAGE', 'GROUP_MEMBER_ADDED', 'GROUP_MEMBER_REMOVED', 'GROUP_OUTPUT_REQUESTED', 'GROUP_OUTPUT_ACCEPTED', 'GROUP_OUTPUT_REJECTED', 'APPLICATION_RECEIVED', 'APPLICATION_ACCEPTED', 'APPLICATION_DECLINED', 'APPLICATION_WITHDRAWN', 'OPPORTUNITY_EXPIRED', 'FOLLOW', 'CONVERSATION_PARTICIPANT_ADDED');

-- CreateEnum
CREATE TYPE "notification_subject_type" AS ENUM ('OUTPUT', 'GROUP', 'OPPORTUNITY', 'SEMINAR', 'MESSAGE', 'CONVERSATION', 'APPLICATION', 'RESEARCHER');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('WEBSOCKET', 'FCM');

-- CreateEnum
CREATE TYPE "notification_delivery_status" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "push_platform" AS ENUM ('WEB', 'ANDROID', 'IOS');

-- CreateTable
CREATE TABLE "notification_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_key" VARCHAR(200) NOT NULL,
    "event_type" "notification_type" NOT NULL,
    "actor_id" UUID,
    "subject_type" "notification_subject_type" NOT NULL,
    "subject_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_id" UUID NOT NULL,
    "event_key" VARCHAR(200) NOT NULL,
    "event_type" "notification_type" NOT NULL,
    "actor_id" UUID,
    "subject_type" "notification_subject_type" NOT NULL,
    "subject_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "content_snapshot" JSONB NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "device_id" UUID,
    "status" "notification_delivery_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(6),
    "provider_message_id" TEXT,
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token" VARCHAR(1024) NOT NULL,
    "platform" "push_platform" NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "websocket_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "muted_types" "notification_type"[] NOT NULL DEFAULT ARRAY[]::"notification_type"[],
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_events_event_key_key" ON "notification_events"("event_key");

-- CreateIndex
CREATE INDEX "idx_notification_events_pending" ON "notification_events"("created_at", "id") WHERE (processed_at IS NULL);

-- CreateIndex
CREATE INDEX "notification_events_actor_id_idx" ON "notification_events"("actor_id");

-- CreateIndex
CREATE INDEX "idx_notifications_inbox" ON "notifications"("recipient_id", "created_at" DESC, "id" DESC) WHERE (archived_at IS NULL);

-- CreateIndex
CREATE INDEX "idx_notifications_unread" ON "notifications"("recipient_id") WHERE ((archived_at IS NULL) AND (read_at IS NULL));

-- CreateIndex
CREATE INDEX "notifications_actor_id_idx" ON "notifications"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_recipient_id_event_key_key" ON "notifications"("recipient_id", "event_key");

-- CreateIndex
CREATE INDEX "notification_deliveries_device_id_idx" ON "notification_deliveries"("device_id");

-- CreateIndex
CREATE INDEX "idx_notification_deliveries_ready" ON "notification_deliveries"("next_attempt_at", "id") WHERE (status = 'PENDING'::notification_delivery_status);

-- CreateIndex
CREATE INDEX "idx_notification_deliveries_lease" ON "notification_deliveries"("locked_until") WHERE (status = 'PROCESSING'::notification_delivery_status);

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_notification_id_channel_device_id_key" ON "notification_deliveries"("notification_id", "channel", "device_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_notification_delivery_without_device" ON "notification_deliveries"("notification_id", "channel") WHERE (device_id IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_token_key" ON "push_devices"("token");

-- CreateIndex
CREATE INDEX "push_devices_user_id_is_active_idx" ON "push_devices"("user_id", "is_active");

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "push_devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE notification_deliveries
  ADD CONSTRAINT ck_notification_delivery_attempts CHECK (attempts >= 0),
  ADD CONSTRAINT ck_notification_delivery_target CHECK ((channel = 'FCM') = (device_id IS NOT NULL));

ALTER TABLE push_devices
  ADD CONSTRAINT ck_push_devices_revoked_inactive CHECK (revoked_at IS NULL OR NOT is_active);

COMMIT;
