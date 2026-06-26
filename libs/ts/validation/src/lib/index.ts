/**
 * Validation library
 *
 * Vest validation suites for Maple & Spruce domain types.
 * These can be used on both client and server for consistent validation.
 *
 * @example
 * import { artistValidation } from '@maple/ts/validation';
 *
 * const result = artistValidation(formData);
 * if (!result.isValid()) {
 *   const errors = result.getErrors();
 *   // { name: ['Name is required'], email: ['Email must be valid'] }
 * }
 */

export { artistValidation } from './artist.validation';
export { categoryValidation } from './category.validation';
export { productValidation } from './product.validation';
export { saleValidation } from './sale.validation';
export { payoutValidation } from './payout.validation';
export { inventoryMovementValidation } from './inventory-movement.validation';
export { syncConflictResolutionValidation } from './sync-conflict.validation';

// Phase 3: Classes & Workshops
export { instructorValidation } from './instructor.validation';
export { classValidation } from './class.validation';
export { classCategoryValidation } from './class-category.validation';

// Phase 3c: Registration & Discounts
export { discountValidation, type DiscountValidationInput } from './discount.validation';
export { registrationValidation, type RegistrationValidationInput } from './registration.validation';
export {
  classWaitlistValidation,
  type ClassWaitlistValidationInput,
} from './class-waitlist.validation';

// Phase 4: Music Lessons
export { studentValidation } from './student.validation';
export {
  lessonValidation,
  lessonSeriesValidation,
} from './lesson.validation';
export { invoiceValidation } from './invoice.validation';

// Phase 4.5: Calendar
export { calendarEventValidation } from './calendar-event.validation';

// Agreements & Waivers
export {
  agreementTemplateValidation,
  type AgreementTemplateValidationInput,
} from './agreement-template.validation';
export {
  agreementSigningValidation,
  type AgreementSigningValidationInput,
} from './agreement-signing.validation';

// Shared helpers
export {
  imageUploadValidation,
  DEFAULT_IMAGE_MIME_TYPES,
  DEFAULT_IMAGE_MAX_BYTES,
  type ImageUploadValidationInput,
} from './image-upload.validation';

// Lead attribution (Tally → GA4 + Meta CAPI)
export {
  tallyLeadValidation,
  type TallyLeadValidationInput,
} from './tally-lead.validation';

// Craft Club (recurring studio-access membership)
export {
  craftClubMemberValidation,
  type CraftClubMemberValidationInput,
} from './craft-club-member.validation';
