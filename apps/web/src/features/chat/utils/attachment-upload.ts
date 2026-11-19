import { isChatImageMimeType } from '@researchos/chat';

export interface PreparedLocalUploadBytes {
  blob: Blob;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
}

export interface ImageCompressionOptions {
  maxDimension?: number;
  quality?: number;
}

/**
 * Computes the lowercase 64-character hex SHA-256 digest of a byte buffer
 * using the Web Crypto API.
 */
export async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

function replaceFileExtension(fileName: string, nextExt: string): string {
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  return `${base}.${nextExt}`;
}

/**
 * Compresses raster images (`image/jpeg`, `image/png`, `image/webp`) in the
 * browser before computing SHA-256 and byte size so S3 metadata matches the
 * exact uploaded object. Animated GIFs and non-image files pass through
 * untouched.
 */
export async function prepareFileForChatUpload(
  file: File,
  options: ImageCompressionOptions = {},
): Promise<PreparedLocalUploadBytes> {
  const maxDimension = options.maxDimension ?? 1920;
  const quality = options.quality ?? 0.84;
  const lowerMime = file.type.toLowerCase();

  let finalBlob: Blob = file;
  let finalName = file.name;
  let finalMime = lowerMime || 'application/octet-stream';
  let width: number | null = null;
  let height: number | null = null;

  const canCompress =
    isChatImageMimeType(finalMime) &&
    finalMime !== 'image/gif' &&
    typeof document !== 'undefined' &&
    typeof createImageBitmap === 'function';

  if (canCompress) {
    try {
      const bitmap = await createImageBitmap(file);
      const origW = bitmap.width;
      const origH = bitmap.height;
      const scale = Math.min(1, maxDimension / Math.max(origW, origH, 1));
      const targetW = Math.max(1, Math.round(origW * scale));
      const targetH = Math.max(1, Math.round(origH * scale));
      width = targetW;
      height = targetH;

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, targetW, targetH);
        bitmap.close?.();

        const preferredMime =
          finalMime === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
        const compressed = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), preferredMime, quality),
        );

        if (compressed && (compressed.size < file.size || scale < 1)) {
          finalBlob = compressed;
          finalMime = compressed.type || preferredMime;
          finalName = replaceFileExtension(
            file.name,
            finalMime === 'image/jpeg' ? 'jpg' : 'webp',
          );
        } else {
          width = origW;
          height = origH;
        }
      } else {
        bitmap.close?.();
        width = origW;
        height = origH;
      }
    } catch {
      // Fall back to original file bytes if the browser cannot decode the image.
    }
  }

  const buffer = await finalBlob.arrayBuffer();
  const sha256 = await computeSha256Hex(buffer);

  return {
    blob: finalBlob,
    fileName: finalName,
    mimeType: finalMime,
    sizeBytes: buffer.byteLength,
    sha256,
    width,
    height,
  };
}

/**
 * Uploads raw bytes directly to a presigned S3 PUT URL while reporting byte
 * progress (`0`..`100`).
 */
export function uploadBytesToPresignedUrl(
  uploadUrl: string,
  headers: Record<string, string>,
  blob: Blob,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const pct = Math.min(
            100,
            Math.max(0, Math.round((event.loaded / event.total) * 100)),
          );
          onProgress(pct);
        }
      };
    }

    const onAbort = () => {
      xhr.abort();
      reject(new DOMException('Upload aborted', 'AbortError'));
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    xhr.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`S3 upload failed with HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('Network error during S3 upload'));
    };

    xhr.send(blob);
  });
}

/**
 * Resolves a backend-relative authorized download path (`/chat/attachments/:id/download`)
 * against the configured API origin. Never accepts or exposes raw S3 keys.
 */
export function resolveAuthorizedAttachmentUrl(downloadPath: string): string {
  const apiBase = (
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  ).replace(/\/+$/, '');
  const normalizedPath = downloadPath.startsWith('/')
    ? downloadPath
    : `/${downloadPath}`;
  return `${apiBase}${normalizedPath}`;
}
