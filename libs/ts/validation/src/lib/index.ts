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
