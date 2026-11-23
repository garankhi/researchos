import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const model = 'qwen3-embedding:0.6b';
const dimension = 1024;
const topicQuery =
  'Given the title and abstract of a research article, retrieve relevant research taxonomy topics.';

class EmbeddingInputError extends Error {}

// null is a rejected input, undefined is work that still needs a retry.
type TopicEmbedding = Float32Array | null | undefined;

@Injectable()
export class TopicEmbeddingModel {
  private readonly endpoint: URL | null;
  readonly version: string | null;
  private readonly digest: string;

  constructor(config: ConfigService) {
    this.digest =
      config.get<string>('OLLAMA_EMBEDDING_DIGEST')?.trim().toLowerCase() ?? '';
    const endpoint = URL.parse(
      config.get<string>('OLLAMA_BASE_URL') || 'http://127.0.0.1:11434',
    );
    const validEndpoint =
      endpoint &&
      ['http:', 'https:'].includes(endpoint.protocol) &&
      !endpoint.username &&
      !endpoint.password;
    this.endpoint = validEndpoint ? endpoint : null;
    this.version =
      /^[0-9a-f]{64}$/u.test(this.digest) && this.endpoint
        ? `${model}:${this.digest}:v1:${dimension}`
        : null;
    if (this.digest && !this.version) {
      new Logger(TopicEmbeddingModel.name).warn(
        'Topic suggestions disabled. Check the Ollama endpoint and model digest.',
      );
    }
  }

  async embedArticle(
    input: string,
    timeoutMs: number,
  ): Promise<Float32Array | null> {
    const [vector] = await this.embed([input], AbortSignal.timeout(timeoutMs));
    return vector ?? null;
  }

  async embedTopics(
    inputs: string[],
    timeoutMs: number,
  ): Promise<TopicEmbedding[]> {
    let vectors: TopicEmbedding[];
    try {
      vectors = await this.embed(inputs, AbortSignal.timeout(timeoutMs));
    } catch (error) {
      if (!(error instanceof EmbeddingInputError)) throw error;
      // Give isolation its own budget. A rejected bulk call may consume most
      // of the original timeout before it reports the rejection.
      vectors = await this.splitRejectedBatch(
        inputs,
        AbortSignal.timeout(timeoutMs),
      );
    }
    if (vectors.includes(null) && !vectors.some(Boolean)) {
      const probe = await this.embedArticle('Research methodology', 4_000);
      if (!probe)
        throw new Error('Ollama could not produce a usable embedding');
    }
    return vectors;
  }

  private async embedTopicBatch(
    inputs: string[],
    signal: AbortSignal,
  ): Promise<TopicEmbedding[]> {
    try {
      return await this.embed(inputs, signal);
    } catch (error) {
      if (!(error instanceof EmbeddingInputError))
        return inputs.map(() => undefined);
      return this.splitRejectedBatch(inputs, signal);
    }
  }

  private async splitRejectedBatch(
    inputs: string[],
    signal: AbortSignal,
  ): Promise<TopicEmbedding[]> {
    if (inputs.length === 1) return [null];
    const middle = Math.floor(inputs.length / 2);
    const left = await this.embedTopicBatch(inputs.slice(0, middle), signal);
    const right = await this.embedTopicBatch(inputs.slice(middle), signal);
    return [...left, ...right];
  }

  private async embed(
    inputs: string[],
    signal: AbortSignal,
  ): Promise<(Float32Array | null)[]> {
    if (!this.version) throw new Error('Topic embedding model is disabled');
    await this.assertModelDigest(signal);

    const response = await this.fetchJson<{ embeddings?: unknown[] }>(
      '/api/embed',
      {
        method: 'POST',
        body: JSON.stringify({
          model,
          input: inputs,
          truncate: true,
          dimensions: dimension,
        }),
        headers: { 'Content-Type': 'application/json' },
        signal,
      },
    );
    if (
      !Array.isArray(response.embeddings) ||
      response.embeddings.length !== inputs.length
    ) {
      throw new Error('Invalid embedding response');
    }
    // Ollama selects the embedding model by tag. A concurrent tag replacement
    // must not introduce vectors from a different digest into this index.
    await this.assertModelDigest(signal);
    return response.embeddings.map(normalizeEmbedding);
  }

  private async assertModelDigest(signal: AbortSignal): Promise<void> {
    const tags = await this.fetchJson<{
      models?: { name?: string; digest?: string }[];
    }>('/api/tags', { signal });
    if (
      !Array.isArray(tags.models) ||
      !tags.models.some(
        (entry) => entry?.name === model && entry.digest === this.digest,
      )
    ) {
      throw new Error('Configured Topic embedding model is unavailable');
    }
  }

  private async fetchJson<T>(path: string, options: RequestInit): Promise<T> {
    if (!this.endpoint) throw new Error('Topic embedding model is disabled');
    const response = await fetch(new URL(path, this.endpoint), {
      ...options,
      redirect: 'error',
    });
    if (path === '/api/embed' && [400, 413, 422].includes(response.status)) {
      throw new EmbeddingInputError('Ollama rejected the embedding input');
    }
    if (!response.ok) throw new Error('Topic embedding model request failed');
    return (await response.json()) as T;
  }
}

export function topicEmbeddingText(
  name: string,
  description: string | null,
): string {
  return description ? `${name}\n${description}` : name;
}

export function articleEmbeddingText(
  title: string,
  abstract: string | null,
): string {
  return `Instruct: ${topicQuery}\nQuery: ${abstract ? `${title}\n${abstract}` : title}`;
}

function normalizeEmbedding(value: unknown): Float32Array | null {
  if (
    !Array.isArray(value) ||
    value.length !== dimension ||
    value.some((item) => typeof item !== 'number' || !Number.isFinite(item))
  ) {
    return null;
  }
  const norm = Math.sqrt(
    value.reduce((sum: number, item: number) => sum + item * item, 0),
  );
  if (!Number.isFinite(norm) || norm <= 0) return null;
  return Float32Array.from(value, (item: number) => item / norm);
}

export function encodeEmbedding(vector: Float32Array): Uint8Array<ArrayBuffer> {
  const bytes = Buffer.alloc(vector.length * 4);
  for (const [index, value] of vector.entries())
    bytes.writeFloatLE(value, index * 4);
  return bytes;
}

export function decodeEmbedding(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength !== dimension * 4)
    throw new Error('Invalid stored embedding length');
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Float32Array.from({ length: dimension }, (_, index) =>
    buffer.readFloatLE(index * 4),
  );
}
