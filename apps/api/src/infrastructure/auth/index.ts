/**
 * Auth wiring: Better Auth (email OTP, D1 sessions) + the local-only dev identity.
 * See docs/architecture/05-api-auth-frontend.md §2 and ADR-0002.
 */
export { createAuth, type Auth, type AuthUser } from './better-auth';
export {
  DEV_USER_HEADER,
  assertDevAuthConfig,
  devIdentityEnabled,
  resolveDevIdentity,
} from './dev-identity';
export { createEmailSender, devOutbox, type EmailSender } from './email-sender';
