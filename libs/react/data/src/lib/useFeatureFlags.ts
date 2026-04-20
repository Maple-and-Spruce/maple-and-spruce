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

function activateConfig(
  setReady: (v: boolean) => void,
  setTick: React.Dispatch<React.SetStateAction<number>>,
): void {
  const rc = getMapleRemoteConfig();
  fetchAndActivate(rc).then(() => {
    setReady(true);
    setTick((t) => t + 1);
  });
}

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
  const [, setTick] = useState(0);

  useEffect(() => {
    const rc = getMapleRemoteConfig();
    activateConfig(setReady, setTick);

    const unsubscribe = onConfigUpdate(rc, {
      next: () => activateConfig(setReady, setTick),
      error: () => undefined,
      complete: () => undefined,
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
