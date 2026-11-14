export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

export type MailOutcome =
  | { accepted: true; messageId: string }
  | {
      accepted: false;
      code: 'smtp_auth' | 'smtp_transient' | 'smtp_permanent' | 'smtp_unknown';
    };

export interface MailProvider {
  send(message: MailMessage): Promise<MailOutcome>;
}
