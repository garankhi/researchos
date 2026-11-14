import { Suspense } from 'react';
import { Container } from '@chakra-ui/react';
import { LoadingSkeleton } from '@/components/ui/feedback';
import { OutputDetailShell } from '@/features/outputs';

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
        <Container maxW="6xl" py="6">
          <LoadingSkeleton variant="rectangular" height={160} />
        </Container>
      }
    >
      <OutputContent {...props} />
    </Suspense>
  );
}
