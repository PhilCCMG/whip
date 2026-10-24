/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" switches the API client to the in-browser mock backend (`pnpm dev:mock`). */
  readonly VITE_API_MOCK?: string;
  /** Dev only: user id sent as `X-Whip-Dev-User` to the Worker's dev auth. */
  readonly VITE_DEV_USER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
