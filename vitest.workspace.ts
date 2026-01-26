import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'libs/ts/validation/vitest.config.ts',
  'libs/ts/domain/vitest.config.ts',
  'libs/firebase/database/vitest.config.ts',
  'libs/firebase/functions/vitest.config.ts',
  'libs/firebase/webflow/vitest.config.ts',
  'libs/firebase/maple-functions/detect-sync-conflicts/vitest.config.ts',
  'libs/firebase/maple-functions/square-webhook/vitest.config.ts',
]);
