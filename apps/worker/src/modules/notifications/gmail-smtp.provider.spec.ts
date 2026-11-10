import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GmailSmtpProvider } from './gmail-smtp.provider.js';

const { createTransport, sendMail } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { createTransport: vi.fn(() => ({ sendMail })), sendMail };
});

vi.mock('nodemailer', () => ({ default: { createTransport } }));

const from = 'fixture@gmail.com';
const mail = {
  to: 'recipient@example.test',
  subject: 'Digest',
  html: '<ul></ul>',
};

describe('Gmail SMTP adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires STARTTLS and returns the accepted Message-ID', async () => {
    sendMail.mockResolvedValue({
      accepted: [mail.to],
      messageId: 'smtp-message',
    });
    const provider = new GmailSmtpProvider(from, 'fixture-app-password');
    await expect(provider.send(mail)).resolves.toEqual({
      accepted: true,
      messageId: 'smtp-message',
    });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 587,
        requireTLS: true,
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ envelope: { from, to: [mail.to] } }),
    );
  });

  it.each([
    [{ responseCode: 421 }, 'smtp_transient'],
    [{ responseCode: 550 }, 'smtp_permanent'],
    [
      { code: 'ETIMEDOUT', command: 'CONN', timeoutType: 'CONNECT_TIMEOUT' },
      'smtp_transient',
    ],
    [
      { code: 'ETIMEDOUT', command: 'CONN', timeoutType: 'SOCKET_TIMEOUT' },
      'smtp_unknown',
    ],
  ])(
    'maps %j to %s without leaking raw provider details',
    async (error, code) => {
      sendMail.mockRejectedValue({
        ...error,
        response: 'sensitive SMTP response',
      });
      const provider = new GmailSmtpProvider(from, 'fixture-app-password');
      await expect(provider.send(mail)).resolves.toEqual({
        accepted: false,
        code,
      });
    },
  );

  it('rejects an address list before touching SMTP', async () => {
    const provider = new GmailSmtpProvider(from, 'fixture-app-password');
    await expect(
      provider.send({ ...mail, to: `${mail.to},other@example.test` }),
    ).resolves.toEqual({ accepted: false, code: 'smtp_permanent' });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
