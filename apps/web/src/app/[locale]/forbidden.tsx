import { AccessFeedback } from '@/components/ui/access-feedback';

// Rendered by Next.js when a protected route calls forbidden().
export default function Forbidden() {
  return <AccessFeedback status={403} />;
}
