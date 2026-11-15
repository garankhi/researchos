'use client';

import { Box, VisuallyHidden } from '@chakra-ui/react';
import type { SkeletonResult } from 'boneyard-js';
import { Skeleton } from 'boneyard-js/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const SKELETON_DELAY_MS = 200;
const BONE_COLOR = 'var(--chakra-colors-bg-emphasized)';

/**
 * The layout of a route that is still resolving.
 *
 * It mirrors the shape of a page that has a heading, a paragraph and a
 * panel of content, so the space is already reserved when the route
 * arrives. It is the fallback for the app shell's `loading.tsx`, so it is
 * deliberately generic — a domain route uses its own layout.
 */
const routeLoading: SkeletonResult = {
  name: 'app-route-loading',
  viewportWidth: 768,
  width: 640,
  height: 280,
  bones: [
    [0, 0, 46, 24, 0],
    [0, 38, 72, 14, 0],
    [0, 72, 100, 200, 0],
  ],
};

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

/** The fallback shown while a route in the app shell is still resolving. */
export function RouteLoadingSkeleton() {
  return <DelayedSkeleton layout={routeLoading} />;
}
