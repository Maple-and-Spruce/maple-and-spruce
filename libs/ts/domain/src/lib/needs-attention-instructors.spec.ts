import { describe, it, expect } from 'vitest';
import {
  instructorEditHref,
  instructorsNotReadyToTeach,
} from './needs-attention';
import type { Class } from './class';
import type { Instructor } from './instructor';

const NOW = new Date('2026-09-10T12:00:00Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function instructor(id: string, overrides: Partial<Instructor> = {}): Instructor {
  return {
    id,
    name: `Instructor ${id}`,
    email: `${id}@example.com`,
    status: 'active',
    isContractor: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function classFor(
  instructorId: string | undefined,
  sessions: Date[],
  status: Class['status'] = 'published'
): Class {
  return {
    id: `class-${instructorId}-${sessions[0]?.getTime()}`,
    name: 'Stained Glass Basics',
    instructorId,
    status,
    sessions: sessions.map((dateTime) => ({ dateTime })),
  } as unknown as Class;
}

const cleared = {
  contractorAgreement: { signedOn: '2026-09-01' },
  backgroundCheck: { clearedOn: '2026-09-02' },
  paymentSetup: { completedOn: '2026-09-03', method: 'w9-on-file' as const },
};

describe('instructorsNotReadyToTeach', () => {
  it('flags an uncleared contractor with an upcoming class', () => {
    const result = instructorsNotReadyToTeach(
      [instructor('a', { readiness: { backgroundCheck: { clearedOn: '2026-09-02' } } })],
      [classFor('a', [inDays(3)])],
      NOW
    );

    expect(result).toHaveLength(1);
    expect(result[0].missing).toEqual(['contractor-agreement', 'payment-setup']);
    expect(result[0].nextSessionAt).toEqual(inDays(3));
  });

  it('ignores cleared contractors and non-contractors', () => {
    const result = instructorsNotReadyToTeach(
      [
        instructor('ready', { readiness: cleared }),
        instructor('staff', { isContractor: undefined }),
      ],
      [classFor('ready', [inDays(1)]), classFor('staff', [inDays(1)])],
      NOW
    );

    expect(result).toEqual([]);
  });

  it('ignores an instructor with nothing upcoming', () => {
    const result = instructorsNotReadyToTeach(
      [instructor('a')],
      [classFor('a', [inDays(-2)])],
      NOW
    );

    expect(result).toEqual([]);
  });

  it('does not count cancelled or completed classes as coming up', () => {
    const result = instructorsNotReadyToTeach(
      [instructor('a')],
      [classFor('a', [inDays(2)], 'cancelled'), classFor('a', [inDays(2)], 'completed')],
      NOW
    );

    expect(result).toEqual([]);
  });

  it('counts a draft class, since someone means to run it', () => {
    const result = instructorsNotReadyToTeach(
      [instructor('a')],
      [classFor('a', [inDays(5)], 'draft')],
      NOW
    );

    expect(result).toHaveLength(1);
  });

  it('ignores inactive instructors', () => {
    const result = instructorsNotReadyToTeach(
      [instructor('a', { status: 'inactive' })],
      [classFor('a', [inDays(2)])],
      NOW
    );

    expect(result).toEqual([]);
  });

  it('uses the earliest upcoming session across classes and sorts soonest first', () => {
    const result = instructorsNotReadyToTeach(
      [instructor('later'), instructor('sooner')],
      [
        classFor('later', [inDays(-1), inDays(9)]),
        classFor('later', [inDays(6)]),
        classFor('sooner', [inDays(2)]),
        classFor(undefined, [inDays(1)]),
      ],
      NOW
    );

    expect(result.map((r) => r.instructor.id)).toEqual(['sooner', 'later']);
    expect(result[1].nextSessionAt).toEqual(inDays(6));
  });

  it('accepts a session time that arrived as a string over the wire', () => {
    const c = classFor('a', [inDays(2)]);
    (c.sessions[0] as unknown as { dateTime: string }).dateTime = inDays(2).toISOString();

    expect(instructorsNotReadyToTeach([instructor('a')], [c], NOW)).toHaveLength(1);
  });
});

describe('instructorEditHref', () => {
  it('points at the instructors page with the edit dialog open', () => {
    expect(instructorEditHref('abc')).toBe('/instructors?edit=abc');
  });
});
