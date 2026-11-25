import { notificationDevicesControllerRegister } from '@/lib/api';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FCM_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FCM_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FCM_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FCM_APP_ID,
};
const vapidKey = process.env.NEXT_PUBLIC_FCM_VAPID_KEY;
export const browserPushConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId &&
  vapidKey,
);

export async function registerBrowserPush(locale: string): Promise<void> {
  if (
    !browserPushConfigured ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator)
  ) {
    throw new Error('Push is unavailable');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Push permission declined');
  const [{ getApps, initializeApp }, { getMessaging, getToken, isSupported }] =
    await Promise.all([import('firebase/app'), import('firebase/messaging')]);
  if (!(await isSupported())) throw new Error('Push is unavailable');
  const name = 'researchos-notifications';
  const app =
    getApps().find((candidate) => candidate.name === name) ??
    initializeApp(firebaseConfig, name);
  const serviceWorkerRegistration = await navigator.serviceWorker.register(
    '/notification-sw.js',
    { scope: '/notification-push/' },
  );
  const token = await getToken(getMessaging(app), {
    vapidKey,
    serviceWorkerRegistration,
  });
  await notificationDevicesControllerRegister({
    token,
    locale,
    platform: 'WEB',
  });
}
