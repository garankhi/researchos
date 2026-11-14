import { Suspense } from 'react';
import { Container } from '@chakra-ui/react';
import { LoadingSkeleton } from '@/components/ui/feedback';
import { ProfileShell } from '@/features/profiles';

type ProfilePageProps = {
  params: Promise<{
    locale: string;
    userId: string;
  }>;
};

async function ProfileContent({ params }: ProfilePageProps) {
  const { userId } = await params;
  return <ProfileShell userId={userId} isOwner={false} />;
}

export default function ProfilePage(props: ProfilePageProps) {
  return (
    <Suspense
      fallback={
        <Container maxW="6xl" py="6">
          <LoadingSkeleton variant="rectangular" height={160} />
        </Container>
      }
    >
      <ProfileContent {...props} />
    </Suspense>
  );
}
