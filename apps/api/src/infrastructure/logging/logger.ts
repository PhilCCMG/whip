type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

/**
 * Structured JSON logger (Workers Logs indexes JSON fields). Log opaque IDs only — never emails,
 * tokens, cookies or request bodies.
 */
function log(level: Level, msg: string, fields: Fields = {}): void {
  const line = JSON.stringify({ level, msg, ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: Fields) => log('debug', msg, fields),
  info: (msg: string, fields?: Fields) => log('info', msg, fields),
  warn: (msg: string, fields?: Fields) => log('warn', msg, fields),
  error: (msg: string, fields?: Fields) => log('error', msg, fields),
};
