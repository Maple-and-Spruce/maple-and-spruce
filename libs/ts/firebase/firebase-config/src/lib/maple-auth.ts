import { getAuth } from 'firebase/auth';
import { getMapleApp } from './maple-app';

let _mapleAuth: ReturnType<typeof getAuth> | undefined;

export const getMapleAuth = () => {
  _mapleAuth ??= getAuth(getMapleApp());
  return _mapleAuth;
};
