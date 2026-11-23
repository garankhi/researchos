import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TopicEmbeddingModel } from './topic-embedding-model.js';

const recipe = 'qwen3-embedding:0.6b';
const digest = 'a'.repeat(64);
const sampleVector = [1, ...Array<number>(1023).fill(0)];

function stubOllama(
  embed: (inputs: string[]) => Response,
): TopicEmbeddingModel {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: URL, request: RequestInit) => {
      if (url.pathname === '/api/tags') {
        return Response.json({ models: [{ name: recipe, digest }] });
      }
      const { input } = JSON.parse(request.body as string) as {
        input: string[];
      };
      return embed(input);
    }),
  );
  return new TopicEmbeddingModel(
    new ConfigService({ OLLAMA_EMBEDDING_DIGEST: digest }),
  );
}

describe('Topic embedding retries', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('preserves known outcomes if a later split hits a timeout', async () => {
    const model = stubOllama((inputs) => {
      if (inputs.includes('rejected'))
        return new Response(null, { status: 400 });
      if (inputs.includes('slow'))
        throw new DOMException('Request timed out', 'TimeoutError');
      return Response.json({ embeddings: inputs.map(() => sampleVector) });
    });

    const result = await model.embedTopics(
      ['rejected', 'valid', 'slow', 'later'],
      60_000,
    );
    expect(result).toEqual([
      null,
      Float32Array.from(sampleVector),
      undefined,
      undefined,
    ]);
  });

  it('keeps an unusable model from exhausting the attempt count for every Topic', async () => {
    const model = stubOllama(() => new Response(null, { status: 400 }));
    await expect(model.embedTopics(['topic'], 60_000)).rejects.toThrow(
      'Ollama rejected',
    );
  });
});
