/**
 * Deep copy of plain JSON data (objects, arrays, primitives). GameState is JSON by construction, so
 * this is equivalent to structuredClone but several times faster in V8.
 */
export function cloneJson<T>(value: T): T {
  return copy(value) as T;
}

function copy(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const n = v.length;
    const out: unknown[] = new Array<unknown>(n);
    for (let i = 0; i < n; i++) out[i] = copy(v[i]);
    return out;
  }
  const src = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k in src) {
    if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = copy(src[k]);
  }
  return out;
}
