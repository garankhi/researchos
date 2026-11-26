import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Checkbox,
  Heading,
  Input,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { apiErrorCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
import type { AttachArticlePdfDto } from '@/lib/api/models/attachArticlePdfDto';
import {
  articlePdfReader,
  isValidArticlePdf,
} from '../hooks/article-pdf-reader';
import { useManageArticlePdf } from '../hooks/use-manage-article-pdf';
import type { OutputFile } from '../types';
import { ArticlePdfFileCard } from './article-pdf-file-card';
import { ArticlePdfManagement } from './article-pdf-management';
import { OutputDownloadPrimaryButton, OutputFiles } from './output-actions';

type PdfDestination = Omit<AttachArticlePdfDto, 'uploadId'>;

function currentArticlePdf(files: OutputFile[]) {
  return files.find(
    (file) =>
      file.isCurrentReleaseAttachment &&
      file.mimeType.toLowerCase() === 'application/pdf' &&
      file.visibility,
  );
}

export function ArticlePdfSection({
  outputId,
  revisionId,
  files,
}: {
  outputId: string;
  revisionId: string;
  files: OutputFile[];
}) {
  const edit = useTranslations('articleEdit');
  const basics = useTranslations('articleBasics');
  const detail = useTranslations('outputs');
  const errors = useTranslations('errors');
  const { showSnackbar } = useSnackbar();
  const input = useRef<HTMLInputElement>(null);
  const destination = useRef<PdfDestination | null>(null);
  const request = useRef<AbortController | null>(null);
  const verifiedId = useRef<string | undefined>(undefined);
  const [pending, setPending] = useState<{
    file: File;
    destination: PdfDestination;
  }>();
  const [rights, setRights] = useState(false);
  const [progress, setProgress] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [replacementNotice, setReplacementNotice] = useState<{
    fileName?: string;
  }>();
  const api = useManageArticlePdf(outputId);
  const current = currentArticlePdf(files);
  const otherFiles = files.filter((file) => file.id !== current?.id);

  useEffect(() => () => request.current?.abort(), []);

  async function savePdf() {
    if (!pending || !rights || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    setBusy(true);
    setFailure(undefined);
    try {
      let target = pending.destination;
      if (needsRefresh) {
        const latest = await api.reloadDestination(signal);
        signal.throwIfAborted();
        if (!latest.revisionId) {
          setFailure(edit('pdfDestinationUnavailable'));
          return;
        }
        const latestFile = currentArticlePdf(latest.files);
        target = {
          ...target,
          expectedRevisionId: latest.revisionId,
          replaceFileId: latestFile?.id,
        };
        setNeedsRefresh(false);
        setPending({ ...pending, destination: target });
        if (target.replaceFileId !== pending.destination.replaceFileId) {
          setReplacementNotice({ fileName: latestFile?.fileName });
          return;
        }
      }
      if (!verifiedId.current) {
        setProgress(0);
        verifiedId.current = await articlePdfReader.verify(
          pending.file,
          signal,
          setProgress,
        );
      }
      signal.throwIfAborted();
      setProgress(undefined);
      await api.attach({
        ...target,
        uploadId: verifiedId.current,
      });
      setPending(undefined);
    } catch (error) {
      if (signal.aborted) return;
      const code = apiErrorCode(error);
      if (
        code === 'article_pdf_upload_expired' ||
        code === 'article_pdf_upload_not_verified' ||
        code === 'article_pdf_upload_consumed'
      ) {
        verifiedId.current = undefined;
      }
      const destinationConflict =
        code === 'output_revision_locked' || code === 'output_file_conflict';
      if (destinationConflict) setNeedsRefresh(true);
      setFailure(
        destinationConflict
          ? edit('pdfRevisionChanged')
          : resolveErrorCode(errors, code, basics('failed')),
      );
    } finally {
      if (!signal.aborted) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <Stack gap="2">
      <Heading as="h2" size={{ base: 'sm', md: 'md' }}>
        {edit('fullText')}
      </Heading>
      <ArticlePdfManagement
        file={
          current?.visibility
            ? {
                id: current.id,
                name: current.fileName,
                size: current.sizeBytes,
                visibility: current.visibility,
              }
            : undefined
        }
        onPickFile={(visibility) => {
          destination.current = {
            expectedRevisionId: revisionId,
            fileVisibility: visibility,
            replaceFileId: current?.id,
          };
          input.current?.click();
        }}
        onChangeVisibility={api.changeVisibility}
        onRemove={api.remove}
        downloadAction={
          current ? (
            <OutputDownloadPrimaryButton
              file={current}
              label={detail('detail.downloadFile')}
              buttonProps={{ variant: 'outline' }}
            />
          ) : undefined
        }
      />
      {otherFiles.length > 0 && (
        <Box bg="bg.panel" p="4">
          <OutputFiles
            files={otherFiles}
            isLoading={false}
            isFailed={false}
            onRetry={() => undefined}
          />
        </Box>
      )}
      <Input
        hidden
        type="file"
        accept="application/pdf,.pdf"
        aria-label={basics('select')}
        ref={input}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          const target = destination.current;
          if (!file || !target) return;
          if (!isValidArticlePdf(file)) {
            showSnackbar({ severity: 'error', message: basics('invalidPdf') });
            return;
          }
          verifiedId.current = undefined;
          setRights(false);
          setFailure(undefined);
          setNeedsRefresh(false);
          setReplacementNotice(undefined);
          setProgress(undefined);
          setPending({ file, destination: target });
        }}
      />
      <ConfirmationModal
        open={Boolean(pending)}
        title={
          pending?.destination.replaceFileId
            ? basics('replace')
            : edit('attachPdf')
        }
        onClose={() => setPending(undefined)}
        onConfirm={savePdf}
        isConfirming={busy}
        isConfirmDisabled={!rights}
        colorPalette="blue"
        confirmLabel={
          failure
            ? basics('retry')
            : replacementNotice && pending?.destination.replaceFileId
              ? basics('replace')
              : basics('upload')
        }
        body={
          pending ? (
            <>
              <ArticlePdfFileCard file={pending.file}>
                <Badge colorPalette="blue">
                  {basics(pending.destination.fileVisibility)}
                </Badge>
              </ArticlePdfFileCard>
              {pending.destination.replaceFileId && (
                <Text textStyle="sm" color="fg.muted">
                  {edit('replacePdfHint')}
                </Text>
              )}
              {replacementNotice && (
                <Text role="status" textStyle="sm" color="fg.muted">
                  {replacementNotice.fileName
                    ? edit('pdfReplacementChanged', {
                        fileName: replacementNotice.fileName,
                      })
                    : edit('pdfReplacementRemoved')}
                </Text>
              )}
              <Checkbox.Root
                checked={rights}
                disabled={busy}
                onCheckedChange={({ checked }) => setRights(checked === true)}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control />
                <Checkbox.Label>{basics('rights')}</Checkbox.Label>
              </Checkbox.Root>
              {busy && (
                <Text role="status" textStyle="sm" color="fg.muted">
                  {progress === undefined
                    ? edit('attachingPdf')
                    : basics('uploading', { percent: progress })}
                </Text>
              )}
              {failure && (
                <Text role="alert" textStyle="sm" color="fg.error">
                  {failure}
                </Text>
              )}
            </>
          ) : undefined
        }
      />
    </Stack>
  );
}
