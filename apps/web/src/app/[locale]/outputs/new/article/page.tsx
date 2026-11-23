'use client';

import { AccessFeedback } from '@/components/ui/access-feedback';
import { RequireAuth, useCurrentUser } from '@/features/identity';
import { ArticleCreationFlow } from '@/features/outputs';

export default function NewArticlePage() {
  const user = useCurrentUser();
  return (
    <RequireAuth returnTo="/outputs/new/article">
      {user?.roles.includes('RESEARCHER') ? (
        <ArticleCreationFlow key={user.id} userId={user.id} />
      ) : (
        <AccessFeedback status={403} />
      )}
    </RequireAuth>
  );
}
