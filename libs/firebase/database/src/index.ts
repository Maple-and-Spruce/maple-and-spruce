export { db, getDb, toDate } from './lib/utilities/database.config';
export { ArtistRepository } from './lib/artist.repository';
export { CategoryRepository } from './lib/category.repository';
export { ProductRepository } from './lib/product.repository';
export {
  SyncConflictRepository,
  type SyncConflictFilters,
} from './lib/sync-conflict.repository';

// Phase 3: Classes & Workshops
export { InstructorRepository } from './lib/instructor.repository';
export { ClassRepository, type ClassFilters } from './lib/class.repository';
export { ClassCategoryRepository } from './lib/class-category.repository';

// Phase 3c: Registration & Discounts
export {
  DiscountRepository,
  type DiscountFilters,
} from './lib/discount.repository';
export {
  RegistrationRepository,
  type RegistrationFilters,
} from './lib/registration.repository';

// Phase 4.5: Calendar
export {
  CalendarEventRepository,
  type CalendarEventFilters,
} from './lib/calendar-event.repository';
export { CalendarEmbedConfigRepository } from './lib/calendar-embed-config.repository';

// Phase 5: Etsy
export {
  FirestoreTokenStorage,
  saveOAuthState,
  consumeOAuthState,
  updateTokenShopId,
} from './lib/etsy-token.repository';
export { EtsyTemplateRepository } from './lib/etsy-template.repository';
