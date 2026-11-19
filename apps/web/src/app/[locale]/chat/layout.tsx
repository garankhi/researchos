import { Suspense, type ReactNode } from 'react';
import { ChatShell, ChatWorkspaceSkeleton } from '@/features/chat';
import { RequireAuth } from '@/features/identity';

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ChatWorkspaceSkeleton />}>
      <RequireAuth>
        <ChatShell />
        {children}
      </RequireAuth>
    </Suspense>
  );
}
