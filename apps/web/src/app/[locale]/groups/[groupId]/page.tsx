import { Suspense } from 'react';
import { Container } from '@chakra-ui/react';
import { LoadingSkeleton } from '@/components/ui/feedback';
import { GroupHub } from '@/features/groups';

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
        <Container maxW="6xl" py="8">
          <LoadingSkeleton variant="rectangular" height={180} count={3} />
        </Container>
      }
    >
      <GroupContent {...props} />
    </Suspense>
  );
}
