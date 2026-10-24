// Shared ESLint flat config for the WHIP monorepo.
//
// Exports:
//   - `createWhipConfig({ tsconfigRootDir })`: the full config used by the root eslint.config.js
//   - `purityRules`: determinism bans applied to packages/simulation and packages/domain
//   - `boundaries`: per-package dependency-direction rules
//
// NOTE: flat-config rules with the same name *replace* each other rather than merge, so every
// package glob gets exactly one composed `@typescript-eslint/no-restricted-imports` entry.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Files where simulation/domain may relax rules (fixtures, content injection, benches). */
export const TEST_FILES = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.bench.ts',
  '**/test/**',
  '**/tests/**',
];

// ---------------------------------------------------------------------------
// Purity: simulation + domain must be deterministic and platform-free (ADR-0008).
// ---------------------------------------------------------------------------
const impureGlobals = [
  [
    'Date',
    'Simulation time is a SimDate in GameState; inject a Clock if wall time is ever needed.',
  ],
  ['performance', 'Timing must be injected via SimulationContext, never read from the platform.'],
  ['crypto', 'Use the seeded RNG / hashing injected by the caller.'],
  ['fetch', 'The simulation performs no I/O.'],
  ['process', 'The simulation reads no environment variables.'],
  ['setTimeout', 'The simulation is synchronous and has no timers.'],
  ['setInterval', 'The simulation is synchronous and has no timers.'],
  ['setImmediate', 'The simulation is synchronous and has no timers.'],
  ['queueMicrotask', 'The simulation is synchronous.'],
];

const platformImports = [
  {
    group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    message: 'Pure packages cannot import React.',
  },
  { group: ['hono', 'hono/*', '@hono/*'], message: 'Pure packages cannot import HTTP frameworks.' },
  { group: ['cloudflare:*'], message: 'Pure packages cannot import Cloudflare runtime modules.' },
  { group: ['drizzle-orm', 'drizzle-orm/*'], message: 'Pure packages cannot touch persistence.' },
  { group: ['node:*'], message: 'Pure packages cannot import Node built-ins.' },
];

export const purityRules = {
  'no-restricted-globals': [
    'error',
    ...impureGlobals.map(([name, message]) => ({
      name,
      message: `${name} is banned in pure packages. ${message}`,
    })),
  ],
  'no-restricted-properties': [
    'error',
    {
      object: 'Math',
      property: 'random',
      message: 'Math.random is banned. Use the seeded RNG stream from the turn context.',
    },
    ...['globalThis', 'window', 'self', 'global'].flatMap((object) =>
      impureGlobals.map(([property, message]) => ({
        object,
        property,
        message: `${object}.${property} is banned in pure packages. ${message}`,
      })),
    ),
  ],
};

// ---------------------------------------------------------------------------
// Dependency direction (docs/architecture/01-overview.md §2).
// ---------------------------------------------------------------------------
const INTERNAL = [
  '@whip/domain',
  '@whip/simulation',
  '@whip/content',
  '@whip/contracts',
  '@whip/ui',
  '@whip/api',
  '@whip/web',
];

/** Ban every internal package except `allowed` (and the owner's self-reference). */
function internalBans(owner, allowed) {
  const banned = INTERNAL.filter((p) => !allowed.includes(p) && p !== owner);
  if (banned.length === 0) return [];
  const allowedText = allowed.length ? allowed.join(', ') : 'no internal packages';
  return [
    {
      group: banned.flatMap((p) => [p, `${p}/*`]),
      message: `${owner} may only import ${allowedText} (docs/architecture/01-overview.md §2).`,
    },
  ];
}

const crossPackageRelative = {
  group: ['**/packages/*/src/**', '**/apps/*/src/**'],
  message: 'Import workspace packages by name (@whip/x), never by relative path.',
};

function importRule({ paths = [], patterns = [] }) {
  return ['error', { paths, patterns: [...patterns, crossPackageRelative] }];
}

