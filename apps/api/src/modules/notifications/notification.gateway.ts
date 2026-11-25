import {
  Inject,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from '@nestjs/websockets';
import {
  NOTIFICATION_NAMESPACE,
  NotificationSocketEvent,
} from '@researchos/chat';
import {
  createQueueOptions,
  isJobUuid,
  notificationRedisChannel,
} from '@researchos/queue';
import { Redis } from 'ioredis';
import type { Namespace, Socket } from 'socket.io';
import { SESSION_COOKIE_NAME } from '../../common/auth/session-cookie.js';
import {
  SESSION_RESOLVER,
  type SessionResolver,
} from '../../common/auth/session-resolver.js';
import { readCookieFromHeader, userRoom } from '../chat/chat.gateway.js';

@WebSocketGateway({ namespace: NOTIFICATION_NAMESPACE })
export class NotificationGateway
  implements OnGatewayConnection, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer() private server?: Namespace;
  private readonly logger = new Logger(NotificationGateway.name);
  private subscriber?: Redis;

  constructor(
    @Inject(SESSION_RESOLVER) private readonly sessions: SessionResolver,
  ) {}

  onModuleInit(): void {
    if (!process.env.REDIS_URL) return;
    const prefix = process.env.QUEUE_PREFIX ?? 'researchos';
    this.subscriber = new Redis(
      createQueueOptions(process.env.REDIS_URL, prefix, 'worker').connection,
    );
    this.subscriber.on('error', () =>
      this.logger.warn('Notification subscription unavailable'),
    );
    this.subscriber.on('message', (_channel, payload) => this.relay(payload));
    void this.subscriber
      .subscribe(notificationRedisChannel(prefix))
      .catch(() => {
        this.logger.warn('Could not subscribe to notification events');
      });
  }

  onModuleDestroy(): void {
    this.subscriber?.disconnect();
  }

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = readCookieFromHeader(
        socket.handshake.headers.cookie,
        SESSION_COOKIE_NAME,
      );
      const session = token ? await this.sessions.resolve(token) : null;
      if (!session || session.mustChangePassword) {
        socket.emit(NotificationSocketEvent.ERROR, {
          code: session ? 'must_change_password' : 'unauthorized',
        });
        socket.disconnect();
        return;
      }
      await socket.join(userRoom(session.userId));
      socket.emit(NotificationSocketEvent.READY);
    } catch {
      socket.emit(NotificationSocketEvent.ERROR, { code: 'unauthorized' });
      socket.disconnect();
    }
  }

  private relay(payload: string): void {
    try {
      const { recipientId, notificationId } = JSON.parse(payload) as {
        recipientId?: unknown;
        notificationId?: unknown;
      };
      if (isJobUuid(recipientId) && isJobUuid(notificationId)) {
        // Every API instance subscribes. Deliver only to sockets connected here.
        this.server?.local
          .to(userRoom(recipientId))
          .emit(NotificationSocketEvent.CREATED, { id: notificationId });
      }
    } catch {
      this.logger.warn('Dropped malformed notification event');
    }
  }
}
