import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatAttachmentSweeper } from './chat-attachment-sweeper.service.js';
import type { ChatAttachmentsService } from './chat-attachments.service.js';

describe('ChatAttachmentSweeper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function makeHarness(overrides?: Record<string, string>) {
    const config = {
      get: vi.fn((key: string) => overrides?.[key]),
    } as unknown as ConfigService;

    const attachments = {
      sweepOrphanAttachments: vi
        .fn()
        .mockResolvedValue({ rows: 0, objects: 0 }),
    } as unknown as ChatAttachmentsService;

    const sweeper = new ChatAttachmentSweeper(config, attachments);
    return { sweeper, attachments };
  }

  it('sweeps attachments older than the default 24 hour window', async () => {
    const { sweeper, attachments } = makeHarness();
    const before = Date.now();

    await sweeper.sweep();

    const call = (
      attachments.sweepOrphanAttachments as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(call).toBeDefined();
    const olderThan = call?.[0] as Date;
    // The window is 24 hours; the sweep must not reach further back.
    expect(olderThan.getTime()).toBeLessThanOrEqual(before - 24 * 60 * 60_000);
    expect(olderThan.getTime()).toBeGreaterThan(before - 25 * 60 * 60_000);
  });

  it('honours the configured retention window in hours', async () => {
    const { sweeper, attachments } = makeHarness({
      CHAT_ATTACHMENT_RETENTION_HOURS: '2',
    });
    const before = Date.now();

    await sweeper.sweep();

    const olderThan = (
      attachments.sweepOrphanAttachments as ReturnType<typeof vi.fn>
    ).mock.calls[0]?.[0] as Date;
    expect(olderThan.getTime()).toBeLessThanOrEqual(before - 2 * 60 * 60_000);
    expect(olderThan.getTime()).toBeGreaterThan(before - 3 * 60 * 60_000);
  });

  it('does nothing when there is nothing to collect', async () => {
    const { sweeper, attachments } = makeHarness();

    await sweeper.sweep();

    expect(
      attachments.sweepOrphanAttachments as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledTimes(1);
  });
});
