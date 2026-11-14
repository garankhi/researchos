'use client';

import { Box, Container, Heading, Icon, Stack, Text } from '@chakra-ui/react';
import { LockKeyhole, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from '@/components/ui/feedback';
import { useOutput } from '../hooks/use-output';
import { useOutputFiles } from '../hooks/use-output-files';
import { OutputAbstract } from './output-abstract';
import { OutputActions, OutputFiles } from './output-actions';
import { OutputHeader } from './output-header';
import { OutputReferences } from './output-references';

export function OutputDetailShell({ outputId }: { outputId?: string }) {
  const t = useTranslations('outputs');
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
      <Container maxW="6xl" py={{ base: '4', md: '8' }}>
        <Stack gap="3" align="center" textAlign="center" py="6">
          <Icon size="2xl" color="fg.muted">
            <LockKeyhole />
          </Icon>
          <Heading as="h2" size="md">
            {t('detail.accessDeniedTitle')}
          </Heading>
          <Text textStyle="sm" color="fg.muted">
            {t('detail.accessDeniedMessage')}
          </Text>
        </Stack>
      </Container>
    );
  }

  if (isEmpty || isNotFound || !output) {
    return (
      <Container maxW="6xl" py={{ base: '4', md: '8' }}>
        <Stack gap="3" align="center" textAlign="center" py="6">
          <Icon size="2xl" color="fg.muted">
            <SearchX />
          </Icon>
          <Heading as="h2" size="md">
            {t('detail.notFoundTitle')}
          </Heading>
          <Text textStyle="sm" color="fg.muted">
            {t('detail.notFoundMessage')}
          </Text>
        </Stack>
      </Container>
    );
  }

  const primaryFile = filesQuery.files?.[0];

  return (
    <Container maxW="6xl" py={{ base: '4', md: '8' }}>
      <Stack gap="4">
        <OutputHeader output={output} />
        <OutputActions output={output} primaryFile={primaryFile} />
        <OutputAbstract abstract={output.revision?.abstract ?? null} />
        <Box bg="bg.panel" borderWidth="1px" borderRadius="lg" p={{ base: '4', md: '6' }}>
          <Text fontWeight="semibold" mb="2">
            {t('detail.filesTitle')}
          </Text>
          <OutputFiles
            files={filesQuery.files}
            isLoading={filesQuery.isLoading}
            isFailed={filesQuery.isFailed}
            onRetry={() => void filesQuery.refetch()}
          />
        </Box>
        <OutputReferences />
      </Stack>
      {output.revision ? null : (
        <EmptyState
          title={t('detail.noRevisionTitle')}
          message={t('detail.noRevisionMessage')}
        />
      )}
    </Container>
  );
}
