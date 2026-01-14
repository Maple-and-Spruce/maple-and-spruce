import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getMapleApp } from './maple-app';

let _mapleFunctions: ReturnType<typeof getFunctions> | undefined;

export const getMapleFunctions = () => {
  if (!_mapleFunctions) {
    _mapleFunctions = getFunctions(getMapleApp());

    // Connect to local functions in development
    if (
      typeof window !== 'undefined' &&
      window.location.hostname === 'localhost'
    ) {
      connectFunctionsEmulator(_mapleFunctions, 'localhost', 5001);
    }
  }
  return _mapleFunctions;
};
