'use client';

import { Box, VisuallyHidden } from '@chakra-ui/react';
import type { SkeletonResult } from 'boneyard-js';
import { Skeleton } from 'boneyard-js/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const SKELETON_DELAY_MS = 200;
const BONE_COLOR = 'var(--chakra-colors-bg-emphasized)';

/** Mount only while waiting for initial content or as a Suspense fallback. */
export function DelayedSkeleton({
  layout,
  announce = true,
}: {
  layout: SkeletonResult;
  announce?: boolean;
}) {
  const t = useTranslations('common');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Box minH={`${layout.height}px`} maxW={`${layout.width}px`}>
      {visible && (
        <>
          {announce && (
            <VisuallyHidden role="status">{t('loading')}</VisuallyHidden>
          )}
          <div aria-hidden="true">
            <Skeleton
              name={layout.name}
              initialBones={layout}
              color={BONE_COLOR}
              darkColor={BONE_COLOR}
              animate="solid"
              loading
            >
              {null}
            </Skeleton>
          </div>
        </>
      )}
    </Box>
  );
}
