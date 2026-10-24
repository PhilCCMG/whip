import { describe, expect, it } from 'vitest';
import type { EmailSender } from '../../infrastructure/auth/email-sender';
import { trackDelivery } from './auth';

const input = { to: 'p@example.com', otp: '123456', purpose: 'sign-in' };

describe('trackDelivery', () => {
  it('reports success when the inner sender succeeds', async () => {
    const inner: EmailSender = { sendOtp: () => Promise.resolve() };
    const t = trackDelivery(inner);
    await t.sender.sendOtp(input);
    expect(t.failed()).toBe(false);
  });

  it('records a failure even when the caller swallows the error', async () => {
    const inner: EmailSender = { sendOtp: () => Promise.reject(new Error('provider down')) };
    const t = trackDelivery(inner);
    // Better Auth catches send errors itself; simulate that.
    await t.sender.sendOtp(input).catch(() => undefined);
    expect(t.failed()).toBe(true);
  });

  it('is false until something is sent', () => {
    expect(trackDelivery({ sendOtp: () => Promise.resolve() }).failed()).toBe(false);
  });
});