const RULE = '@typescript-eslint/no-restricted-imports';

export const boundaries = [
  {
    name: 'whip/boundaries/domain',
    files: ['packages/domain/**'],
    rules: {
      [RULE]: importRule({ patterns: [...internalBans('@whip/domain', []), ...platformImports] }),
    },
  },
  {
    name: 'whip/boundaries/simulation',
    files: ['packages/simulation/**'],
    ignores: TEST_FILES,
    rules: {
      [RULE]: importRule({
        // @whip/content is banned via internalBans: content must arrive via SimulationContext.
        patterns: [...internalBans('@whip/simulation', ['@whip/domain']), ...platformImports],
      }),
    },
  },
  {
    name: 'whip/boundaries/simulation-tests',
    files: TEST_FILES.map((g) => `packages/simulation/${g}`),
    rules: {
      [RULE]: importRule({
        patterns: [
          ...internalBans('@whip/simulation', ['@whip/domain', '@whip/content']),
          ...platformImports,
        ],
      }),
    },
  },
  {
    name: 'whip/boundaries/content',
    files: ['packages/content/**'],
    rules: {
      [RULE]: importRule({
        patterns: [...internalBans('@whip/content', ['@whip/domain']), ...platformImports],
      }),
    },
  },
  {
    name: 'whip/boundaries/contracts',
    files: ['packages/contracts/**'],
    rules: {
      [RULE]: importRule({
        patterns: [...internalBans('@whip/contracts', ['@whip/domain']), ...platformImports],
      }),
    },
  },
  {
    name: 'whip/boundaries/ui',
    files: ['packages/ui/**'],
    rules: { [RULE]: importRule({ patterns: internalBans('@whip/ui', []) }) },
  },
  {
    name: 'whip/boundaries/api',
    files: ['apps/api/**'],
    rules: {
      [RULE]: importRule({
        patterns: internalBans('@whip/api', [
          '@whip/domain',
          '@whip/simulation',
          '@whip/content',
          '@whip/contracts',
        ]),
      }),
    },
  },
  {
    name: 'whip/boundaries/web',
    files: ['apps/web/**'],
    rules: {
      [RULE]: importRule({
        paths: [
          {
            name: '@whip/domain',
            allowTypeImports: true,
            message: 'apps/web may import @whip/domain for types only (use `import type`).',
          },
        ],
        patterns: internalBans('@whip/web', ['@whip/contracts', '@whip/ui', '@whip/domain']),
      }),
    },
  },
];

// ---------------------------------------------------------------------------
// Full config
// ---------------------------------------------------------------------------
/** @param {{ tsconfigRootDir: string }} options */
export function createWhipConfig({ tsconfigRootDir }) {
  return tseslint.config(
    {
      name: 'whip/ignores',
      ignores: [
        '**/node_modules/**',
        '**/dist/**',
        '**/coverage/**',
        '**/.wrangler/**',
        '**/worker-configuration.d.ts',
        'apps/api/migrations/**',
        'docs/**',
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      name: 'whip/typescript',
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        'no-restricted-imports': 'off',
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
        eqeqeq: ['error', 'always'],
      },
    },
    {
      name: 'whip/js-files',
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: { globals: globals.node },
    },
    {
      name: 'whip/node-tooling',
      files: ['**/*.config.ts', 'scripts/**'],
      languageOptions: { globals: globals.node },
    },
    {
      name: 'whip/react',
      files: ['apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
      languageOptions: { globals: globals.browser },
      plugins: { 'react-hooks': reactHooks },
      rules: reactHooks.configs.recommended.rules,
    },
    {
      name: 'whip/react-refresh',
      files: ['apps/web/src/**/*.tsx'],
      plugins: { 'react-refresh': reactRefresh },
      rules: { 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }] },
    },
    ...boundaries,
    {
      name: 'whip/purity',
      files: ['packages/simulation/**', 'packages/domain/**'],
      ignores: TEST_FILES,
      rules: purityRules,
    },
    prettier,
  );
}
