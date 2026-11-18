import { Suspense } from 'react';
import { ChatShell, ChatWorkspaceSkeleton } from '@/features/chat';
import { RequireAuth } from '@/features/identity';

type ChatConversationPageProps = {
  params: Promise<{
    locale: string;
    conversationId: string;
  }>;
};

async function ChatConversationContent({ params }: ChatConversationPageProps) {
  const { conversationId } = await params;
  return (
    <RequireAuth returnTo={`/chat/${conversationId}`}>
      <ChatShell initialConversationId={conversationId} />
    </RequireAuth>
  );
}

export default function ChatConversationPage(props: ChatConversationPageProps) {
  return (
    <Suspense fallback={<ChatWorkspaceSkeleton />}>
      <ChatConversationContent {...props} />
    </Suspense>
  );
}
