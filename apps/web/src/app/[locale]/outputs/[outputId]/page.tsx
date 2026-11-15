import { Suspense } from 'react';
import { Container } from '@chakra-ui/react';
import { OutputDetailShell, OutputDetailSkeleton } from '@/features/outputs';

type OutputPageProps = {
  params: Promise<{
    locale: string;
    outputId: string;
  }>;
};

async function OutputContent({ params }: OutputPageProps) {
  const { outputId } = await params;
  return <OutputDetailShell outputId={outputId} />;
}

export default function OutputPage(props: OutputPageProps) {
  return (
    <Suspense
      fallback={
        <Container maxW="6xl" py={{ base: '4', md: '8' }}>
          <OutputDetailSkeleton />
        </Container>
      }
    >
      <OutputContent {...props} />
    </Suspense>
  );
}
