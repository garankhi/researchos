-- RES-176: notification types for Private-file access requests.
-- Kept apart from the table migration so each migration is all-or-nothing.
-- The values are not used in this transaction.
BEGIN;
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'FILE_ACCESS_REQUESTED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'FILE_ACCESS_APPROVED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'FILE_ACCESS_DECLINED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'FILE_ACCESS_REVOKED';
COMMIT;
