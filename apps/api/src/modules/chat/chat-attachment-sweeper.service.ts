import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatAttachmentsService } from './chat-attachments.service.js';

/**
 * How long a staged attachment may wait before the sweep collects it.
 *
 * An attachment is staged from the moment its upload is confirmed, while
 * only sending the message links it to a conversation. A composer that is
 * closed, navigated away from or simply abandoned leaves the row and the
 * stored object behind.
 *
 * The window is wide on purpose. Keeping a staged file a little longer
 * costs storage; deleting it too early breaks a send the user was still
 * composing.
 */
const orphanRetentionMs = 24 * 60 * 60_000;

/** How often the sweep runs. */
const sweepIntervalMs = 60 * 60_000;
/**
 * Removes chat attachments that were uploaded but never sent.
 *
 * The sweep is the safety net for the paths the interface cannot cover:
 * the tab is closed, the page is navigated away from, the upload finished
 * but the send failed. Without it those uploads stay in storage forever.
 */
@Injectable()
export class ChatAttachmentSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatAttachmentSweeper.name);
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<void>;
  private stopping = false;

  constructor(
    private readonly config: ConfigService,
    private readonly attachments: ChatAttachmentsService,
  ) {}

  onModuleInit(): void {
    this.schedule(5_000);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearTimeout(this.timer);
    await this.active;
  }

  private schedule(delay: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.active = this.sweep()
        .catch((error: unknown) =>
          this.logger.error(
            error instanceof Error ? error.message : 'Attachment sweep failed',
          ),
        )
        .finally(() => this.schedule(sweepIntervalMs));
    }, delay);
    // The timer must not keep the process alive on shutdown.
    this.timer.unref();
  }

  async sweep(): Promise<void> {
    const retentionMs = this.config.get<string>(
      'CHAT_ATTACHMENT_RETENTION_HOURS',
    );
    const olderThan = new Date(
      Date.now() -
        (retentionMs ? Number(retentionMs) * 60 * 60_000 : orphanRetentionMs),
    );

    const { rows, objects } =
      await this.attachments.sweepOrphanAttachments(olderThan);
    if (rows > 0 || objects > 0) {
      this.logger.log(
        `Swept ${rows} orphaned chat attachment rows and ${objects} stored objects`,
      );
    }
  }
}
