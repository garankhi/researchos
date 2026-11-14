'use client';

import { Box, Button, Container, Flex, Stack, Tabs, Text } from '@chakra-ui/react';
import { LockKeyhole, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import {
  ErrorState,
  LoadingSkeleton,
  RouteFeedback,
} from '@/components/ui/feedback';
import { useOutput } from '../hooks/use-output';
import { useOutputFiles } from '../hooks/use-output-files';
import { useOutputGroup } from '../hooks/use-output-group';
import { useOutputOwner } from '../hooks/use-output-owner';
import { OutputAbstract } from './output-abstract';
import {
  OutputDownloadPrimaryButton,
  OutputFiles,
  OutputFollowButton,
  OutputShareButton,
} from './output-actions';
import { OutputDetailActionsMenu } from './output-detail-actions-menu';
import { OutputHeader } from './output-header';
import { OutputReferences } from './output-references';

export function OutputDetailShell({ outputId }: { outputId?: string }) {
  const t = useTranslations('outputs');
  const common = useTranslations('common');
  const {
    output,
    isLoading,
    isFailed,
    isForbidden,
    isNotFound,
    isEmpty,
    refetch,
  } = useOutput({ outputId });
  const filesQuery = useOutputFiles({ outputId });
  const groupQuery = useOutputGroup({ groupId: output?.accessGroupId });
  const { isOwner } = useOutputOwner({ ownerId: output?.ownerId });

  if (isLoading) {
    return (
      <Container maxW="6xl" py={{ base: '4', md: '8' }}>
        <Stack gap="4">
          <LoadingSkeleton variant="rectangular" height={180} />
          <LoadingSkeleton variant="rectangular" height={120} count={2} />
        </Stack>
      </Container>
    );
  }

  if (isFailed) {
    return (
      <Container maxW="6xl" py={{ base: '4', md: '8' }}>
        <ErrorState title={t('detail.loadError')} onRetry={() => void refetch()} />
      </Container>
    );
  }

  if (isForbidden) {
    return (
      <RouteFeedback
        icon={<LockKeyhole aria-hidden />}
        title={t('detail.accessDeniedTitle')}
        description={t('detail.accessDeniedMessage')}
        action={
          <Button asChild>
            <NextLink href="/">{common('backToHome')}</NextLink>
          </Button>
        }
      />
    );
  }

  if (isEmpty || isNotFound || !output) {
    return (
      <RouteFeedback
        icon={<SearchX aria-hidden />}
        title={t('detail.notFoundTitle')}
        description={t('detail.notFoundMessage')}
        action={
          <Button asChild>
            <NextLink href="/">{common('backToHome')}</NextLink>
          </Button>
        }
      />
    );
  }

  const files = filesQuery.files;
  const primaryFile = files?.[0];

  return (
    <Tabs.Root defaultValue="overview" variant="line">
      <Stack gap="0">
        <Box w="full" bg="bg">
          <Container maxW="6xl" pt={{ base: '4', md: '8' }} pb="4">
            <Stack gap="4" minW="0">
              <OutputHeader
                output={output}
                groupName={groupQuery.groupName}
                groupLoading={groupQuery.isLoading}
                hasFullText={Boolean(files && files.length > 0)}
                followSlot={<OutputFollowButton output={output} />}
              />

              <Flex
                direction={{ base: 'column', sm: 'row' }}
                gap="3"
                align={{ base: 'stretch', sm: 'center' }}
                justify="space-between"
              >
                <Tabs.List flex="1" overflowX="auto">
                  <Tabs.Trigger value="overview">
                    {t('detail.tabsOverview')}
                  </Tabs.Trigger>
                  <Tabs.Trigger value="references">
                    {t('detail.tabsReferences')}
                  </Tabs.Trigger>
                </Tabs.List>
                <Flex gap="2" flexShrink={0} alignItems="center">
                  <OutputDownloadPrimaryButton file={primaryFile} />
                  <OutputShareButton />
                  {isOwner ? <OutputDetailActionsMenu output={output} /> : null}
                </Flex>
              </Flex>
            </Stack>
          </Container>
        </Box>

        <Box w="full" bg="bg.subtle">
          <Container maxW="6xl" py={{ base: '4', md: '6' }}>
            <Tabs.Content value="overview">
              <Stack gap="4">
                <Box
                  bg="bg.panel"
                  borderWidth="1px"
                  borderRadius="md"
                  p={{ base: '4', md: '5' }}
                >
                  <OutputAbstract abstract={output.revision?.abstract ?? null} />
                </Box>
                <Box
                  bg="bg.panel"
                  borderWidth="1px"
                  borderRadius="md"
                  p={{ base: '4', md: '5' }}
                >
                  <Stack gap="2">
                    <Text fontWeight="semibold">{t('detail.filesTitle')}</Text>
                    <OutputFiles
                      files={files}
                      isLoading={filesQuery.isLoading}
                      isFailed={filesQuery.isFailed}
                      onRetry={() => void filesQuery.refetch()}
                    />
                  </Stack>
                </Box>
              </Stack>
            </Tabs.Content>

            <Tabs.Content value="references">
              <Box
                bg="bg.panel"
                borderWidth="1px"
                borderRadius="md"
                p={{ base: '4', md: '5' }}
              >
                <OutputReferences />
              </Box>
            </Tabs.Content>
          </Container>
        </Box>
      </Stack>
    </Tabs.Root>
  );
}
