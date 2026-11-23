import { Suspense } from 'react';
import { Container } from '@chakra-ui/react';
import {
  OpportunityDetailShell,
  OpportunityDetailSkeleton,
} from '@/features/opportunities';

type OpportunityPageProps = {
  params: Promise<{
    locale: string;
    opportunityId: string;
  }>;
};

async function OpportunityContent({ params }: OpportunityPageProps) {
  const { opportunityId } = await params;
  return <OpportunityDetailShell opportunityId={opportunityId} />;
}

export default function OpportunityPage(props: OpportunityPageProps) {
  return (
    <Suspense
      fallback={
        <Container maxW="6xl" py={{ base: '4', md: '8' }}>
          <OpportunityDetailSkeleton />
        </Container>
      }
    >
      <OpportunityContent {...props} />
    </Suspense>
  );
}
