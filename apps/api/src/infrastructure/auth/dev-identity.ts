/**
 * Local-only dev identity (docs/architecture/05-api-auth-frontend.md §2, ADR-0002).
 *
 * The `X-Whip-Dev-User` header is honoured only when ENVIRONMENT === "local" AND DEV_AUTH === "1".
 * Production config has neither variable; `assertDevAuthConfig` makes the Worker refuse to serve
 * if DEV_AUTH is set anywhere else.
 */
export const DEV_USER_HEADER = 'X-Whip-Dev-User';
const DEV_USER_PATTERN = /^[A-Za-z0-9_-]{1,48}$/;

export interface DevAuthEnv {
  ENVIRONMENT: string;
  DEV_AUTH?: string | undefined;
}

export function assertDevAuthConfig(env: DevAuthEnv): void {
  if (env.DEV_AUTH !== undefined && env.DEV_AUTH !== '' && env.ENVIRONMENT !== 'local') {
    throw new Error(`DEV_AUTH must not be set when ENVIRONMENT is "${env.ENVIRONMENT}".`);
  }
}

export function devIdentityEnabled(env: DevAuthEnv): boolean {
  return env.ENVIRONMENT === 'local' && env.DEV_AUTH === '1';
}

/** `dev:<name>` when dev identity is enabled and the header is well-formed, else null. */
export function resolveDevIdentity(env: DevAuthEnv, headers: Headers): string | null {
  if (!devIdentityEnabled(env)) return null;
  const value = headers.get(DEV_USER_HEADER);
  if (value === null || !DEV_USER_PATTERN.test(value)) return null;
  return `dev:${value}`;
}
