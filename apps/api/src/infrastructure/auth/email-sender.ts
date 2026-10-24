import { logger } from '../logging/logger';

/** Delivery of sign-in codes (ADR-0002). Implementations never log the address. */
export interface EmailSender {
  sendOtp(input: { to: string; otp: string; purpose: string }): Promise<void>;
}

export interface CapturedOtp {
  to: string;
  otp: string;
  purpose: string;
}

/**
 * Local dev: prints the code to the console (no address) and keeps the last few in memory so the
 * integration tests can read them. Only ever selected when ENVIRONMENT === "local".
 */
export const devOutbox: CapturedOtp[] = [];

export class ConsoleEmailSender implements EmailSender {
  sendOtp(input: CapturedOtp): Promise<void> {
    devOutbox.push(input);
    if (devOutbox.length > 20) devOutbox.shift();
    logger.info('dev_email_otp', { purpose: input.purpose, otp: input.otp });
    return Promise.resolve();
  }
}

/** Resend (https://resend.com) HTTP API. */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async sendOtp({ to, otp }: CapturedOtp): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: [to],
        subject: `Your WHIP sign-in code: ${otp}`,
        text: `Your WHIP sign-in code is ${otp}. It expires in 10 minutes.`,
      }),
    });
    if (!res.ok) {
      logger.error('email_send_failed', { provider: 'resend', status: res.status });
      throw new Error('Email delivery failed.');
    }
  }
}

/** Minimal shape of the Cloudflare Email Service `send_email` binding (structured message form). */
export interface EmailServiceBinding {
  send(message: {
    to: string;
    from: string | { email: string; name?: string };
    subject: string;
    text?: string;
    html?: string;
  }): Promise<{ messageId: string }>;
}

/** Cloudflare Email Service (beta, Workers Paid). The sending domain must be onboarded in the dashboard. */
export class CloudflareEmailSender implements EmailSender {
  constructor(
    private readonly binding: EmailServiceBinding,
    private readonly from: { email: string; name?: string },
  ) {}

  async sendOtp({ to, otp }: CapturedOtp): Promise<void> {
    try {
      await this.binding.send({
        to,
        from: this.from,
        subject: `Your WHIP sign-in code: ${otp}`,
        text: `Your WHIP sign-in code is ${otp}. It expires in 10 minutes.\n\nIf you did not ask for this, you can ignore this email.`,
        html: otpHtml(otp),
      });
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : 'unknown';
      logger.error('email_send_failed', { provider: 'cloudflare', code });
      throw new Error('Email delivery failed.');
    }
  }
}

function otpHtml(otp: string): string {
  return [
    '<div style="font-family:Inter,Arial,sans-serif;background:#0f1d1c;color:#faf8f5;padding:32px">',
    '<p style="font-size:13px;letter-spacing:.08em;margin:0 0 8px;color:#dd2928">WHIP</p>',
    '<p style="font-size:16px;margin:0 0 16px">Your sign-in code</p>',
    `<p style=\"font-size:36px;font-weight:800;letter-spacing:.2em;margin:0 0 16px\">${otp}</p>`,
    '<p style="font-size:13px;opacity:.7;margin:0">It expires in 10 minutes. If you did not ask for this, ignore this email.</p>',
    '</div>',
  ].join('');
}

/** Parses `Name <addr@host>` or a bare address. */
export function parseFrom(value: string): { email: string; name?: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  if (m?.[2]) return m[1] ? { email: m[2], name: m[1] } : { email: m[2] };
  return { email: value.trim() };
}

/** Used when no provider is configured: sign-in emails fail loudly. */
export class UnconfiguredEmailSender implements EmailSender {
  sendOtp(): Promise<void> {
    logger.error('email_send_failed', { provider: 'none', reason: 'not_configured' });
    return Promise.reject(
      new Error('No email provider configured (add the EMAIL binding or set RESEND_API_KEY).'),
    );
  }
}

export interface EmailEnv {
  ENVIRONMENT: string;
  RESEND_API_KEY?: string | undefined;
  EMAIL_FROM?: string | undefined;
  /** Cloudflare Email Service binding (production). */
  EMAIL?: EmailServiceBinding | undefined;
}

export function createEmailSender(env: EmailEnv): EmailSender {
  if (env.ENVIRONMENT === 'local') return new ConsoleEmailSender();
  // Cloudflare Email Service first (no third-party key); Resend kept as a fallback provider.
  if (env.EMAIL) {
    return new CloudflareEmailSender(
      env.EMAIL,
      parseFrom(env.EMAIL_FROM ?? 'WHIP <signin@playwhip.com>'),
    );
  }
  if (env.RESEND_API_KEY) {
    return new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM ?? 'WHIP <no-reply@whip.game>');
  }
  return new UnconfiguredEmailSender();
}
