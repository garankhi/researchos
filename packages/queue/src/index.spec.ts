import { describe, expect, it } from 'vitest';
import { createQueueOptions } from './index.js';

describe('queue configuration', () => {
  it('decodes credentials, selects the database and enables TLS', () => {
    expect(
      createQueueOptions('rediss://app:p%40ss@redis.example:6380/2'),
    ).toMatchObject({
      connection: {
        host: 'redis.example',
        port: 6380,
        username: 'app',
        password: 'p@ss',
        db: 2,
        tls: {},
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
    });
  });

  it('allows workers to reconnect indefinitely', () => {
    expect(
      createQueueOptions('redis://localhost', 'test', 'worker'),
    ).toMatchObject({
      prefix: 'test',
      connection: { maxRetriesPerRequest: null, enableOfflineQueue: true },
    });
  });

  it.each([
    'invalid',
    'https://localhost',
    'redis://localhost/-1',
    'redis://localhost/nope',
  ])('rejects invalid Redis configuration: %s', (url) => {
    expect(() => createQueueOptions(url)).toThrow(/REDIS_URL/);
  });

  it('rejects prefixes that could overlap BullMQ key separators', () => {
    expect(() => createQueueOptions('redis://localhost', 'bad:prefix')).toThrow(
      /QUEUE_PREFIX/,
    );
  });
});
