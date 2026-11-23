import { RequireAuth } from '@/features/identity';
import { NotificationInbox } from '@/features/notifications';

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationInbox />
    </RequireAuth>
  );
}
