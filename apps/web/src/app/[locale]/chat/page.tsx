import { Suspense } from 'react';
import { ChatShell, ChatWorkspaceSkeleton } from '@/features/chat';
import { RequireAuth } from '@/features/identity';

export default function ChatPage() {
  return (
    <Suspense fallback={<ChatWorkspaceSkeleton />}>
      <RequireAuth returnTo="/chat">
        <ChatShell />
      </RequireAuth>
    </Suspense>
  );
}
