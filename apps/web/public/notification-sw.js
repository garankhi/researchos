self.addEventListener('push', (event) => {
  const payload = event.data?.json();
  if (!payload?.notification?.title) return;
  const { title, body } = payload.notification;
  const { id, link } = payload.data ?? {};
  event.waitUntil(self.registration.showNotification(title, {
    body, tag: id, data: { link },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link;
  const safeLink = typeof link === 'string' && link.startsWith('/') &&
    !link.startsWith('//') && !link.includes('\\') ? link : '/notifications';
  event.waitUntil(self.clients.openWindow(safeLink));
});
