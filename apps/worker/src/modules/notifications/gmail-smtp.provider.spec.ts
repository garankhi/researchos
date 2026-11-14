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
      expect.objectContaining({
        envelope: { from, to: [{ name: '', address: mail.to }] },
      }),
    );
  });

  it.each([
    [{ responseCode: 421 }, 'smtp_transient'],
    [{ responseCode: 550 }, 'smtp_permanent'],
    [{ responseCode: 535, code: 'EAUTH' }, 'smtp_auth'],
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

  it.each(['"a,b"@example.test', '" a"@example.test', '"a "@example.test'])(
    'preserves %j as the only envelope recipient',
    async (to) => {
      const { default: nodemailer } =
        await vi.importActual<typeof import('nodemailer')>('nodemailer');
      const streamTransport = nodemailer.createTransport({
        streamTransport: true,
        buffer: true,
      });
      const buildEnvelope = vi.fn(
        async (message: Parameters<typeof streamTransport.sendMail>[0]) => {
          const result = await streamTransport.sendMail(message);
          return { accepted: result.envelope.to, messageId: result.messageId };
        },
      );
      sendMail.mockImplementationOnce(buildEnvelope);
      const provider = new GmailSmtpProvider(from, 'fixture-app-password');

      await expect(provider.send({ ...mail, to })).resolves.toEqual({
        accepted: true,
        messageId: expect.any(String),
      });
      await expect(buildEnvelope.mock.results[0]?.value).resolves.toMatchObject(
        {
          accepted: [to],
        },
      );
    },
  );

  it.each([
    ['opening angle bracket', '"a<b"@example.test'],
    ['closing angle bracket', '"a>b"@example.test'],
    ['tab', '"a\tb"@example.test'],
    ['line break', '"a\r\nb"@example.test'],
    ['DEL', '"a\x7fb"@example.test'],
  ])('rejects a quoted mailbox with %s before sending', async (_, to) => {
    const provider = new GmailSmtpProvider(from, 'fixture-app-password');
    await expect(provider.send({ ...mail, to })).resolves.toEqual({
      accepted: false,
      code: 'smtp_permanent',
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('rejects an address list before touching SMTP', async () => {
    const provider = new GmailSmtpProvider(from, 'fixture-app-password');
    await expect(
      provider.send({ ...mail, to: `${mail.to},other@example.test` }),
    ).resolves.toEqual({ accepted: false, code: 'smtp_permanent' });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
