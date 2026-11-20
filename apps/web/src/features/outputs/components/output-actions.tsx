'use client';

import { useState } from 'react';
import { Button, Flex, Text, type ButtonProps } from '@chakra-ui/react';
import { Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { outputDownloadControllerDownloadFile } from '@/lib/api';
import { apiErrorCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import type { OutputFile } from '../types';

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
  hasRestrictedPdf,
  isLoading,
  isFailed,
  onRetry,
}: {
  files?: OutputFile[];
  /**
   * The current release has a PDF the caller may not download. The
   * request-file action stays visible but disabled, so the reader knows
   * the file exists and that access has to be asked for.
   */
  hasRestrictedPdf?: boolean;
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
        <Button
          variant="outline"
          size="sm"
          alignSelf="flex-start"
          onClick={onRetry}
        >
          {t('detail.retryAction')}
        </Button>
      </Flex>
    );
  }

  if (!files?.length && !hasRestrictedPdf) {
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
      showSnackbar({
        severity: 'success',
        message: t('detail.downloadStarted'),
      });
    } catch (error) {
      setDownloadError(
        resolveErrorCode(
          tError,
          apiErrorCode(error),
          t('detail.downloadError'),
        ),
      );
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <Flex direction="column" gap="2">
      {files?.map((file) => (
        <Flex
          key={file.id}
          direction={{ base: 'column', sm: 'row' }}
          gap="2"
          align={{ base: 'flex-start', sm: 'center' }}
          justify="space-between"
          borderWidth="1px"
          borderColor="border"
          p="3.5"
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
      {hasRestrictedPdf ? (
        <Flex direction="column" gap="2" align="start">
          <Text textStyle="sm" color="fg.muted">
            {t('detail.requestFileUnavailable')}
          </Text>
          <Button
            size="xs"
            variant="outline"
            layerStyle="researchAccess"
            disabled
          >
            {t('detail.requestFile')}
          </Button>
        </Flex>
      ) : null}
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
  label,
  buttonProps,
}: {
  /**
   * The file to download. The download endpoint only needs the id and the
   * file name, so the home feed's `DownloadablePdfDto` and the detail
   * page's `OutputFile` both satisfy it.
   */
  file?: Pick<OutputFile, 'id' | 'fileName'>;
  label?: string;
  buttonProps?: Pick<ButtonProps, 'variant' | 'size' | 'layerStyle'>;
}) {
  const t = useTranslations('outputs');
  const tError = useTranslations('errors');
  const { showSnackbar } = useSnackbar();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (!file) return null;

  // Captured into a local so the narrowing survives into the closure
  // below: TypeScript does not keep a narrowing of a parameter across an
  // `async` function boundary.
  const target = file;

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await outputDownloadControllerDownloadFile(target.id);
      downloadBlob(blob, target.fileName);
      showSnackbar({
        severity: 'success',
        message: t('detail.downloadStarted'),
      });
    } catch (error) {
      setDownloadError(
        resolveErrorCode(
          tError,
          apiErrorCode(error),
          t('detail.downloadError'),
        ),
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
        {...buttonProps}
        loading={downloading}
        loadingText={t('detail.downloading')}
        onClick={() => void handleDownload()}
      >
        {label ?? t('detail.downloadPrimary')}
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
