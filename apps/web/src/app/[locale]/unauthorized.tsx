import { AccessFeedback } from '@/components/ui/access-feedback';

// Rendered by Next.js when a protected route calls unauthorized().
export default function Unauthorized() {
  return <AccessFeedback status={401} />;
}
