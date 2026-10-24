import { describe, expect, it } from 'vitest';
import {
  CloudflareEmailSender,
  ConsoleEmailSender,
  createEmailSender,
  parseFrom,
  UnconfiguredEmailSender,
  type EmailServiceBinding,
} from './email-sender';

function fakeBinding(fail?: string) {
  const sent: Parameters<EmailServiceBinding['send']>[0][] = [];
  const binding: EmailServiceBinding = {
    send(message) {
      sent.push(message);
      if (fail) return Promise.reject(Object.assign(new Error('nope'), { code: fail }));
      return Promise.resolve({ messageId: 'm1' });
    },
  };
  return { binding, sent };
}

describe('parseFrom', () => {
  it('parses "Name <addr>" and bare addresses', () => {
    expect(parseFrom('WHIP <signin@playwhip.com>')).toEqual({
      email: 'signin@playwhip.com',
      name: 'WHIP',
    });
    expect(parseFrom('<a@b.com>')).toEqual({ email: 'a@b.com' });
    expect(parseFrom(' a@b.com ')).toEqual({ email: 'a@b.com' });
  });
});

describe('createEmailSender', () => {
  it('uses the console in local, Cloudflare when bound, else fails loudly', () => {
    const { binding } = fakeBinding();
    expect(createEmailSender({ ENVIRONMENT: 'local', EMAIL: binding })).toBeInstanceOf(
      ConsoleEmailSender,
    );
    expect(createEmailSender({ ENVIRONMENT: 'production', EMAIL: binding })).toBeInstanceOf(
      CloudflareEmailSender,
    );
    expect(createEmailSender({ ENVIRONMENT: 'production' })).toBeInstanceOf(
      UnconfiguredEmailSender,
    );
  });
});

describe('CloudflareEmailSender', () => {
  it('sends the code from the configured address', async () => {
    const { binding, sent } = fakeBinding();
    await new CloudflareEmailSender(binding, {
      email: 'signin@playwhip.com',
      name: 'WHIP',
    }).sendOtp({
      to: 'player@example.com',
      otp: '123456',
      purpose: 'sign-in',
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('player@example.com');
    expect(sent[0]?.from).toEqual({ email: 'signin@playwhip.com', name: 'WHIP' });
    expect(sent[0]?.text).toContain('123456');
    expect(sent[0]?.html).toContain('123456');
  });

  it('wraps provider errors without leaking details', async () => {
    const { binding } = fakeBinding('E_SENDER_NOT_VERIFIED');
    await expect(
      new CloudflareEmailSender(binding, { email: 'x@y.z' }).sendOtp({
        to: 'p@example.com',
        otp: '1',
        purpose: 'sign-in',
      }),
    ).rejects.toThrow('Email delivery failed.');
  });
});
