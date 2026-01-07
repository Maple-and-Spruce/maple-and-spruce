import { initializeApp } from 'firebase/app';
import { mapleFirebaseConfig } from './maple-firebase-config';

let _mapleApp: ReturnType<typeof initializeApp> | undefined;

export const getMapleApp = () => {
  _mapleApp ??= initializeApp(mapleFirebaseConfig);
  return _mapleApp;
};
