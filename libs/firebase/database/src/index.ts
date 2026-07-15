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
export {
  ClassWaitlistRepository,
  emailKey,
} from './lib/class-waitlist.repository';

// Phase 4: Music Lessons
export { StudentRepository } from './lib/student.repository';
export {
  LessonRepository,
  type LessonFilters,
} from './lib/lesson.repository';
export {
  InvoiceRepository,
  type InvoiceFilters,
} from './lib/invoice.repository';

// Phase 4.5: Calendar
export {
  CalendarEventRepository,
  type CalendarEventFilters,
} from './lib/calendar-event.repository';
export { CalendarEmbedConfigRepository } from './lib/calendar-embed-config.repository';
export {
  CatalogSyncRequestRepository,
  LEASE_TTL_MS,
  type CatalogSyncRequest,
} from './lib/catalog-sync-request.repository';
export { PosSaleRequestRepository } from './lib/pos-sale-request.repository';

// Phase 5: Sales & Inventory
export {
  SaleRepository,
  type SaleFilters,
} from './lib/sale.repository';
export {
  InventoryMovementRepository,
  type InventoryMovementFilters,
} from './lib/inventory-movement.repository';

// Phase 5: Payouts
export {
  PayoutRepository,
  type PayoutFilters,
  type CreatePayoutInput,
} from './lib/payout.repository';

// Agreements & Waivers
export {
  AgreementTemplateRepository,
  type AgreementTemplateFilters,
} from './lib/agreement-template.repository';
export {
  AgreementRequestRepository,
  type AgreementRequestFilters,
} from './lib/agreement-request.repository';
export {
  SignedAgreementRepository,
  type SignedAgreementFilters,
} from './lib/signed-agreement.repository';

// Craft Club (recurring studio-access membership)
export {
  CraftClubMemberRepository,
  craftClubEmailKey,
  type CraftClubMemberFilters,
} from './lib/craft-club-member.repository';
export {
  CraftClubTokenRepository,
  CRAFT_CLUB_ACCESS_TOKEN_TTL_MS,
  CRAFT_CLUB_SESSION_TTL_MS,
} from './lib/craft-club-token.repository';

// Music Together (separate-business early-childhood music program)
export {
  MusicTogetherSemesterRepository,
  type MusicTogetherSemesterFilters,
} from './lib/music-together-semester.repository';
export {
  MusicTogetherSectionRepository,
  type MusicTogetherSectionFilters,
} from './lib/music-together-section.repository';
export {
  MusicTogetherRegistrationRepository,
  type MusicTogetherRegistrationFilters,
} from './lib/music-together-registration.repository';
export {
  MusicTogetherScheduledChargeRepository,
  type MusicTogetherScheduledChargeFilters,
} from './lib/music-together-scheduled-charge.repository';
export {
  MusicTogetherWaitlistRepository,
  mtWaitlistEmailKey,
} from './lib/music-together-waitlist.repository';

// Phase 5: Etsy
export {
  FirestoreTokenStorage,
  saveOAuthState,
  consumeOAuthState,
  updateTokenShopId,
} from './lib/etsy-token.repository';
export { EtsyTemplateRepository } from './lib/etsy-template.repository';
export {
  EtsyImportRepository,
  type CreateEtsyImportInput,
} from './lib/etsy-import.repository';

