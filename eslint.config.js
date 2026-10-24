import { createWhipConfig } from '@whip/config/eslint';

export default [
  ...createWhipConfig({ tsconfigRootDir: import.meta.dirname }),
  // Tauri build output and generated schemas (apps/desktop).
  { ignores: ['apps/desktop/src-tauri/target/**', 'apps/desktop/src-tauri/gen/**'] },
];
