/**
 * Role access matrix — integration proof of the scoped-roles enforcement
 * (epic #617, re-scope #615).
 *
 * Table-driven: each case is (caller role, function, expected status), so
 * this spec IS the access matrix. Samples 2-4 representative functions
 * per group rather than every callable — the requiringRole change is
 * uniform, and the callable-coverage analyzer (#620) will guarantee no
 * endpoint is left undeclared.
 *
 * Callers are seeded directly into Firestore (admins/{uid} and
 * userRoles/{uid}) — the grant/revoke round trip is covered in
 * utility-functions.spec.ts.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';

type CallerKey = 'admin' | 'stephanie' | 'nathan' | 'noRole';

interface MatrixCase {
  /** Which seeded user makes the call */
  as: CallerKey;
  functionName: string;
  data?: Record<string, unknown>;
  /** 200 = allowed; 403 = forbidden by the role check */
  expect: 200 | 403;
}

const ROOM_SCHEDULE_REQ = {
  room: 'spruce',
  start: '2026-07-01T00:00:00.000Z',
  end: '2026-07-31T00:00:00.000Z',
};

const CASES: MatrixCase[] = [
  // ── Stephanie: mt-teacher ─────────────────────────────────────────
  { as: 'stephanie', functionName: 'getMusicTogetherSections', expect: 200 },
  { as: 'stephanie', functionName: 'getMusicTogetherSemesters', expect: 200 },
  { as: 'stephanie', functionName: 'getMusicTogetherInterest', expect: 200 },
  { as: 'stephanie', functionName: 'getCalendarEvents', expect: 200 },
  {
    as: 'stephanie',
    functionName: 'getRoomSchedule',
    data: ROOM_SCHEDULE_REQ,
    expect: 200,
  },
  { as: 'stephanie', functionName: 'getProducts', expect: 403 },
  { as: 'stephanie', functionName: 'getClasses', expect: 403 },
  { as: 'stephanie', functionName: 'getRegistrations', expect: 403 },
  { as: 'stephanie', functionName: 'getStudents', expect: 403 },
  // getStudent (singular) was auth-only until #620; now admin + lesson-teacher.
  { as: 'stephanie', functionName: 'getStudent', expect: 403 },
  // Student mutations are now [Admin, LessonTeacher] (#617) — mt-teacher denied.
  { as: 'stephanie', functionName: 'createStudent', expect: 403 },
  { as: 'stephanie', functionName: 'updateStudent', expect: 403 },
  { as: 'stephanie', functionName: 'getLessons', expect: 403 },
  { as: 'stephanie', functionName: 'listUsers', expect: 403 },
  { as: 'stephanie', functionName: 'createClass', expect: 403 },
  { as: 'stephanie', functionName: 'getSyncConflictSummary', expect: 403 },

  // ── Nathan: clerk + lesson-teacher (multi-role union) ─────────────
  { as: 'nathan', functionName: 'getProducts', expect: 200 },
  { as: 'nathan', functionName: 'getCategories', expect: 200 },
  { as: 'nathan', functionName: 'getSales', expect: 200 },
  { as: 'nathan', functionName: 'getClasses', expect: 200 },
  { as: 'nathan', functionName: 'getRegistrations', expect: 200 },
  { as: 'nathan', functionName: 'getClassWaitlistCounts', expect: 200 },
  { as: 'nathan', functionName: 'getLessons', expect: 200 },
  { as: 'nathan', functionName: 'getStudents', expect: 200 },
  { as: 'nathan', functionName: 'getInvoices', expect: 200 },
  { as: 'nathan', functionName: 'getCalendarEvents', expect: 200 },
  { as: 'nathan', functionName: 'getMusicTogetherSections', expect: 403 },
  { as: 'nathan', functionName: 'getMusicTogetherRoster', expect: 403 },
  { as: 'nathan', functionName: 'createClass', expect: 403 },
  { as: 'nathan', functionName: 'updateClass', expect: 403 },
  { as: 'nathan', functionName: 'getTeacherPayouts', expect: 403 },
  { as: 'nathan', functionName: 'getArtists', expect: 403 },
  // getArtist (singular) was auth-only until #620; now admin-only like getArtists.
  { as: 'nathan', functionName: 'getArtist', expect: 403 },
  { as: 'nathan', functionName: 'listUsers', expect: 403 },
  { as: 'nathan', functionName: 'grantRole', expect: 403 },
  { as: 'nathan', functionName: 'getDiscounts', expect: 403 },

  // ── Admin: unchanged, everything passes (spot checks per group) ───
  { as: 'admin', functionName: 'getMusicTogetherSections', expect: 200 },
  { as: 'admin', functionName: 'getProducts', expect: 200 },
  { as: 'admin', functionName: 'getLessons', expect: 200 },
  { as: 'admin', functionName: 'getCalendarEvents', expect: 200 },
  { as: 'admin', functionName: 'listUsers', expect: 200 },
  { as: 'admin', functionName: 'getArtists', expect: 200 },

  // ── No roles at all: nothing opens ────────────────────────────────
  { as: 'noRole', functionName: 'getCalendarEvents', expect: 403 },
  { as: 'noRole', functionName: 'getProducts', expect: 403 },
  { as: 'noRole', functionName: 'getMusicTogetherSections', expect: 403 },
];

describe('Role access matrix (scoped-roles enforcement)', () => {
  const users = {} as Record<CallerKey, TestUser>;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    users.admin = await createTestUser(
      'matrix-admin@test.maple',
      'test-password-123!'
    );
    users.stephanie = await createTestUser(
      'matrix-stephanie@test.maple',
      'test-password-123!'
    );
    users.nathan = await createTestUser(
      'matrix-nathan@test.maple',
      'test-password-123!'
    );
    users.noRole = await createTestUser(
      'matrix-norole@test.maple',
      'test-password-123!'
    );

    await setFirestoreDoc('admins', users.admin.uid, {
      userId: users.admin.uid,
      email: users.admin.email,
    });
    await setFirestoreDoc('userRoles', users.stephanie.uid, {
      roles: ['mt-teacher'],
      grantedBy: users.admin.uid,
    });
    await setFirestoreDoc('userRoles', users.nathan.uid, {
      roles: ['clerk', 'lesson-teacher'],
      grantedBy: users.admin.uid,
    });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it.each(CASES.map((c) => [c.as, c.functionName, c.expect, c] as const))(
    '%s -> %s expects %d',
    async (_as, _fn, _status, c) => {
      const result = await callFunction({
        functionName: c.functionName,
        idToken: users[c.as].idToken,
        data: c.data ?? {},
      });

      expect(result.status).toBe(c.expect);
    }
  );
});
