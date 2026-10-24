import { IDEMPOTENCY_HEADER } from '@whip/contracts';
import type { z } from 'zod';
import { signalSessionExpired } from '../platform/events';
import type { Platform } from '../platform/types';
import { ApiError, errorFromResponse } from './errors';

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  /** Resolves the fetch implementation (real `fetch`, or the in-browser mock backend). */
  fetch: () => FetchLike | Promise<FetchLike>;
  baseUrl?: string;
  /** Dev only: sent as `X-Whip-Dev-User` so the Worker's dev auth picks a user. */
  devUser?: string | undefined;
  /** Retries for a mutation after a retryable failure. The idempotency key is reused. */
  maxRetries?: number;
  retryDelayMs?: (attempt: number) => number;
  newIdempotencyKey?: () => string;
  /**
   * Platform session transport (src/platform): fetch credentials + auth headers per request.
   * Web: cookies (`include`), no headers. Desktop: `Authorization: Bearer`, no cookies; a 401
   * with a stored token clears it (stale or revoked session → signed out).
   * Omitted (tests): `credentials: 'include'`.
   */
  platform?: () => Promise<ClientPlatform>;
}

export type ClientPlatform = Pick<
  Platform,
  'fetchCredentials' | 'getAuthHeaders' | 'hasSessionToken' | 'clearSessionToken'
>;

type Query = Record<string, string | number | boolean | undefined | null>;

export interface GetOptions {
  query?: Query | undefined;
  signal?: AbortSignal | undefined;
}

export interface MutateOptions {
  body?: unknown;
  query?: Query | undefined;
  /** Supply to tie several requests to one logical mutation; generated if omitted. */
  idempotencyKey?: string;
  signal?: AbortSignal | undefined;
}

export interface ApiClient {
  get<S extends z.ZodType>(path: string, schema: S, options?: GetOptions): Promise<z.infer<S>>;
  mutate<S extends z.ZodType>(
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    schema: S | null,
    options?: MutateOptions,
  ): Promise<z.infer<S>>;
}

function buildUrl(base: string, path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return `${base}${path}${qs ? `?${qs}` : ''}`;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createApiClient(options: ApiClientOptions): ApiClient {
  const base = options.baseUrl ?? '/api/v1';
  const maxRetries = options.maxRetries ?? 2;
  const retryDelay = options.retryDelayMs ?? ((attempt: number) => 250 * 2 ** attempt);
  const newKey = options.newIdempotencyKey ?? (() => crypto.randomUUID());
  /** ETag cache for GETs: url → { etag, body }. Campaign reads are keyed by revision. */
  const etags = new Map<string, { etag: string; body: unknown }>();

  function headers(extra?: Record<string, string>): Headers {
    const h = new Headers({ accept: 'application/json', ...extra });
    if (options.devUser) h.set('X-Whip-Dev-User', options.devUser);
    return h;
  }

  async function send(url: string, init: RequestInit): Promise<Response> {
    const doFetch = await options.fetch();
    const platform = options.platform ? await options.platform() : null;
    const headers = new Headers(init.headers);
    for (const [k, v] of Object.entries(platform?.getAuthHeaders() ?? {})) headers.set(k, v);
    try {
      const res = await doFetch(url, {
        credentials: platform?.fetchCredentials ?? 'include',
        ...init,
        headers,
      });
      if (res.status === 401 && platform?.hasSessionToken()) {
        await platform.clearSessionToken();
        signalSessionExpired();
      }
      return res;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      throw new ApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'Could not reach the server. Check your connection.',
        details: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function readBody(res: Response): Promise<unknown> {
    if (res.status === 204) return undefined;
    const text = await res.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  function parse<S extends z.ZodType>(schema: S | null, body: unknown, status: number): z.infer<S> {
    if (!schema) return body as z.infer<S>;
    const result = schema.safeParse(body);
    if (!result.success) {
      throw new ApiError({
        status,
        code: 'INVALID_RESPONSE',
        message: 'The server sent a response this version of WHIP does not understand.',
        details: result.error.issues,
      });
    }
    return result.data;
  }

  return {
    async get(path, schema, opts) {
      const url = buildUrl(base, path, opts?.query);
      const cached = etags.get(url);
      const res = await send(url, {
        method: 'GET',
        headers: headers(cached ? { 'If-None-Match': cached.etag } : undefined),
        signal: opts?.signal ?? null,
      });
      if (res.status === 304 && cached) return parse(schema, cached.body, 200);
      const body = await readBody(res);
      if (!res.ok) throw errorFromResponse(res.status, body);
      const etag = res.headers.get('ETag');
      if (etag) etags.set(url, { etag, body });
      return parse(schema, body, res.status);
    },

    async mutate(method, path, schema, opts) {
      const url = buildUrl(base, path, opts?.query);
      const key = opts?.idempotencyKey ?? newKey();
      const payload = opts?.body === undefined ? undefined : JSON.stringify(opts.body);
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await send(url, {
            method,
            headers: headers({
              [IDEMPOTENCY_HEADER]: key,
              ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
            }),
            body: payload ?? null,
            signal: opts?.signal ?? null,
          });
          const body = await readBody(res);
          if (!res.ok) throw errorFromResponse(res.status, body);
          return parse(schema, body, res.status);
        } catch (e) {
          if (e instanceof ApiError && e.retryable && attempt < maxRetries) {
            await sleep(retryDelay(attempt));
            continue;
          }
          throw e;
        }
      }
    },
  };
}
