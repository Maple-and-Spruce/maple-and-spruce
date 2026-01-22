import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'libs/ts/validation/vitest.config.ts',
  'libs/ts/domain/vitest.config.ts',
  'libs/firebase/database/vitest.config.ts',
  'libs/firebase/functions/vitest.config.ts',
]);
