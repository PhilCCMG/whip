/**
 * Canonical JSON: object keys sorted (UTF-16 code-unit order), no whitespace, `undefined`
 * properties omitted (as JSON.stringify does). The same value always yields the same string, so
 * hashes of snapshots are stable regardless of property insertion order.
 */
export function canonicalStringify(value: unknown): string {
  return write(value);
}

/** Keys made only of these characters need no JSON escaping. */
const SAFE_KEY = /^[A-Za-z0-9_.>:\- ]*$/;

function writeString(s: string): string {
  return JSON.stringify(s);
}

function write(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return writeString(value);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`Non-finite number in state: ${value}`);
      return String(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'object': {
      if (Array.isArray(value)) {
        let s = '[';
        for (let i = 0; i < value.length; i++) {
          if (i > 0) s += ',';
          const v: unknown = value[i];
          s += v === undefined ? 'null' : write(v);
        }
        return s + ']';
      }
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      let s = '{';
      let first = true;
      for (const k of keys) {
        const v = obj[k];
        if (v === undefined) continue;
        if (!first) s += ',';
        first = false;
        s += (SAFE_KEY.test(k) ? `"${k}"` : writeString(k)) + ':' + write(v);
      }
      return s + '}';
    }
    default:
      throw new TypeError(`Unserialisable value of type ${typeof value}`);
  }
}
