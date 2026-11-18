import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createQueueOptions } from '@researchos/queue';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter backed by Redis pub/sub (`@socket.io/redis-adapter`) so
 * room broadcasts, typing updates, and connection state recovery work across
 * multiple API instances. Falls back cleanly to the in-memory adapter when
 * `REDIS_URL` is absent or unavailable in hermetic test runs.
 */
export class ChatRedisIoAdapter extends IoAdapter {
  private readonly adapterLogger = new Logger(ChatRedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private pubClient?: Redis;
  private subClient?: Redis;

  constructor(appOrHttpServer?: INestApplicationContext | object) {
    super(appOrHttpServer);
  }

  async connectToRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this.adapterLogger.log(
        'REDIS_URL not set; using single-instance Socket.IO memory adapter',
      );
      return;
    }

    try {
      const prefix = process.env.QUEUE_PREFIX ?? 'researchos';
      const { connection } = createQueueOptions(redisUrl, prefix, 'worker');

      const pubClient = new Redis({
        ...connection,
        lazyConnect: true,
        maxRetriesPerRequest: null,
      });
      const subClient = pubClient.duplicate();

      pubClient.on('error', (err) =>
        this.adapterLogger.warn(
          `Socket.IO Redis pubClient error: ${err.message}`,
        ),
      );
      subClient.on('error', (err) =>
        this.adapterLogger.warn(
          `Socket.IO Redis subClient error: ${err.message}`,
        ),
      );

      await Promise.all([pubClient.connect(), subClient.connect()]);

      this.pubClient = pubClient;
      this.subClient = subClient;
      this.adapterConstructor = createAdapter(pubClient, subClient, {
        key: `${prefix}:socket.io`,
      });
      this.adapterLogger.log('Socket.IO Redis pub/sub adapter connected');
    } catch (error) {
      this.adapterLogger.warn(
        `Could not connect Socket.IO Redis adapter (${error instanceof Error ? error.message : 'unknown error'}); falling back to memory adapter`,
      );
      await this.disconnectRedis();
    }
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const serverOptions = {
      ...options,
      cors: {
        origin: process.env.WEB_ORIGIN?.split(',') ?? true,
        credentials: true,
      },
      connectionStateRecovery: {
        maxDisconnectionDuration: 120_000,
        skipMiddlewares: true,
      },
    } as ServerOptions;

    const server = super.createIOServer(port, serverOptions) as Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    await this.disconnectRedis();
  }

  private async disconnectRedis(): Promise<void> {
    const clients = [this.pubClient, this.subClient];
    this.pubClient = undefined;
    this.subClient = undefined;
    this.adapterConstructor = undefined;

    await Promise.all(
      clients.map(async (client) => {
        if (!client) return;
        try {
          await client.quit();
        } catch {
          client.disconnect();
        }
      }),
    );
  }
}
