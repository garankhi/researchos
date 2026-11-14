import { isEmail } from 'class-validator';
import nodemailer from 'nodemailer';
import type {
  MailMessage,
  MailOutcome,
  MailProvider,
} from './mail-provider.js';

// Nodemailer strips or replaces these characters when building the SMTP envelope.
// eslint-disable-next-line no-control-regex
const REWRITTEN_RECIPIENT_CHARACTERS = /[\x00-\x1f\x7f<>]/;

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
    const { to } = message;
    if (!isEmail(to) || REWRITTEN_RECIPIENT_CHARACTERS.test(to)) {
      return { accepted: false, code: 'smtp_permanent' };
    }
    // Nodemailer trims spaces inside quoted local parts when parsing envelope strings.
    const recipient = { name: '', address: to };
    try {
      const info = await this.transport.sendMail({
        ...message,
        from: { name: 'ResearchOS', address: this.user },
        to: recipient,
        envelope: { from: this.user, to: [recipient] },
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
      // Authentication is a sender configuration failure, independent of this recipient.
      if (code === 'EAUTH') return { accepted: false, code: 'smtp_auth' };
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
