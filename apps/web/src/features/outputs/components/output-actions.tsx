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

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'download';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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
      downloadBlob(blob, file.fileName);
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
          borderColor="border"
          borderRadius="md"
          p="3"
          bg="bg.subtle"
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

export function OutputDownloadPrimaryButton({
  file,
}: {
  file?: OutputFile;
}) {
  const t = useTranslations('outputs');
  const tError = useTranslations('errors');
  const { showSnackbar } = useSnackbar();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (!file) return null;

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await outputDownloadControllerDownloadFile(file.id);
      downloadBlob(blob, file.fileName);
      showSnackbar({ severity: 'success', message: t('detail.downloadStarted') });
    } catch (error) {
      setDownloadError(
        resolveErrorCode(tError, apiErrorCode(error), t('detail.downloadError')),
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Flex direction="column" gap="1" align="flex-end">
      <Button
        variant="solid"
        size="sm"
        loading={downloading}
        loadingText={t('detail.downloading')}
        onClick={() => void handleDownload()}
      >
        {t('detail.downloadPrimary')}
      </Button>
      {downloadError ? (
        <Text textStyle="xs" color="fg.error" role="alert">
          {downloadError}
        </Text>
      ) : null}
    </Flex>
  );
}

export function OutputShareButton() {
  const t = useTranslations('outputs');
  const { showSnackbar } = useSnackbar();
  const [shareError, setShareError] = useState<string | null>(null);

  async function handleShare() {
    setShareError(null);
    try {
      await navigator.clipboard.writeText(window.location.href);
      showSnackbar({ severity: 'success', message: t('detail.linkCopied') });
    } catch {
      setShareError(t('detail.shareError'));
    }
  }

  return (
    <Flex direction="column" gap="1" align="flex-end">
      <Button variant="outline" size="sm" onClick={() => void handleShare()}>
        <Share2 />
        {t('detail.shareAction')}
      </Button>
      {shareError ? (
        <Text textStyle="xs" color="fg.error" role="alert">
          {shareError}
        </Text>
      ) : null}
    </Flex>
  );
}

export function OutputFollowButton({ output }: { output: OutputDetail }) {
  const t = useTranslations('outputs');
  const tError = useTranslations('errors');
  const { showSnackbar } = useSnackbar();
  const [actionError, setActionError] = useState<string | null>(null);

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

  if (!groupId) return null;

  async function handleToggleFollow() {
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
    <Flex direction="column" gap="1" align="flex-end" flexShrink={0}>
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
      {actionError ? (
        <Text textStyle="xs" color="fg.error" role="alert">
          {actionError}
        </Text>
      ) : null}
    </Flex>
  );
}
