import { Suspense } from 'react';
import { Container } from '@mui/material';
import { LoadingSkeleton } from '@/components/ui/feedback';
import { ProfileShell } from '@/features/profiles';

export default function MyProfilePage() {
  return (
    <Suspense
      fallback={
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <LoadingSkeleton variant="rectangular" height={160} />
        </Container>
      }
    >
      <ProfileShell isOwner={true} />
    </Suspense>
  );
}
