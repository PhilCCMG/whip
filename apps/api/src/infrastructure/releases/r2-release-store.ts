import {
  DesktopChannelPointerSchema,
  DesktopReleaseManifestSchema,
  type DesktopChannel,
  type DesktopChannelPointer,
  type DesktopReleaseManifest,
} from '@whip/contracts';
import type { z } from 'zod';
import {
  channelKey,
  releaseManifestKey,
  type ReleaseStore,
} from '../../application/desktop-releases';

type Log = (msg: string, fields: Record<string, unknown>) => void;

/**
 * Reads channel pointers and manifests from the `RELEASES` bucket. Malformed objects are logged
 * (key only) and treated as missing, so a bad upload means "no update", never a 500 for players.
 * A missing binding (staging) behaves like an empty bucket.
 */
export class R2ReleaseStore implements ReleaseStore {
  constructor(
    private readonly bucket: R2Bucket | undefined,
    private readonly logError: Log,
  ) {}

  channel(channel: DesktopChannel): Promise<DesktopChannelPointer | null> {
    return this.readJson(channelKey(channel), DesktopChannelPointerSchema);
  }

  manifest(version: string): Promise<DesktopReleaseManifest | null> {
    return this.readJson(releaseManifestKey(version), DesktopReleaseManifestSchema);
  }

  private async readJson<T extends z.ZodType>(key: string, schema: T): Promise<z.output<T> | null> {
    if (!this.bucket) return null;
    const object = await this.bucket.get(key);
    if (!object) return null;
    let raw: unknown;
    try {
      raw = await object.json();
    } catch {
      this.logError('desktop_release_invalid_json', { key });
      return null;
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      this.logError('desktop_release_invalid_object', { key, issues: parsed.error.issues.length });
      return null;
    }
    return parsed.data;
  }
}
