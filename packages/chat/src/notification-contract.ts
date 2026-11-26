export const NOTIFICATION_NAMESPACE = "/notifications";

export const NotificationSocketEvent = {
  READY: "notification:ready",
  CREATED: "notification:created",
  ERROR: "notification:error",
} as const;

export interface NotificationCreatedHint {
  id: string;
}
