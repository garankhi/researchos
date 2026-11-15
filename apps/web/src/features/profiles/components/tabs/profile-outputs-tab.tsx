'use client';

import {
  Badge,
  Box,
  Flex,
  Heading,
  HStack,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import { FileText, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { useProfileOutputs } from '../../hooks/use-profile-outputs';
import { useProfileOutputCapability } from '../../hooks/use-profile-output-capability';
import { ProfileOutputActionsMenu } from '../profile-output-actions-menu';
import { ProfileOutputsSkeleton } from '../profile-skeletons';
import type { OutputResponseDto } from '../../types';

/**
 * One work on the profile page.
 *
 * The card is its own component so the capability hook can run per work:
 * a hook cannot be called inside the list's `.map`, and the capability
 * differs from card to card — the viewer may own one work and merely be a
 * co-author on the next.
 */
function ProfileOutputCard({ output }: { output: OutputResponseDto }) {
  const t = useTranslations('profile');
  const capability = useProfileOutputCapability({ output });

  const rev = output.currentRevision;
  const title = rev?.title || `Output #${output.id.slice(0, 8)}`;
  const authorsList = output.authors
    ?.sort((a, b) => a.authorOrder - b.authorOrder)
    .map((a) => a.authorNameString)
    .join(', ');
  const venueStr = typeof rev?.venue === 'string' ? rev.venue : null;
  const doiStr = typeof output.doi === 'string' ? output.doi : null;
  const yearStr =
    typeof rev?.publicationYear === 'number' ||
    typeof rev?.publicationYear === 'string'
      ? String(rev.publicationYear)
      : null;

  /*
   * The menu is for the people connected to the work. A visitor reading
   * someone else's profile has no operation to perform, so they get no
   * menu at all — not a menu with everything greyed out. A co-author does
   * get one: they are part of the work even though the visibility entry
   * inside it is locked for them.
   */
  const showMenu = capability.role !== 'reader';

  return (
    <Box bg="bg.panel" borderWidth="1px" borderRadius="lg" p="5">
      <Stack gap="3">
        <Flex
          direction={{ base: 'column', sm: 'row' }}
          gap="2"
          justify="space-between"
          align="flex-start"
        >
          <Box flex="1" minW="0">
            <Heading as="h3" size="sm" fontWeight="semibold" lineHeight="1.4">
              <Link asChild color="fg">
                <NextLink href={`/outputs/${output.id}`}>{title}</NextLink>
              </Link>
            </Heading>

            {authorsList ? (
              <Text textStyle="sm" color="fg.muted" mt="1">
                {authorsList}
              </Text>
            ) : null}
          </Box>

          {output.visibility ? (
            <HStack gap="1" flexShrink={0} align="center">
              <Badge variant="outline" colorPalette="gray">
                {output.visibility === 'FPTU_COMMUNITY'
                  ? t('outputsTab.visibilityPublic')
                  : output.visibility === 'RESEARCH_GROUP'
                    ? t('outputsTab.visibilityGroupOnly')
                    : output.visibility}
              </Badge>
              {showMenu ? (
                <ProfileOutputActionsMenu
                  output={output}
                  capability={capability}
                />
              ) : null}
            </HStack>
          ) : showMenu ? (
            <ProfileOutputActionsMenu output={output} capability={capability} />
          ) : null}
        </Flex>

        <Flex gap="3" align="center" flexWrap="wrap">
          {venueStr ? (
            <Text textStyle="sm" color="fg.muted" fontStyle="italic">
              {venueStr}
            </Text>
          ) : null}

          {yearStr ? (
            <Text textStyle="sm" color="fg.muted">
              ({yearStr})
            </Text>
          ) : null}

          {doiStr ? (
            <Link
              href={`https://doi.org/${doiStr}`}
              target="_blank"
              rel="noopener noreferrer"
              display="inline-flex"
              alignItems="center"
              gap="1"
              textStyle="xs"
            >
              <FileText />
              {`DOI: ${doiStr}`}
              <ExternalLink />
            </Link>
          ) : null}
        </Flex>

        {output.topics && output.topics.length > 0 ? (
          <Flex gap="2" flexWrap="wrap">
            {output.topics.map((topic) => (
              <Badge key={topic.topicId} variant="outline" colorPalette="gray">
                {topic.topicName}
              </Badge>
            ))}
          </Flex>
        ) : null}
      </Stack>
    </Box>
  );
}

export function ProfileOutputsTab({ userId }: { userId?: string }) {
  const t = useTranslations('profile');
  const { allOutputs, isLoading, isFailed, refetch } = useProfileOutputs({
    userId,
  });

  if (isLoading) {
    return <ProfileOutputsSkeleton />;
  }

  if (isFailed) {
    return <ErrorState title={t('loadError')} onRetry={refetch} />;
  }

  if (allOutputs.length === 0) {
    return (
      <EmptyState
        title={t('outputsTab.emptyTitle')}
        message={t('outputsTab.emptyMessage')}
      />
    );
  }

  return (
    <Stack gap="4" py="1">
      {allOutputs.map((output: OutputResponseDto) => (
        <ProfileOutputCard key={output.id} output={output} />
      ))}
    </Stack>
  );
}
