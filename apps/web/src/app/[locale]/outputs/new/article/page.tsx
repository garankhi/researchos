'use client';

import { AccessFeedback } from '@/components/ui/access-feedback';
import {
  RequireAuth,
  RequireOnboarding,
  useCurrentUser,
} from '@/features/identity';
import { ArticleCreationFlow } from '@/features/outputs';

export default function NewArticlePage() {
  const user = useCurrentUser();
  return (
    <RequireAuth returnTo="/outputs/new/article">
      <RequireOnboarding>
        {user?.roles.includes('RESEARCHER') ? (
          <ArticleCreationFlow key={user.id} userId={user.id} />
        ) : (
          <AccessFeedback status={403} />
        )}
      </RequireOnboarding>
    </RequireAuth>
  );
}
