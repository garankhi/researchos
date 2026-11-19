import { Suspense } from 'react';
import { Container } from '@chakra-ui/react';
import { GroupHub, GroupHubSkeleton } from '@/features/groups';

async function GroupContent({
  params,
}: {
  params: Promise<{ locale: string; groupId: string }>;
}) {
  const { groupId } = await params;
  return <GroupHub groupId={groupId} />;
}

export default function GroupPage(props: {
  params: Promise<{ locale: string; groupId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <Container
          maxW="64rem"
          px={{ base: '4', md: '6' }}
          py={{ base: '4', md: '8' }}
        >
          <GroupHubSkeleton />
        </Container>
      }
    >
      <GroupContent {...props} />
    </Suspense>
  );
}
