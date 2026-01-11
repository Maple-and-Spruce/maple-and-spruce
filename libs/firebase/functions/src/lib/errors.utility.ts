/**
 * Error utilities for Firebase Cloud Functions
 *
 * Standardized error handling for consistent API responses.
 */
import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Error codes used across the API
 */
export const ErrorCode = {
  NOT_FOUND: 'not-found',
  ALREADY_EXISTS: 'already-exists',
  INVALID_ARGUMENT: 'invalid-argument',
  FAILED_PRECONDITION: 'failed-precondition',
  PERMISSION_DENIED: 'permission-denied',
  UNAUTHENTICATED: 'unauthenticated',
  INTERNAL: 'internal',
} as const;

/**
 * Throw a not found error
 *
 * @example
 * const artist = await ArtistRepository.findById(id);
 * if (!artist) {
 *   throwNotFound('Artist', id);
 * }
 */
export function throwNotFound(entityName: string, id: string): never {
  throw new HttpsError('not-found', `${entityName} with ID ${id} not found`);
}

/**
 * Throw an already exists error
 *
 * @example
 * const existing = await ArtistRepository.findByEmail(email);
 * if (existing) {
 *   throwAlreadyExists('Artist', 'email', email);
 * }
 */
export function throwAlreadyExists(entityName: string, field: string, value: string): never {
  throw new HttpsError('already-exists', `${entityName} with ${field} "${value}" already exists`);
}

/**
 * Throw an invalid argument error
 *
 * @example
 * if (data.price < 0) {
 *   throwInvalidArgument('Price must be non-negative');
 * }
 */
export function throwInvalidArgument(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

/**
 * Throw a validation error with field-specific errors
 *
 * @example
 * const result = artistValidation(data);
 * if (!result.isValid()) {
 *   throwValidationError(result.getErrors());
 * }
 */
export function throwValidationError(errors: Record<string, string[]>): never {
  const messages = Object.entries(errors)
    .map(([field, fieldErrors]) => `${field}: ${fieldErrors.join(', ')}`)
    .join('; ');
  throw new HttpsError('invalid-argument', `Validation failed: ${messages}`);
}

/**
 * Throw a failed precondition error
 *
 * @example
 * if (product.status === 'sold') {
 *   throwFailedPrecondition('Cannot modify a sold product');
 * }
 */
export function throwFailedPrecondition(message: string): never {
  throw new HttpsError('failed-precondition', message);
}
