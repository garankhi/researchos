import { RequireAuth, RequireOnboarding } from '@/features/identity';
import { NotificationInbox } from '@/features/notifications';

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <RequireOnboarding>
        <NotificationInbox />
      </RequireOnboarding>
    </RequireAuth>
  );
}
