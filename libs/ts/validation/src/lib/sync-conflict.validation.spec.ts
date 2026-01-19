import { describe, it, expect } from 'vitest';
import { syncConflictResolutionValidation } from './sync-conflict.validation';
import type { ResolveSyncConflictInput } from '@maple/ts/domain';

describe('syncConflictResolutionValidation', () => {
  const validResolution: ResolveSyncConflictInput = {
    conflictId: 'conflict-123',
    resolution: 'use_local',
  };

  describe('valid data', () => {
    it('passes with all required fields', () => {
      const result = syncConflictResolutionValidation(validResolution);
      expect(result.isValid()).toBe(true);
    });

    it('passes with all valid resolution types', () => {
      const resolutions: ResolveSyncConflictInput['resolution'][] = [
        'use_local',
        'use_external',
        'ignored',
      ];
      resolutions.forEach((resolution) => {
        const result = syncConflictResolutionValidation({
          ...validResolution,
          resolution,
        });
        expect(result.hasErrors('resolution')).toBe(false);
      });
    });

    it('passes for manual resolution with notes', () => {
      const result = syncConflictResolutionValidation({
        conflictId: 'conflict-123',
        resolution: 'manual',
        notes: 'Merged changes manually by keeping local price and external description',
      });
      expect(result.isValid()).toBe(true);
    });
  });

  describe('conflictId field', () => {
    it('fails when conflictId is missing', () => {
      const result = syncConflictResolutionValidation({
        ...validResolution,
        conflictId: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('conflictId')).toContain(
        'Conflict ID is required'
      );
    });
  });

  describe('resolution field', () => {
    it('fails when resolution is missing', () => {
      const result = syncConflictResolutionValidation({
        ...validResolution,
        resolution: '' as 'use_local',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('resolution')).toContain('Resolution is required');
    });

    it('fails when resolution is invalid', () => {
      const result = syncConflictResolutionValidation({
        ...validResolution,
        resolution: 'invalid' as 'use_local',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('resolution')).toContain(
        'Resolution must be valid'
      );
    });
  });

  describe('notes field (conditional validation)', () => {
    it('fails when resolution is manual but notes are missing', () => {
      const result = syncConflictResolutionValidation({
        conflictId: 'conflict-123',
        resolution: 'manual',
        notes: undefined,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('notes')).toContain(
        'Manual resolutions should include notes'
      );
    });

    it('fails when resolution is manual but notes are empty', () => {
      const result = syncConflictResolutionValidation({
        conflictId: 'conflict-123',
        resolution: 'manual',
        notes: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('notes')).toContain(
        'Manual resolutions should include notes'
      );
    });

    it('passes when resolution is manual and notes are provided', () => {
      const result = syncConflictResolutionValidation({
        conflictId: 'conflict-123',
        resolution: 'manual',
        notes: 'Manually resolved by using local data',
      });
      expect(result.hasErrors('notes')).toBe(false);
    });

    it('passes when resolution is not manual and notes are missing', () => {
      const result = syncConflictResolutionValidation({
        conflictId: 'conflict-123',
        resolution: 'use_local',
        notes: undefined,
      });
      expect(result.hasErrors('notes')).toBe(false);
    });

    it('passes when resolution is not manual and notes are provided anyway', () => {
      const result = syncConflictResolutionValidation({
        conflictId: 'conflict-123',
        resolution: 'use_external',
        notes: 'Optional notes for non-manual resolution',
      });
      expect(result.hasErrors('notes')).toBe(false);
    });
  });

  describe('single-field validation', () => {
    it('only validates specified field', () => {
      const invalidData = {
        conflictId: '', // invalid
        resolution: '' as 'use_local', // invalid
      };

      const result = syncConflictResolutionValidation(invalidData, 'conflictId');
      expect(result.hasErrors('conflictId')).toBe(true);
      expect(result.hasErrors('resolution')).toBe(false);
    });

  });
});
