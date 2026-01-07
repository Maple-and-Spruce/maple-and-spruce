import { getFirestore } from 'firebase/firestore';
import { getMapleApp } from './maple-app';

let _mapleFirestore: ReturnType<typeof getFirestore> | undefined;

export const getMapleFirestore = () => {
  _mapleFirestore ??= getFirestore(getMapleApp());
  return _mapleFirestore;
};
