import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createS3Storage } from './index.js';

const config = {
  S3_BUCKET: 'researchos-test',
  S3_REGION: 'us-east-1',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_ACCESS_KEY_ID: 'test-key',
  S3_SECRET_ACCESS_KEY: 'test-secret',
};

describe('S3 upload signing', () => {
  it('signs the size, checksum, content type, and create-only precondition', async () => {
    const checksum = createHash('sha256').update('example').digest();
    const storage = createS3Storage(config);

    const upload = await storage.createUploadUrl({
      key: 'file with spaces.txt',
      contentType: 'text/plain',
      sizeBytes: 7,
      sha256: checksum.toString('hex'),
    });

    const url = new URL(upload.url);
    expect(url.origin).toBe(config.S3_ENDPOINT);
    expect(url.pathname).toBe('/researchos-test/file%20with%20spaces.txt');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-length;content-type;host;if-none-match;x-amz-checksum-sha256',
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.has('x-amz-checksum-sha256')).toBe(false);
    expect(upload.headers).toEqual({
      'content-type': 'text/plain',
      'if-none-match': '*',
      'x-amz-checksum-sha256': checksum.toString('base64'),
    });
  });

  it('rejects a malformed digest before signing', async () => {
    const storage = createS3Storage(config);
    await expect(
      storage.createUploadUrl({
        key: 'example.txt',
        contentType: 'text/plain',
        sizeBytes: 1,
        sha256: 'not-a-hash',
      }),
    ).rejects.toThrow(/SHA-256/);
  });

  it('rejects zero bytes before signing', async () => {
    const storage = createS3Storage(config);
    await expect(
      storage.createUploadUrl({
        key: 'empty.txt',
        contentType: 'text/plain',
        sizeBytes: 0,
        sha256: createHash('sha256').digest('hex'),
      }),
    ).rejects.toThrow(/positive integer/);
  });

  it('requires dedicated credentials for a custom endpoint', () => {
    expect(() =>
      createS3Storage({
        ...config,
        S3_ACCESS_KEY_ID: undefined,
        S3_SECRET_ACCESS_KEY: undefined,
      }),
    ).toThrow(/S3_ACCESS_KEY_ID/);
  });
});
