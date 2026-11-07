import { EventEmitter, addAbortListener } from 'node:events';
import { ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import { expect, it, vi } from 'vitest';
import { OutputDownloadController } from './output-download.controller.js';
import type { OutputDownloadService } from './output-download.service.js';

it('aborts stalled verification and returns 503 before sending the attachment', async () => {
  vi.useFakeTimers();
  try {
    const started = Promise.withResolvers<AbortSignal>();
    const downloads = {
      prepareDownload(_userId: string, _fileId: string, signal: AbortSignal) {
        started.resolve(signal);
        return new Promise((_resolve, reject) => {
          addAbortListener(signal, () => reject(new Error('Storage aborted')));
        });
      },
    } as unknown as OutputDownloadService;
    const response = Object.assign(new EventEmitter(), {
      set: vi.fn(),
      attachment: vi.fn(),
      destroyed: false,
    });
    const controller = new OutputDownloadController(downloads);

    const pending = controller.downloadFile(
      'file',
      'user',
      response as unknown as Response,
    );
    const rejected = expect(pending).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    const signal = await started.promise;

    await vi.advanceTimersByTimeAsync(15 * 60_000);
    await rejected;

    expect(signal.aborted).toBe(true);
    expect(response.attachment).not.toHaveBeenCalled();
    expect(response.listenerCount('close')).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
