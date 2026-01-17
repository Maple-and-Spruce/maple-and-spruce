/**
 * Sync Conflict validation suite
 *
 * Vest validation for sync conflict resolution.
 * @see https://vestjs.dev/
 */
import { create, test, enforce, only } from 'vest';
import type { ResolveSyncConflictInput } from '@maple/ts/domain';

const VALID_RESOLUTIONS = [
  'use_local',
  'use_external',
  'manual',
  'ignored',
] as const;

/**
 * Validate sync conflict resolution input
 *
 * @param data - Resolution data to validate
 * @param field - Optional field to validate
 *
 * @example
 * const result = syncConflictResolutionValidation(formData);
 * if (result.isValid()) {
 *   // Resolve conflict
 * }
 */
export const syncConflictResolutionValidation = create(
  (data: Partial<ResolveSyncConflictInput>, field?: string) => {
    only(field);

    test('conflictId', 'Conflict ID is required', () => {
      enforce(data.conflictId).isNotBlank();
    });

    test('resolution', 'Resolution is required', () => {
      enforce(data.resolution).isNotBlank();
    });

    test('resolution', 'Resolution must be valid', () => {
      if (data.resolution) {
        enforce(data.resolution).inside(VALID_RESOLUTIONS);
      }
    });

    // Manual resolutions should include notes explaining what was done
    test('notes', 'Manual resolutions should include notes', () => {
      if (data.resolution === 'manual' && !data.notes) {
        enforce(data.notes).isNotBlank();
      }
    });
  }
);
