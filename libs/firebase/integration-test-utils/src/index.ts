export {
  EMULATOR_CONFIG,
  getFunctionUrl,
} from './lib/utils/emulator-config.js';
export {
  createTestUser,
  signInTestUser,
  clearAuthEmulator,
} from './lib/utils/auth-helper.js';
export type { TestUser } from './lib/utils/auth-helper.js';
export {
  clearFirestoreEmulator,
  setFirestoreDoc,
  FirestoreRef,
  FirestoreTimestamp,
} from './lib/utils/firestore-helper.js';
export { callFunction } from './lib/utils/http-client.js';
export type { FunctionResponse } from './lib/utils/http-client.js';

// Fixtures
export { ADMIN_USER, NON_ADMIN_USER } from './lib/fixtures/users.fixture.js';
export {
  SAMPLE_ARTIST,
  SECOND_ARTIST,
} from './lib/fixtures/artist.fixtures.js';
export {
  PUBLISHED_CLASS,
  DRAFT_CLASS,
  CANCELLED_CLASS,
  PAST_CLASS,
  CLASS_IDS,
} from './lib/fixtures/class.fixtures.js';
export {
  PERCENT_DISCOUNT,
  AMOUNT_DISCOUNT,
  AMOUNT_BEFORE_DATE_DISCOUNT,
  EXPIRED_EARLY_BIRD_DISCOUNT,
  INACTIVE_DISCOUNT,
  LARGE_AMOUNT_DISCOUNT,
  DISCOUNT_IDS,
} from './lib/fixtures/discount.fixtures.js';

