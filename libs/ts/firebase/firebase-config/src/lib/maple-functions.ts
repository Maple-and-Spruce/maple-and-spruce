import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getMapleApp } from './maple-app';

let _mapleFunctions: ReturnType<typeof getFunctions> | undefined;

// Functions are deployed to us-east4 (Northern Virginia - close to WV business)
const FUNCTIONS_REGION = 'us-east4';

export const getMapleFunctions = () => {
  if (!_mapleFunctions) {
    _mapleFunctions = getFunctions(getMapleApp(), FUNCTIONS_REGION);

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
