import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PassThrough, Readable } from 'node:stream';
import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { domainErrorCodes } from '@researchos/error-codes';
import type { PrismaService } from '@researchos/database';
import { describe, expect, it, vi } from 'vitest';
import { ObjectStorageService } from './object-storage.service.js';
import { OutputDownloadService } from './output-download.service.js';

const body = Buffer.from('ResearchOS output file');
const file = {
  file_name: 'output.txt',
  storage_key: 'outputs/test/object',
  sha256: createHash('sha256').update(body).digest('hex'),
  size_bytes: BigInt(body.length),
  allowed: true,
};

function setup() {
  const queryRaw = vi.fn().mockResolvedValueOnce([file]);
  const getObject = vi.fn().mockResolvedValue(Readable.from([body]));
  const storage = new ObjectStorageService();
  vi.spyOn(storage, 'adapter', 'get').mockReturnValue({
    createUploadUrl: vi.fn(),
    getObject,
    headObject: vi.fn(),
    putObject: vi.fn(),
  });
  const service = new OutputDownloadService(
    { $queryRaw: queryRaw } as unknown as PrismaService,
    storage,
  );
  return { service, queryRaw, getObject };
}

describe('OutputDownloadService', () => {
  it('stages the verified bytes for streaming and removes them on cleanup', async () => {
    const { service, queryRaw } = setup();
    queryRaw.mockResolvedValueOnce([{ allowed: true }]);

    const download = await service.prepareDownload(
      'user',
      'file',
      new AbortController().signal,
    );
    try {
      expect(await readFile(download.path)).toEqual(body);
      expect(download.sizeBytes).toBe(file.size_bytes);
    } finally {
      await download.cleanup();
    }
    await expect(readFile(download.path)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects incorrect bytes even when the stored size matches', async () => {
    const { service, queryRaw, getObject } = setup();
    getObject.mockResolvedValueOnce(Readable.from([Buffer.alloc(body.length)]));

    await expect(
      service.prepareDownload('user', 'file', new AbortController().signal),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      code: domainErrorCodes.storage.fileConflict,
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rechecks access after staging and denies a revoked download', async () => {
    const { service, queryRaw } = setup();
    queryRaw.mockResolvedValueOnce([{ allowed: false }]);

    await expect(
      service.prepareDownload('user', 'file', new AbortController().signal),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      code: domainErrorCodes.storage.fileAccessDenied,
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('denies an existing but invisible file as 403', async () => {
    const { service, queryRaw } = setup();
    queryRaw.mockReset().mockResolvedValueOnce([{ ...file, allowed: false }]);
    await expect(
      service.prepareDownload('user', 'file', new AbortController().signal),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      code: domainErrorCodes.storage.fileAccessDenied,
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('destroys the storage stream when the request is aborted during staging', async () => {
    const { service, getObject, queryRaw } = setup();
    const abort = new AbortController();
    const source = new PassThrough();
    const reading = Promise.withResolvers<void>();
    getObject.mockImplementationOnce(() => {
      reading.resolve();
      return Promise.resolve(source);
    });

    const download = service.prepareDownload('user', 'file', abort.signal);
    const rejected = expect(download).rejects.toMatchObject({
      name: 'AbortError',
    });
    await reading.promise;
    abort.abort();
    await rejected;

    expect(source.destroyed).toBe(true);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects a second reservation that would exceed the disk budget and releases bytes on abort', async () => {
    const { service, getObject, queryRaw } = setup();
    const abort = new AbortController();
    const started = Promise.withResolvers<void>();
    const source = new PassThrough();
    queryRaw
      .mockReset()
      .mockResolvedValueOnce([{ ...file, size_bytes: 5n * 1024n ** 3n }]);
    getObject.mockImplementationOnce(() => {
      started.resolve();
      return Promise.resolve(source);
    });
    const pending = service.prepareDownload('user', 'large', abort.signal);
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    await started.promise;
    try {
      queryRaw.mockResolvedValueOnce([file]);
      await expect(
        service.prepareDownload('user', 'small', new AbortController().signal),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(getObject).toHaveBeenCalledTimes(1);
    } finally {
      abort.abort();
      await rejected;
    }

    queryRaw
      .mockResolvedValueOnce([file])
      .mockResolvedValueOnce([{ allowed: true }]);
    const download = await service.prepareDownload(
      'user',
      'small',
      new AbortController().signal,
    );
    await download.cleanup();
  });
});
