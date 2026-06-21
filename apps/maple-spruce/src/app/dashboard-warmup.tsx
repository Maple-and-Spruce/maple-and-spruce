'use client';

import { useEffect } from 'react';
import { warmupDashboard } from '../lib/warmup';

/**
 * Fires a one-time warmup of the portal's hot-path Cloud Functions on first
 * client paint. Mounted above AuthGuard in the root layout so the warmup
 * overlaps the Firebase auth handshake instead of waiting for it — by the
 * time auth resolves and the real calls fire, the containers are warm.
 *
 * Renders nothing.
 */
export function DashboardWarmup(): null {
  useEffect(() => {
    warmupDashboard();
  }, []);

  return null;
}
