'use client';

import {
  Box,
  Button,
  Container,
  Flex,
  Grid,
  Heading,
  Stack,
  Tabs,
} from '@chakra-ui/react';
import { LockKeyhole, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import { ErrorState, RouteFeedback } from '@/components/ui/feedback';
import { FollowButton } from '@/features/follow';
import { useOutput } from '../hooks/use-output';
import { useOutputCapability } from '../hooks/use-output-capability';
import { useOutputFiles } from '../hooks/use-output-files';
import { useOutputGroup } from '../hooks/use-output-group';
import { useUpdateArticleAbstract } from '../hooks/use-update-article-abstract';
import { OutputAbstract } from './output-abstract';
import { ArticlePdfSection } from './article-pdf-section';
import {
  OutputDownloadPrimaryButton,
  OutputFiles,
  OutputShareButton,
} from './output-actions';
import { OutputDetailActionsMenu } from './output-detail-actions-menu';
import { OutputHeader } from './output-header';
import { OutputReferences } from './output-references';
import { OutputSidebar } from './output-sidebar';
import { OutputDetailSkeleton } from './output-skeletons';

const sourceButtonProps = {
  variant: 'outline',
  size: 'xs',
  layerStyle: 'researchAccess',
} as const;

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
  const updateAbstract = useUpdateArticleAbstract();
  const groupQuery = useOutputGroup({ groupId: output?.accessGroupId });
  const capability = useOutputCapability({
    ownerId: output?.ownerId,
    authorUserIds: output?.authors
      .map((author) => author.userId)
      .filter((id): id is string => Boolean(id)),
    groupLeadId: groupQuery.groupLeadId,
  });

  if (isLoading) {
    return <OutputDetailSkeleton />;
  }

  if (isFailed) {
    return (
      <Box flex="1" bg="home.background">
        <Container
          maxW="64rem"
          px={{ base: '4', md: '6' }}
          py={{ base: '4', md: '8' }}
        >
          <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
            <ErrorState
              title={t('detail.loadError')}
              onRetry={() => void refetch()}
            />
          </Box>
        </Container>
      </Box>
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

  const revision = output.revision;
  const canManageArticle =
    capability.isOwner &&
    output.sharingStatus === 'SHARED' &&
    revision?.outputType === 'ARTICLE' &&
    Boolean(revision.releasedAt);
  const files = filesQuery.files;
  const primaryFile =
    revision?.outputType === 'ARTICLE'
      ? (files?.find(
          (file) =>
            file.isCurrentReleaseAttachment &&
            file.mimeType.toLowerCase() === 'application/pdf',
        ) ?? files?.[0])
      : files?.[0];
  const sourceUrl = output.doi
    ? `https://doi.org/${output.doi}`
    : (output.revision?.externalUrl ?? null);

  return (
    <Tabs.Root
      as="main"
      flex="1"
      bg="home.background"
      defaultValue="overview"
      variant="line"
      colorPalette="blue"
    >
      {/* Full-bleed white ResearchGate-style publication hero banner */}
      <Box bg="bg.panel" borderBottomWidth="1px" borderColor="border">
        <Container
          maxW="64rem"
          px={{ base: '4', md: '6' }}
          pt={{ base: '5', md: '8' }}
        >
          <Stack gap="5" minW="0">
            <OutputHeader
              output={output}
              groupName={groupQuery.groupName}
              groupLoading={groupQuery.isLoading}
              hasFullText={Boolean(files && files.length > 0)}
              followSlot={
                output.accessGroupId ? (
                  <FollowButton
                    entityType="GROUP"
                    entityId={output.accessGroupId}
                  />
                ) : null
              }
            />

            <Flex
              direction={{ base: 'column', sm: 'row' }}
              gap="3"
              align={{ base: 'stretch', sm: 'center' }}
              justify="space-between"
            >
              <Tabs.List
                gap={{ base: '5', md: '7' }}
                borderBottomWidth="0"
                flexWrap="wrap"
              >
                <Tabs.Trigger value="overview" height="12" px="0">
                  {t('detail.tabsOverview')}
                </Tabs.Trigger>
                <Tabs.Trigger value="references" height="12" px="0">
                  {t('detail.tabsReferences')}
                </Tabs.Trigger>
              </Tabs.List>

              <Flex
                gap="2"
                flexShrink={0}
                align="center"
                wrap="wrap"
                pb={{ base: '3', sm: '0' }}
              >
                {primaryFile ? (
                  <OutputDownloadPrimaryButton file={primaryFile} />
                ) : sourceUrl ? (
                  <Button asChild {...sourceButtonProps}>
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('detail.viewSource')}
                    </a>
                  </Button>
                ) : null}
                <OutputShareButton />
                {capability.role !== 'reader' ? (
                  <OutputDetailActionsMenu
                    output={output}
                    capability={capability}
                  />
                ) : null}
              </Flex>
            </Flex>
          </Stack>
        </Container>
      </Box>

      {/* Two-column ResearchGate academic content area on #f6f6f6 canvas */}
      <Container
        maxW="64rem"
        px={{ base: '4', md: '6' }}
        py={{ base: '4', lg: '6' }}
      >
        <Grid
          templateColumns={{
            base: 'minmax(0, 1fr)',
            lg: 'minmax(0, 1.95fr) minmax(0, 1fr)',
          }}
          alignItems="start"
          gap="4"
        >
          <Box minW="0">
            <Tabs.Content value="overview" pt="0">
              <Stack gap="4">
                <Box bg="bg.panel" boxShadow="xs">
                  <OutputAbstract
                    abstract={revision?.abstract ?? null}
                    onSaveAbstract={
                      canManageArticle && revision
                        ? async (abstract) => {
                            await updateAbstract(
                              output.id,
                              revision.id,
                              abstract,
                            );
                          }
                        : undefined
                    }
                  />
                </Box>

                {canManageArticle &&
                revision &&
                files &&
                !filesQuery.isFailed ? (
                  <ArticlePdfSection
                    key={output.id}
                    outputId={output.id}
                    revisionId={revision.id}
                    files={files}
                  />
                ) : (
                  <Box bg="bg.panel" boxShadow="xs">
                    <Box
                      px={{ base: '4', md: '6' }}
                      py="4"
                      borderBottomWidth="1px"
                      borderColor="border"
                    >
                      <Heading as="h2" size="md" fontWeight="bold">
                        {t('detail.filesTitle')}
                      </Heading>
                    </Box>
                    <Box p={{ base: '4', md: '6' }}>
                      <OutputFiles
                        files={files}
                        hasRestrictedPdf={output.hasRestrictedPdf}
                        isLoading={filesQuery.isLoading}
                        isFailed={filesQuery.isFailed}
                        onRetry={() => void filesQuery.refetch()}
                      />
                    </Box>
                  </Box>
                )}
              </Stack>
            </Tabs.Content>

            <Tabs.Content value="references" pt="0">
              <Box bg="bg.panel" boxShadow="xs">
                <OutputReferences />
              </Box>
            </Tabs.Content>
          </Box>

          <OutputSidebar
            output={output}
            groupName={groupQuery.groupName}
            groupLoading={groupQuery.isLoading}
          />
        </Grid>
      </Container>
    </Tabs.Root>
  );
}
