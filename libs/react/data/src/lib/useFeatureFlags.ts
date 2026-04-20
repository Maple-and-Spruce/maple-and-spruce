'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getMapleRemoteConfig,
  fetchAndActivate,
  getBoolean,
  getString,
  getNumber,
  onConfigUpdate,
} from '@maple/ts/firebase/firebase-config';

/**
 * Hook that fetches Remote Config on mount and subscribes to real-time updates.
 * Returns helpers to read flag values — they always reflect the latest activated config.
 *
 * Usage:
 *   const { boolean, string, number, ready } = useFeatureFlags();
 *   if (!ready) return <Loading />;
 *   if (boolean('enable_new_checkout')) { ... }
 */
export function useFeatureFlags() {
  const [ready, setReady] = useState(false);
  // Increment to force re-render when remote values change
  const [, setTick] = useState(0);

  useEffect(() => {
    const rc = getMapleRemoteConfig();

    fetchAndActivate(rc).then(() => setReady(true));

    const unsubscribe = onConfigUpdate(rc, () => {
      fetchAndActivate(rc).then(() => setTick((t) => t + 1));
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const rc = getMapleRemoteConfig();

  const boolean = useCallback(
    (key: string): boolean => getBoolean(rc, key),
    [rc],
  );
  const string = useCallback(
    (key: string): string => getString(rc, key),
    [rc],
  );
  const number = useCallback(
    (key: string): number => getNumber(rc, key),
    [rc],
  );

  return { ready, boolean, string, number } as const;
}
