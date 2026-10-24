// Env vars read by src/platform (merged into the ImportMetaEnv declared in src/vite-env.d.ts).
interface ImportMetaEnv {
  /**
   * Origin of the WHIP API, without a trailing slash or path (`https://playwhip.com`). Empty or
   * unset = same origin (the web build). Desktop builds set it in `.env.desktop`.
   */
  readonly VITE_API_BASE?: string;
}
