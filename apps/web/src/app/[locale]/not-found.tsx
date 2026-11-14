import { AccessFeedback } from '@/components/ui/access-feedback';

// Rendered by Next.js when the segment calls notFound().
export default function NotFound() {
  return <AccessFeedback status={404} />;
}
