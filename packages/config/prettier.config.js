/** @type {import("prettier").Config} */
export default {
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all',
  semi: true,
  arrowParens: 'always',
  endOfLine: 'lf',
  overrides: [
    // Keep wrangler.jsonc etc. parseable by strict JSONC readers.
    { files: ['*.jsonc'], options: { trailingComma: 'none' } },
  ],
};
