import {
  getRemoteConfig,
  fetchAndActivate,
  ensureInitialized,
  getValue,
  getBoolean,
  getString,
  getNumber,
  onConfigUpdate,
} from 'firebase/remote-config';
import { getMapleApp } from './maple-app';

let _mapleRemoteConfig: ReturnType<typeof getRemoteConfig> | undefined;

export const getMapleRemoteConfig = () => {
  if (!_mapleRemoteConfig) {
    _mapleRemoteConfig = getRemoteConfig(getMapleApp());
    // Minimum fetch interval — 0 in dev for instant iteration,
    // 60s in prod to stay within free-tier quotas.
    _mapleRemoteConfig.settings.minimumFetchIntervalMillis =
      process.env['NEXT_PUBLIC_FIREBASE_ENV'] === 'dev' ||
      (typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1'))
        ? 0
        : 60_000;
  }
  return _mapleRemoteConfig;
};

export {
  fetchAndActivate,
  ensureInitialized,
  getValue,
  getBoolean,
  getString,
  getNumber,
  onConfigUpdate,
};
