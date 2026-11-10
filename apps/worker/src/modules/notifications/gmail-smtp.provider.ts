import nodemailer from 'nodemailer';
import type {
  MailMessage,
  MailOutcome,
  MailProvider,
} from './mail-provider.js';

export class GmailSmtpProvider implements MailProvider {
  private readonly transport;

  constructor(
    private readonly user: string,
    password: string,
  ) {
    if (!/^[a-z\d.+_-]+@gmail\.com$/i.test(user) || !password.trim()) {
      throw new Error(
        'Gmail SMTP requires a sender address and an App Password',
      );
    }
    this.transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      dnsTimeout: 5_000,
      auth: { user, pass: password.replace(/\s/g, '') },
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }

  async send(message: MailMessage): Promise<MailOutcome> {
    // The ledger supplies one recipient. SMTP address-list syntax is invalid here.
    if (!/^[^\s@(),:;<>"\\]+@[\p{L}\p{N}.-]+$/u.test(message.to)) {
      return { accepted: false, code: 'smtp_permanent' };
    }
    try {
      const info = await this.transport.sendMail({
        ...message,
        from: { name: 'ResearchOS', address: this.user },
        to: { name: '', address: message.to },
        envelope: { from: this.user, to: [message.to] },
      });
      return info.accepted.length === 1
        ? { accepted: true, messageId: info.messageId }
        : { accepted: false, code: 'smtp_permanent' };
    } catch (error) {
      // SMTP errors can contain recipient addresses and provider response text.
      const { responseCode, timeoutType, code } = error as {
        responseCode?: number;
        timeoutType?: string;
        code?: string;
      };
      if (responseCode && responseCode >= 500 && responseCode < 600) {
        return { accepted: false, code: 'smtp_permanent' };
      }
      if (
        (responseCode && responseCode >= 400 && responseCode < 500) ||
        code === 'EDNS' ||
        (code === 'ETIMEDOUT' &&
          ['CONNECT_TIMEOUT', 'GREETING_TIMEOUT', 'UPGRADE_TIMEOUT'].includes(
            timeoutType ?? '',
          ))
      ) {
        return { accepted: false, code: 'smtp_transient' };
      }
      return { accepted: false, code: 'smtp_unknown' };
    }
  }
}
