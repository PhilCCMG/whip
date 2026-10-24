# ADR-0011: Desktop client with Tauri v2

- Status: Proposed
- Date: 2026-10-24
- Details: [docs/architecture/08-desktop.md](../architecture/08-desktop.md)

## Context

WHIP should also ship as a proper PC game: its own window, fullscreen, an installer, auto-update and
a Quit item. It must keep the same tech (React SPA) and the same cloud backend: the server stays
authoritative (ADR-0003/0005), so there is no local simulation and no local database. ADR-0007 relied
on "one origin, first-party cookies, no CORS", and a desktop shell breaks that assumption.

## Decision

1. **Tauri v2** app in `apps/desktop` (`@whip/desktop`). The webview loads the **bundled** SPA
   (`vite build --mode desktop` → `apps/desktop/dist`), not the remote site, so each client build is
   versioned, signed and updatable. All game data comes from `https://playwhip.com/api/*`
   (`VITE_API_BASE`: `''` for the web build, `https://playwhip.com` for desktop, and an override in
   `apps/web/.env.desktop.local` for staging or local use).
   *Why Tauri rather than Electron*: it uses the OS webview (~3 MB installer vs ~100 MB), has a Rust
   host for the credential store, and ships first-party updater, single-instance and window-state
   plugins.
2. **Auth: Better Auth `bearer` plugin** (`requireSignature: true`). The Tauri origins
   (`http://tauri.localhost` on Windows, `tauri://localhost` on macOS/Linux) are cross-site to
   playwhip.com, so `SameSite=Lax` cookies are never sent. Sign-in responses carry
   `set-auth-token` (the signed session-cookie value). The desktop client sends
   `Authorization: Bearer <token>`, and the plugin turns it back into the session cookie before
   Better Auth reads it. Revocation, expiry and rate limits work the same for both session types.
   The browser keeps cookie auth unchanged.
3. **CORS on `/api/*`**, not `@tauri-apps/plugin-http`. Only the three Tauri origins get a grant
   (plus the Vite/Tauri dev servers when `ENVIRONMENT=local`). Allowed request headers are
   `Authorization`, `Content-Type`, `Idempotency-Key`, `If-None-Match` (plus `X-Whip-Dev-User`
   locally), exposed headers are `set-auth-token` and `ETag`, and there is **no**
   `Allow-Credentials`. The same origins are added to Better Auth `trustedOrigins` so its
   Origin/Fetch-Metadata CSRF checks pass.
   *Why not plugin-http*: routing every request through Rust IPC needs a second HTTP stack and URL
   scope config, and the webview's devtools can't see it. The SPA's fetch client, ETag cache and
   error handling would have to fork. Webview `fetch` + CORS keeps one code path, and the
   server-side rules are needed anyway for any future non-browser client. No website can claim a
   `tauri://` or `tauri.localhost` origin, and with bearer-only auth a granted origin can't ride a
   browser cookie session either.
4. **Token storage: the OS credential store** through the `keyring` crate (v4, `v1` feature:
   Windows Credential Manager, macOS Keychain, and Linux Secret Service via pure-Rust zbus), behind
   three small Tauri commands (`session_token_get/set/clear`, keyed by API host).
   *Why not a plugin*: `tauri-plugin-stronghold` needs a user password and is heavyweight, and
   community keyring plugins are thin wrappers around this same crate. About 60 lines of our own
   Rust is easier to audit. The token is never put in localStorage. If the store is unavailable,
   the session lasts only until the app closes.
5. **Platform adapter** `apps/web/src/platform/`: `getPlatform()` returns a web or desktop
   implementation. The desktop implementation uses Tauri's injected globals (`withGlobalTauri`)
   rather than `@tauri-apps/*` npm packages. This keeps apps/web free of Tauri dependencies, and
   web builds drop the desktop chunk statically (`import.meta.env.MODE`).
6. **Auto-update**: `tauri-plugin-updater` + `tauri-plugin-process`, minisign-signed (public key in
   `tauri.conf.json`, private key in GitHub secrets). The endpoint is the Worker's dynamic route
   `https://playwhip.com/api/v1/desktop/update/{{target}}/{{arch}}/{{current_version}}` (200 with
   the update JSON, or 204), backed by the R2 bucket `whip-releases`; installers download from
   `/api/v1/desktop/files/…` and `playwhip.com/download` redirects by OS.
   *Amended 2026-10-25*: originally GitHub Releases `latest.json`, but the repo is private, so
   release assets need auth and neither the updater nor players could fetch them. R2 keeps
   distribution on the Cloudflare stack, adds channels/rollback, and costs nothing in egress.
7. **Release** (two steps): tag `desktop-v*` (or a manual run choosing platforms) →
   `.github/workflows/desktop-release.yml` (Windows NSIS per-user, macOS universal dmg, Linux
   AppImage/deb) builds, signs and uploads to `desktop/releases/{version}/` with a
   `manifest.json` — **unpublished**. `.github/workflows/desktop-promote.yml` (manual, `production`
   environment approval) points `desktop/channels/stable.json` at a version; only then is it live.
   Rollback = promote an older version (stops further updates to the bad one; Tauri never
   downgrades, so fixes ship as a newer version).
8. **Compatibility**: the client and the API version independently. `GET /api/v1/health` gains
   `apiVersion` (and optional `minDesktopVersion` from the `MIN_DESKTOP_VERSION` var). The client
   blocks play with "Update required" when it is too old or the API major differs.

## Consequences

### Positive
- Real game packaging (~3 MB installer, per-user, no admin) with no duplicated game logic.
- Desktop and web share one SPA and one API. Desktop releases don't need a Worker deploy, and
  most Worker deploys don't need a desktop release.
- Server-side bearer + CORS rules are tested in workerd.

### Negative
- Two auth transports to keep correct. A bearer token is a long-lived credential (30-day sessions),
  so its protection depends on the OS credential store.
- ADR-0007's "no CORS" no longer holds for `/api/*`, though it is limited to fixed Tauri origins.
- The desktop client is only as fresh as its last update. API changes must stay additive within v1,
  or bump `MIN_DESKTOP_VERSION`.
- Unsigned binaries (see below) trigger OS warnings.

## Out of scope / future

- **Code signing**: Windows Authenticode (OV/EV certificate, or Azure Trusted Signing) and macOS
  Developer ID + notarization. Until then Windows SmartScreen shows "Windows protected your PC"
  (More info → Run anyway) and reputation builds slowly, and macOS Gatekeeper blocks the app
  ("cannot be opened because the developer cannot be verified"; right-click → Open, or
  `xattr -dr com.apple.quarantine`). The updater's minisign signature still protects updates
  from tampering, but it is not OS trust.
- **Steam**: Steamworks SDK (overlay, achievements), Steam OpenID linked as a Better Auth account
  (ADR-0002 future), and Steam's own depot updates instead of our updater.
- Offline play (would need a local engine and conflict handling; it contradicts ADR-0005 today),
  Discord rich presence, a native menu bar, and deep-link sign-in (`whip://`).
