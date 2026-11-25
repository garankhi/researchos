import { useEffect, useRef, useState } from 'react';
import type { ArticlePdfUploadStatusDtoMetadata } from '@/lib/api/models/articlePdfUploadStatusDtoMetadata';
import type { CreateArticleDtoFileVisibility } from '@/lib/api/models/createArticleDtoFileVisibility';

export type ArticlePdfReader = {
  verify: (
    file: File,
    signal: AbortSignal,
    progress: (percent: number) => void,
  ) => Promise<string>;
  readMetadata: (
    uploadId: string,
    signal: AbortSignal,
  ) => Promise<ArticlePdfUploadStatusDtoMetadata>;
};

export function useArticlePdfPreview(
  reader: ArticlePdfReader,
  applyMetadata: (data: NonNullable<ArticlePdfUploadStatusDtoMetadata>) => void,
) {
  const [file, setFile] = useState<File>();
  const [visibility, setVisibility] =
    useState<CreateArticleDtoFileVisibility>();
  const [uploadId, setUploadId] = useState<string>();
  const [phase, setPhase] = useState<
    | 'selected'
    | 'uploading'
    | 'failed'
    | 'reading'
    | 'waiting'
    | 'manual'
    | 'abstractOnly'
    | 'ready'
  >('selected');
  const [progress, setProgress] = useState(0);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  function remove() {
    active.current?.abort();
    active.current = null;
    setFile(undefined);
    setVisibility(undefined);
    setUploadId(undefined);
    setPhase('selected');
  }

  async function upload(next: File, access: CreateArticleDtoFileVisibility) {
    active.current?.abort();
    setFile(next);
    setVisibility(access);
    setUploadId(undefined);
    const request = new AbortController();
    active.current = request;
    const { signal } = request;
    setPhase('uploading');
    setProgress(0);
    let id: string;
    try {
      id = await reader.verify(next, signal, (value) => {
        if (!signal.aborted) setProgress(value);
      });
    } catch {
      if (!signal.aborted) {
        setPhase('failed');
        active.current = null;
      }
      return;
    }
    if (signal.aborted) return;
    setUploadId(id);
    setPhase('reading');
    const timer = window.setTimeout(() => {
      if (!signal.aborted) setPhase('waiting');
    }, 5000);
    signal.addEventListener('abort', () => window.clearTimeout(timer), {
      once: true,
    });
    try {
      const data = await reader.readMetadata(id, signal);
      if (signal.aborted) return;
      const hasBasics =
        data &&
        (data.title ||
          data.publicationDate ||
          data.doi ||
          data.authorNames?.length);
      if (data && (hasBasics || data.abstract)) {
        applyMetadata(data);
        setPhase(hasBasics ? 'ready' : 'abstractOnly');
      } else setPhase('manual');
    } catch {
      if (!signal.aborted) setPhase('manual');
    } finally {
      window.clearTimeout(timer);
      if (active.current === request) active.current = null;
    }
  }
  return {
    file,
    visibility,
    uploadId,
    phase,
    progress,
    remove,
    upload,
  };
}
