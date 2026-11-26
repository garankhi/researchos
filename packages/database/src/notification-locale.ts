/**
 * The locales the notification copy is written in.
 *
 * The API validates the stored locale against this set, and the worker
 * resolves a recipient's locale to one of them before rendering a
 * notification. A regional tag such as `en-GB` resolves to `en`.
 */
export const NotificationLocale = {
  EN: 'en',
  VI: 'vi',
} as const;

export type NotificationLocale =
  (typeof NotificationLocale)[keyof typeof NotificationLocale];

/**
 * Normalizes a locale tag to one of the two copy variants.
 *
 * A regional tag such as `en-GB` resolves to English, and anything the copy
 * does not exist for resolves to Vietnamese.
 */
export function normalizeNotificationLocale(
  value: string | null | undefined,
): NotificationLocale {
  return value?.trim().toLowerCase().startsWith('en')
    ? NotificationLocale.EN
    : NotificationLocale.VI;
}
