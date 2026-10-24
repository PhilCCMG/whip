import { useEffect, useState } from 'react';
import { getPlatform } from './index';
import type { Platform } from './types';

/** The platform once loaded (null for the first render). Desktop-only UI renders when ready. */
export function usePlatform(): Platform | null {
  const [platform, setPlatform] = useState<Platform | null>(null);
  useEffect(() => {
    let live = true;
    void getPlatform().then((p) => {
      if (live) setPlatform(p);
    });
    return () => {
      live = false;
    };
  }, []);
  return platform;
}
