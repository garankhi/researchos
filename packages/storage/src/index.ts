import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface UploadRequest {
  key: string;
  contentType: string;
  /** Hex SHA-256 of the entire object, as stored by ResearchOS. */
  sha256: string;
}

export interface PresignedUpload {
  url: string;
  /** Send these exact headers with the PUT request. */
  headers: Record<string, string>;
}

export interface ObjectMetadata {
  sizeBytes: number;
  contentType?: string;
  /** Full-object hex SHA-256, when available from the provider. */
  sha256?: string;
}

export interface StorageAdapter {
  createUploadUrl(request: UploadRequest): Promise<PresignedUpload>;
  headObject(key: string): Promise<ObjectMetadata>;
  /** The caller owns the stream and compares its digest with application metadata. */
  getObject(key: string): Promise<Readable>;
  putObject(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<ObjectMetadata>;
}

const uploadUrlTtlSeconds = 300;
const checksumHeader = 'x-amz-checksum-sha256';

export function createS3Storage(
  env: NodeJS.ProcessEnv = process.env,
): StorageAdapter {
  const bucket = env.S3_BUCKET?.trim();
  const region = env.S3_REGION?.trim();
  if (!bucket || !region) {
    throw new Error('S3_BUCKET and S3_REGION are required');
  }

  const endpoint = env.S3_ENDPOINT?.trim() || undefined;
  if (endpoint) {
    const url = URL.parse(endpoint);
    if (
      !url ||
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        'S3_ENDPOINT must be an HTTP(S) URL without credentials, query or fragment',
      );
    }
  }

  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  if (
    (endpoint || accessKeyId || secretAccessKey) &&
    (!accessKeyId || !secretAccessKey)
  ) {
    throw new Error(
      'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set together for custom S3 configuration',
    );
  }

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: Boolean(endpoint),
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  return new S3Storage(client, bucket);
}

class S3Storage implements StorageAdapter {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async createUploadUrl({
    key,
    contentType,
    sha256,
  }: UploadRequest): Promise<PresignedUpload> {
    if (!/^[a-f\d]{64}$/i.test(sha256)) {
      throw new Error('Upload SHA-256 must be a 64-character hex digest');
    }
    const checksum = Buffer.from(sha256, 'hex').toString('base64');
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ChecksumSHA256: checksum,
      IfNoneMatch: '*',
    });

    const url = await getSignedUrl(this.client, command, {
      expiresIn: uploadUrlTtlSeconds,
      signableHeaders: new Set(['content-type', 'if-none-match']),
      unhoistableHeaders: new Set([checksumHeader]),
    });

    return {
      url,
      headers: {
        'content-type': contentType,
        'if-none-match': '*',
        [checksumHeader]: checksum,
      },
    };
  }

  async headObject(key: string): Promise<ObjectMetadata> {
    const result = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ChecksumMode: 'ENABLED',
      }),
    );
    if (result.ContentLength === undefined) {
      throw new Error('S3 did not return the object size');
    }

    // A multipart composite checksum is not the hash of the complete file.
    const checksum =
      result.ChecksumType !== 'COMPOSITE' && result.ChecksumSHA256
        ? Buffer.from(result.ChecksumSHA256, 'base64')
        : undefined;
    return {
      sizeBytes: result.ContentLength,
      contentType: result.ContentType,
      sha256: checksum?.length === 32 ? checksum.toString('hex') : undefined,
    };
  }

  async getObject(key: string): Promise<Readable> {
    const { Body } = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ChecksumMode: 'ENABLED',
      }),
    );
    if (!(Body instanceof Readable)) {
      throw new Error('S3 did not return a readable object body');
    }
    return Body;
  }

  async putObject(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<ObjectMetadata> {
    const checksum = createHash('sha256').update(body).digest();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ChecksumSHA256: checksum.toString('base64'),
        IfNoneMatch: '*',
      }),
    );
    return {
      sizeBytes: body.byteLength,
      contentType,
      sha256: checksum.toString('hex'),
    };
  }
}
