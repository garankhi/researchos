import { Suspense } from 'react';
import { ProfilePageSkeleton, ProfileShell } from '@/features/profiles';

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
    <Suspense fallback={<ProfilePageSkeleton />}>
      <ProfileContent {...props} />
    </Suspense>
  );
}
