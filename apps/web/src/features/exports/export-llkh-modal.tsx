'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  CloseButton,
  Dialog,
  chakra,
  NativeSelect,
  Portal,
  Text,
} from '@chakra-ui/react';
import { FileDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FieldError } from '@/components/ui/feedback';
import {
  llkhExportsControllerCreate,
  llkhExportsControllerDownload,
  jobsControllerFind,
} from '@/lib/api';
import type { LlkhDownloadDto } from '@/lib/api/models';

type Format = 'docx' | 'xlsx';

export function ExportLlkhModal() {
  const t = useTranslations('profile.llkh');
  const [format, setFormat] = useState<Format>('docx');
  const [stage, setStage] = useState<
    'connecting' | 'processing' | 'preparing'
  >();
  const [failed, setFailed] = useState(false);
  const [download, setDownload] = useState<LlkhDownloadDto>();
  const request = useRef<AbortController | null>(null);
  const submission = useRef<{ format: Format; key: string } | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function start() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    if (submission.current?.format !== format) {
      submission.current = { format, key: crypto.randomUUID() };
    }
    setFailed(false);
    setDownload(undefined);
    setStage('connecting');
    try {
      const { jobId } = await llkhExportsControllerCreate(
        { format },
        { 'idempotency-key': submission.current.key },
        undefined,
        signal,
      );
      setStage('processing');
      const deadline = Date.now() + 180_000;
      while (!signal.aborted && Date.now() < deadline) {
        const job = await jobsControllerFind(jobId, { signal });
        if (job.status === 'FAILED') {
          submission.current = null;
          throw new Error('LLKH job failed');
        }
        if (job.status === 'COMPLETED') {
          setStage('preparing');
          const result = await llkhExportsControllerDownload(
            jobId,
            undefined,
            signal,
          );
          if (signal.aborted) return;
          submission.current = null;
          setDownload(result);
          const link = document.createElement('a');
          link.href = result.downloadUrl;
          link.download = result.fileName;
          document.body.append(link);
          link.click();
          link.remove();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (!signal.aborted) setFailed(true);
    } catch {
      if (!signal.aborted) setFailed(true);
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!signal.aborted) setStage(undefined);
      }
    }
  }

  return (
    <Dialog.Root closeOnEscape={!stage} closeOnInteractOutside={!stage}>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="outline">
          <FileDown />
          {t('title')}
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop layerStyle="drawerBackdrop" />
        <Dialog.Positioner>
          <Dialog.Content boxShadow="overlayPanel">
            <Dialog.Header>
              <Dialog.Title>{t('title')}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Dialog.Description mb="4">{t('description')}</Dialog.Description>
              <chakra.label htmlFor="llkh-format">{t('format')}</chakra.label>
              <NativeSelect.Root disabled={!!stage}>
                <NativeSelect.Field
                  id="llkh-format"
                  value={format}
                  onChange={(event) =>
                    setFormat(event.target.value === 'xlsx' ? 'xlsx' : 'docx')
                  }
                >
                  <option value="docx">{t('word')}</option>
                  <option value="xlsx">{t('excel')}</option>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              {stage && (
                <Text role="status" mt="3">
                  {t(stage)}
                </Text>
              )}
              {failed && <FieldError>{t('failed')}</FieldError>}
              {download && (
                <Badge
                  role="status"
                  mt="3"
                  colorPalette={download.exportLevel === 2 ? 'green' : 'blue'}
                >
                  {t(download.exportLevel === 2 ? 'formatted' : 'fallback')}
                </Badge>
              )}
            </Dialog.Body>
            <Dialog.Footer>
              {download && (
                <Button asChild variant="outline">
                  <a href={download.downloadUrl} download={download.fileName}>
                    {t('download')}
                  </a>
                </Button>
              )}
              <Button loading={!!stage} onClick={() => void start()}>
                {t('start')}
              </Button>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <CloseButton disabled={!!stage} />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
