/**
 * Unit tests for the pure detection logic only — the Firestore trigger
 * itself is exercised by integration tests against the emulator.
 */
import { describe, it, expect } from 'vitest';
import { isSpotOpeningChange } from './notify-waitlist-on-spot-open';

interface FakeSnapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

function snap(data: Record<string, unknown> | null): FakeSnapshot {
  return {
    exists: data !== null,
    data: () => (data === null ? undefined : data),
  };
}

describe('isSpotOpeningChange', () => {
  it('detects active → inactive status update as a spot opening', () => {
    const before = snap({ status: 'confirmed', classId: 'c1' });
    const after = snap({ status: 'cancelled', classId: 'c1' });
    expect(isSpotOpeningChange(before as never, after as never)).toBe(true);
  });

  it('detects active → refunded as a spot opening', () => {
    const before = snap({ status: 'pending', classId: 'c1' });
    const after = snap({ status: 'refunded', classId: 'c1' });
    expect(isSpotOpeningChange(before as never, after as never)).toBe(true);
  });

  it('detects deletion of an active registration as a spot opening', () => {
    const before = snap({ status: 'confirmed', classId: 'c1' });
    const after = snap(null);
    expect(isSpotOpeningChange(before as never, after as never)).toBe(true);
  });

  it('does not fire on initial creation (no spot to open)', () => {
    const before = snap(null);
    const after = snap({ status: 'pending', classId: 'c1' });
    expect(isSpotOpeningChange(before as never, after as never)).toBe(false);
  });

  it('does not fire on pending → confirmed (still active)', () => {
    const before = snap({ status: 'pending', classId: 'c1' });
    const after = snap({ status: 'confirmed', classId: 'c1' });
    expect(isSpotOpeningChange(before as never, after as never)).toBe(false);
  });

  it('does not fire when both sides are inactive (e.g. cancelled → refunded)', () => {
    const before = snap({ status: 'cancelled', classId: 'c1' });
    const after = snap({ status: 'refunded', classId: 'c1' });
    expect(isSpotOpeningChange(before as never, after as never)).toBe(false);
  });

  it('does not fire when deleting an already-inactive registration', () => {
    const before = snap({ status: 'cancelled', classId: 'c1' });
    const after = snap(null);
    expect(isSpotOpeningChange(before as never, after as never)).toBe(false);
  });
});
