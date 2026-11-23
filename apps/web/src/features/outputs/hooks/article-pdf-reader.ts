import {
  articleCreationUploadControllerConfirmUpload,
  articleCreationUploadControllerCreateUpload,
  articleCreationUploadControllerGetUpload,
} from '@/lib/api';
import {
  computeSha256Hex,
  uploadBytesToPresignedUrl,
} from '@/lib/presigned-upload';
import type { ArticlePdfReader } from './use-article-pdf-preview';

function waitToPoll(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, 1000);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export const articlePdfReader: ArticlePdfReader = {
  async verify(file, signal, progress) {
    const sha256 = await computeSha256Hex(await file.arrayBuffer());
    signal.throwIfAborted();
    const ticket = await articleCreationUploadControllerCreateUpload(
      {
        fileName: file.name,
        mimeType: 'application/pdf',
        sizeBytes: file.size,
        sha256,
      },
      undefined,
      signal,
    );
    await uploadBytesToPresignedUrl(
      ticket.uploadUrl,
      ticket.headers,
      file,
      progress,
      signal,
    );
    const verified = await articleCreationUploadControllerConfirmUpload(
      ticket.uploadId,
      undefined,
      signal,
    );
    if (verified.status !== 'VERIFIED')
      throw new Error('Article PDF was not verified');
    return verified.uploadId;
  },
  async readMetadata(uploadId, signal) {
    const requestSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(60_000),
    ]);
    while (true) {
      const upload = await articleCreationUploadControllerGetUpload(
        uploadId,
        undefined,
        requestSignal,
      );
      if (upload.status !== 'VERIFIED' || upload.metadataStatus === 'FAILED')
        return null;
      if (upload.metadataStatus === 'READY') return upload.metadata;
      await waitToPoll(requestSignal);
    }
  },
};
