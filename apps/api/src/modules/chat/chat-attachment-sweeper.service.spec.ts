import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatAttachmentSweeper } from './chat-attachment-sweeper.service.js';
import type { ChatAttachmentsService } from './chat-attachments.service.js';

describe('ChatAttachmentSweeper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  /*
   * The window is measured against the clock, so the clock is frozen before
   * the sweep runs. Reading `Date.now()` in the test and again inside the
   * sweep leaves a one-millisecond race between the two, and the assertion
   * then fails by exactly that millisecond.
   */
  function sweptAt(attachments: ChatAttachmentsService): Date {
    const call = (
      attachments.sweepOrphanAttachments as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(call).toBeDefined();
    return call?.[0] as Date;
  }

  it('sweeps attachments older than the default 24 hour window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T12:00:00.000Z'));
    const { sweeper, attachments } = makeHarness();

    await sweeper.sweep();

    const olderThan = sweptAt(attachments);
    // The window is 24 hours; the sweep must not reach further back.
    expect(olderThan.toISOString()).toBe('2026-11-18T12:00:00.000Z');
  });

  it('honours the configured retention window in hours', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T12:00:00.000Z'));
    const { sweeper, attachments } = makeHarness({
      CHAT_ATTACHMENT_RETENTION_HOURS: '2',
    });

    await sweeper.sweep();

    const olderThan = sweptAt(attachments);
    expect(olderThan.toISOString()).toBe('2026-11-19T10:00:00.000Z');
  });

  it('does nothing when there is nothing to collect', async () => {
    const { sweeper, attachments } = makeHarness();

    await sweeper.sweep();

    expect(
      attachments.sweepOrphanAttachments as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledTimes(1);
  });
});
