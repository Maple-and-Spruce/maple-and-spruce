import { describe, expect, it } from 'vitest';
import { isAlreadyExists } from './already-exists';

/**
 * One case per transport, because the bug both #100 and #117 shipped was a
 * guard that knew only one of them. The emulator speaks gRPC, so the suite was
 * green on the shape that was never broken.
 */
describe('recognising a collision with a document that already exists', () => {
  it('sees the gRPC status code', () => {
    expect(isAlreadyExists({ code: 6, message: 'already exists' })).toBe(true);
  });

  it('sees the REST 409, which is what dev and prod actually send', () => {
    // Verbatim shape from dev: createStudentLessonSchedule died on this (#117).
    expect(
      isAlreadyExists({
        code: 409,
        status: 'ALREADY_EXISTS',
        message:
          'Document already exists: projects/p/databases/(default)/documents/lessons/sched-abc-2026-09-28',
      })
    ).toBe(true);
  });

  it('sees the client SDK string code', () => {
    expect(isAlreadyExists({ code: 'already-exists' })).toBe(true);
  });

  it('sees a status of ALREADY_EXISTS even with no code at all', () => {
    expect(isAlreadyExists({ status: 'ALREADY_EXISTS' })).toBe(true);
  });

  it('falls back to the message, for a shape nobody predicted', () => {
    expect(
      isAlreadyExists(new Error('5 ALREADY_EXISTS: entity already exists'))
    ).toBe(true);
  });

  it('does not swallow a permission error', () => {
    // The cost of a false positive here is a write silently reported as
    // "already there", which is worse than the throw it replaced.
    expect(isAlreadyExists({ code: 7, message: 'PERMISSION_DENIED' })).toBe(
      false
    );
  });

  it('does not swallow some other 4xx', () => {
    expect(isAlreadyExists({ code: 400, message: 'INVALID_ARGUMENT' })).toBe(
      false
    );
  });

  it.each([null, undefined, 'ALREADY_EXISTS', 6])(
    'is false for %p, which is not an error object',
    (value) => {
      expect(isAlreadyExists(value)).toBe(false);
    }
  );
});
