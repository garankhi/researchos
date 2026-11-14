'use client';

import { useState } from 'react';
import { Button, Flex, Text } from '@chakra-ui/react';
import { Check, Link2, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  outputDownloadControllerDownloadFile,
  useFollowControllerCreate,
  useFollowControllerFindAll,
  useFollowControllerRemove,
} from '@/lib/api';
import { apiErrorCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import type { OutputDetail, OutputFile } from '../types';

const GROUP_ENTITY_TYPE = 'GROUP' as const;

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function OutputFiles({
  files,
  isLoading,
  isFailed,
  onRetry,
}: {
  files?: OutputFile[];
  isLoading: boolean;
  isFailed: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations('outputs');
  const tError = useTranslations('errors');
  const { showSnackbar } = useSnackbar();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Text textStyle="sm" color="fg.muted">
        {t('detail.filesLoading')}
      </Text>
    );
  }

  if (isFailed) {
    return (
      <Flex direction="column" gap="2">
        <Text textStyle="sm" color="fg.error">
          {t('detail.filesLoadError')}
        </Text>
        <Button variant="outline" size="sm" alignSelf="flex-start" onClick={onRetry}>
          {t('detail.retryAction')}
        </Button>
      </Flex>
    );
  }

  if (!files || files.length === 0) {
    return (
      <Text textStyle="sm" color="fg.muted">
        {t('detail.noFilesMessage')}
      </Text>
    );
  }

  async function handleDownload(file: OutputFile) {
    setDownloadingId(file.id);
    setDownloadError(null);
    try {
      const blob = await outputDownloadControllerDownloadFile(file.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.fileName || 'download';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showSnackbar({ severity: 'success', message: t('detail.downloadStarted') });
    } catch (error) {
      setDownloadError(
        resolveErrorCode(tError, apiErrorCode(error), t('detail.downloadError')),
      );
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <Flex direction="column" gap="2">
      {files.map((file) => (
        <Flex
          key={file.id}
          direction={{ base: 'column', sm: 'row' }}
          gap="2"
          align={{ base: 'flex-start', sm: 'center' }}
          justify="space-between"
          borderWidth="1px"
          borderRadius="md"
          p="3"
        >
          <Flex direction="column" gap="0.5" minW="0">
            <Text textStyle="sm" fontWeight="medium" truncate>
              {file.fileName}
            </Text>
            <Text textStyle="xs" color="fg.muted">
              {file.mimeType} • {fileSizeLabel(file.sizeBytes)}
            </Text>
          </Flex>
          <Button
            variant="outline"
            size="sm"
            loading={downloadingId === file.id}
            loadingText={t('detail.downloading')}
            onClick={() => void handleDownload(file)}
          >
            {t('detail.downloadFile')}
          </Button>
        </Flex>
      ))}
      {downloadError ? (
        <Text textStyle="sm" color="fg.error" role="alert">
          {downloadError}
        </Text>
      ) : null}
    </Flex>
  );
}

export function OutputActions({
  output,
  primaryFile,
}: {
  output: OutputDetail;
  primaryFile?: OutputFile;
}) {
  const t = useTranslations('outputs');
  const tError = useTranslations('errors');
  const { showSnackbar } = useSnackbar();
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const groupId = output.accessGroupId;

  const followsQuery = useFollowControllerFindAll(
    { limit: 100 },
    { query: { enabled: Boolean(groupId), staleTime: 60 * 1000 } },
  );
  const isFollowing = Boolean(
    groupId &&
      followsQuery.data?.items?.some(
        (item) =>
          item.entityType === GROUP_ENTITY_TYPE && item.entityId === groupId,
      ),
  );

  const createFollow = useFollowControllerCreate();
  const removeFollow = useFollowControllerRemove();

  async function handleDownloadPrimary() {
    if (!primaryFile) return;
    setDownloading(true);
    setActionError(null);
    try {
      const blob = await outputDownloadControllerDownloadFile(primaryFile.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = primaryFile.fileName || 'download';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showSnackbar({ severity: 'success', message: t('detail.downloadStarted') });
    } catch (error) {
      setActionError(
        resolveErrorCode(tError, apiErrorCode(error), t('detail.downloadError')),
      );
    } finally {
      setDownloading(false);
    }
  }

  async function handleShare() {
    setActionError(null);
    try {
      await navigator.clipboard.writeText(window.location.href);
      showSnackbar({ severity: 'success', message: t('detail.linkCopied') });
    } catch {
      setActionError(t('detail.shareError'));
    }
  }

  async function handleToggleFollow() {
    if (!groupId) return;
    setActionError(null);
    try {
      if (isFollowing) {
        await removeFollow.mutateAsync({
          entityType: GROUP_ENTITY_TYPE,
          entityId: groupId,
        });
        showSnackbar({ severity: 'success', message: t('detail.unfollowed') });
      } else {
        await createFollow.mutateAsync({
          data: { entityType: GROUP_ENTITY_TYPE, entityId: groupId },
        });
        showSnackbar({ severity: 'success', message: t('detail.followed') });
      }
      await followsQuery.refetch();
    } catch (error) {
      setActionError(
        resolveErrorCode(tError, apiErrorCode(error), t('detail.followError')),
      );
    }
  }

  const followPending = createFollow.isPending || removeFollow.isPending;

  return (
    <Flex direction="column" gap="2">
      <Flex gap="2" flexWrap="wrap">
        {primaryFile ? (
          <Button
            variant="solid"
            size="sm"
            loading={downloading}
            loadingText={t('detail.downloading')}
            onClick={() => void handleDownloadPrimary()}
          >
            {t('detail.downloadPrimary')}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => void handleShare()}>
          <Share2 />
          {t('detail.shareAction')}
        </Button>
        {groupId ? (
          <Button
            variant={isFollowing ? 'solid' : 'outline'}
            size="sm"
            loading={followPending}
            loadingText={t('detail.followLoading')}
            onClick={() => void handleToggleFollow()}
          >
            {isFollowing ? <Check /> : <Link2 />}
            {isFollowing ? t('detail.followingAction') : t('detail.followAction')}
          </Button>
        ) : null}
      </Flex>
      {actionError ? (
        <Text textStyle="sm" color="fg.error" role="alert">
          {actionError}
        </Text>
      ) : null}
    </Flex>
  );
}
