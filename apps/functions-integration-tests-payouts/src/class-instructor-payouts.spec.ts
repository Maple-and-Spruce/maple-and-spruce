import {
  ADMIN_USER,
  NON_ADMIN_USER,
  callFunction,
  clearAuthEmulator,
  clearFirestoreEmulator,
  createTestUser,
  setFirestoreDoc,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import { monthKeyInStudioZone } from '@maple/ts/domain';
import type {
  GenerateClassInstructorStatementRequest,
  GenerateClassInstructorStatementResponse,
  GetClassInstructorStatementResponse,
  GetClassInstructorStatementsResponse,
  MarkClassInstructorStatementPaidResponse,
  PreviewClassInstructorPayoutsResponse,
  VoidClassInstructorStatementResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Class-instructor statements, end to end against the emulator: the ledger
 * transaction is the thing a unit test can't prove, so this suite checks
 * that nothing can be paid twice — not by generating twice, not by two
 * generates racing, and not by voiding and regenerating — and that a refund
 * after payment comes off the next statement.
 *
 * The functions read the real clock and only generate months that are over,
 * so the fixtures sit in the two months before the current one.
 */

const route = (name: string) => `payouts/${name}`;

/** The error body is `{ message, status }`, typed loosely by the http client. */
function message(result: { error?: unknown }): string {
  return (result.error as { message?: string } | undefined)?.message ?? '';
}

function monthsAgo(n: number, day = 15): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, day, 18));
}

const EARLIER = monthKeyInStudioZone(monthsAgo(2));
const LATER = monthKeyInStudioZone(monthsAgo(1));

const created = new Date();
/** Mid-year, so the "paid this year" total is stable whenever the suite runs. */
const PAID_ON = `${new Date().getUTCFullYear()}-06-15`;

function registration(id: string, classId: string, subtotalCents: number, quantity = 1) {
  return {
    classId,
    customerEmail: `${id}@example.com`,
    customerName: 'Test Student',
    quantity,
    pricePaidCents: Math.round(subtotalCents * 1.06),
    subtotalCents,
    taxAmountCents: Math.round(subtotalCents * 0.06),
    taxRatePercent: 6,
    status: 'confirmed',
    source: 'web',
    createdAt: created,
    updatedAt: created,
  };
}

describe('class-instructor payouts', () => {
  let admin: TestUser;
  let nonAdmin: TestUser;

  async function call<Req, Res>(name: string, data: Req, user: TestUser | null = admin) {
    return callFunction<Req, Res>({
      functionName: route(name),
      data,
      idToken: user?.idToken,
    });
  }

  const generate = (instructorId: string, month: string) =>
    call<GenerateClassInstructorStatementRequest, GenerateClassInstructorStatementResponse>(
      'generateClassInstructorStatement',
      { instructorId, month }
    );

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    nonAdmin = await createTestUser(NON_ADMIN_USER.email, NON_ADMIN_USER.password);
    await setFirestoreDoc('admins', admin.uid, { userId: admin.uid, email: admin.email });

    const instructor = (name: string, payRate: number | null, payRateType: string | null) => ({
      name,
      email: `${name.toLowerCase().replace(/ /g, '.')}@example.com`,
      status: 'active',
      payRate,
      payRateType,
      createdAt: created,
      updatedAt: created,
    });
    await setFirestoreDoc('instructors', 'inst-glass', instructor('Glass Instructor', 0.8, 'percentage'));
    await setFirestoreDoc('instructors', 'inst-weave', instructor('Weaving Instructor', 0.8, 'percentage'));
    await setFirestoreDoc('instructors', 'inst-norate', instructor('Unrated Instructor', null, null));

    const klass = (name: string, instructorId: string, sessions: Date[]) => ({
      name,
      description: 'A class.',
      instructorId,
      sessions: sessions.map((dateTime) => ({ dateTime })),
      firstSessionAt: sessions[0],
      durationMinutes: 120,
      capacity: 8,
      priceCents: 10000,
      skillLevel: 'all-levels',
      status: 'published',
      registrationCount: 0,
      createdAt: created,
      updatedAt: created,
    });
    // Two sessions, one in each month: half the revenue lands on each statement.
    await setFirestoreDoc('classes', 'class-glass', klass('Stained Glass Series', 'inst-glass', [monthsAgo(2), monthsAgo(1)]));
    await setFirestoreDoc('classes', 'class-weave', klass('Weaving Workshop', 'inst-weave', [monthsAgo(2, 10)]));
    await setFirestoreDoc('classes', 'class-norate', klass('Basketry', 'inst-norate', [monthsAgo(2, 12)]));

    await setFirestoreDoc('registrations', 'reg-g1', registration('reg-g1', 'class-glass', 10000));
    await setFirestoreDoc('registrations', 'reg-g2', registration('reg-g2', 'class-glass', 20000, 2));
    await setFirestoreDoc('registrations', 'reg-g-pending', {
      ...registration('reg-g-pending', 'class-glass', 10000),
      status: 'pending',
    });
    await setFirestoreDoc('registrations', 'reg-w1', registration('reg-w1', 'class-weave', 6000));
    await setFirestoreDoc('registrations', 'reg-n1', registration('reg-n1', 'class-norate', 5000));
  });

  it('gates every route to admins', async () => {
    const unauthenticated = await call('getClassInstructorStatements', {}, null);
    expect(unauthenticated.status).toBe(401);
    for (const name of [
      'previewClassInstructorPayouts',
      'generateClassInstructorStatement',
      'getClassInstructorStatements',
      'getClassInstructorStatement',
      'markClassInstructorStatementPaid',
      'voidClassInstructorStatement',
    ]) {
      const result = await call(name, {}, nonAdmin);
      expect(result.status, name).toBe(403);
    }
  });

  it('previews each instructor\'s share of the month, split by session', async () => {
    const result = await call<unknown, PreviewClassInstructorPayoutsResponse>(
      'previewClassInstructorPayouts',
      { month: EARLIER }
    );
    expect(result.status).toBe(200);
    expect(result.data?.monthIsOver).toBe(true);

    const byId = Object.fromEntries(result.data!.previews.map((p) => [p.instructorId, p]));
    // Half of each glass registration (the other session is next month), 80% of that.
    expect(byId['inst-glass']).toMatchObject({ grossCents: 15000, shareCents: 12000, totalOwedCents: 12000 });
    expect(byId['inst-glass'].classes[0]).toMatchObject({ headcount: 3, totalSessions: 2 });
    expect(byId['inst-weave']).toMatchObject({ grossCents: 6000, shareCents: 4800 });
    expect(byId['inst-norate']).toMatchObject({ missingRateConfig: true, shareCents: 0 });
  });

  it('refuses the current month and an instructor without a rate', async () => {
    const current = await generate('inst-glass', monthKeyInStudioZone(new Date()));
    expect(current.status).toBe(400);
    expect(message(current)).toMatch(/isn't over yet/);

    const noRate = await generate('inst-norate', EARLIER);
    expect(noRate.status).toBe(400);
    expect(message(noRate)).toMatch(/no percentage pay rate/);
  });

  it('generates a statement once, and never twice', async () => {
    const first = await generate('inst-glass', EARLIER);
    expect(first.status).toBe(200);
    expect(first.data?.statement).toMatchObject({
      instructorId: 'inst-glass',
      month: EARLIER,
      status: 'pending',
      payRate: 0.8,
      grossCents: 15000,
      totalOwedCents: 12000,
    });
    expect(first.data?.statement.entryIds.sort()).toEqual([
      'class-session_reg-g1_0',
      'class-session_reg-g2_0',
    ]);

    const again = await generate('inst-glass', EARLIER);
    expect(again.status).toBe(400);
    expect(message(again)).toMatch(/already exists/);
  });

  it('lets exactly one of two racing generates through', async () => {
    const results = await Promise.all([generate('inst-weave', EARLIER), generate('inst-weave', EARLIER)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);

    const list = await call<unknown, GetClassInstructorStatementsResponse>(
      'getClassInstructorStatements',
      { instructorId: 'inst-weave' }
    );
    expect(list.data?.statements).toHaveLength(1);
  });

  it('releases a voided statement\'s sessions to be generated again, identically', async () => {
    const list = await call<unknown, GetClassInstructorStatementsResponse>(
      'getClassInstructorStatements',
      { instructorId: 'inst-weave', month: EARLIER }
    );
    const original = list.data!.statements[0];

    const voided = await call<unknown, VoidClassInstructorStatementResponse>(
      'voidClassInstructorStatement',
      { id: original.id }
    );
    expect(voided.data?.statement.status).toBe('void');

    const regenerated = await generate('inst-weave', EARLIER);
    expect(regenerated.status).toBe(200);
    expect(regenerated.data?.statement.id).not.toBe(original.id);
    expect(regenerated.data?.statement.totalOwedCents).toBe(original.totalOwedCents);

    const voidAgain = await call('voidClassInstructorStatement', { id: original.id });
    expect(voidAgain.status).toBe(400);
  });

  it('puts the next month\'s session on the next statement', async () => {
    const later = await generate('inst-glass', LATER);
    expect(later.status).toBe(200);
    expect(later.data?.statement).toMatchObject({ grossCents: 15000, shareCents: 12000 });
    expect(later.data?.statement.entryIds.sort()).toEqual([
      'class-session_reg-g1_1',
      'class-session_reg-g2_1',
    ]);
  });

  it('takes a refund after payment off the next statement', async () => {
    const statements = await call<unknown, GetClassInstructorStatementsResponse>(
      'getClassInstructorStatements',
      { instructorId: 'inst-glass' }
    );
    const earlier = statements.data!.statements.find((s) => s.month === EARLIER)!;
    const later = statements.data!.statements.find((s) => s.month === LATER)!;

    // David pays the earlier statement.
    const paid = await call<unknown, MarkClassInstructorStatementPaidResponse>(
      'markClassInstructorStatementPaid',
      { id: earlier.id, paidOn: PAID_ON, paymentMethod: 'payroll', paymentReference: 'PR-1001' }
    );
    expect(paid.data?.statement).toMatchObject({
      status: 'paid',
      paidOn: PAID_ON,
      paymentMethod: 'payroll',
      paymentReference: 'PR-1001',
    });
    const payTwice = await call('markClassInstructorStatementPaid', {
      id: earlier.id,
      paidOn: PAID_ON,
      paymentMethod: 'other',
    });
    expect(payTwice.status).toBe(400);

    // Then reg-g1 ($100, $80 share, $40 of it already paid) is refunded.
    await setFirestoreDoc('registrations', 'reg-g1', {
      ...registration('reg-g1', 'class-glass', 10000),
      status: 'refunded',
      refundedAt: new Date(),
      refundedAmountCents: 10600,
    });

    // The still-pending later statement now reads as stale; the paid one never does.
    const stale = await call<unknown, GetClassInstructorStatementResponse>(
      'getClassInstructorStatement',
      { id: later.id }
    );
    expect(stale.data?.staleReasons).toEqual([
      expect.objectContaining({ kind: 'registration-no-longer-earns', registrationId: 'reg-g1' }),
    ]);
    const paidView = await call<unknown, GetClassInstructorStatementResponse>(
      'getClassInstructorStatement',
      { id: earlier.id }
    );
    expect(paidView.data?.staleReasons).toEqual([]);

    // Void and regenerate: reg-g1's later session drops out, and the $40
    // already paid for it comes back off as an adjustment.
    await call('voidClassInstructorStatement', { id: later.id });
    const regenerated = await generate('inst-glass', LATER);
    expect(regenerated.status).toBe(200);
    expect(regenerated.data?.statement).toMatchObject({
      grossCents: 10000,
      shareCents: 8000,
      adjustmentsCents: -4000,
      totalOwedCents: 4000,
    });
    expect(regenerated.data?.statement.adjustments).toEqual([
      expect.objectContaining({ kind: 'refund', registrationId: 'reg-g1', shareCents: -4000 }),
    ]);
    expect(regenerated.data?.statement.entryIds.sort()).toEqual([
      'class-refund_reg-g1',
      'class-session_reg-g2_1',
    ]);

    // The year-to-date figure counts only what was actually paid.
    const list = await call<unknown, GetClassInstructorStatementsResponse>(
      'getClassInstructorStatements',
      {}
    );
    expect(list.data?.paidThisYearByInstructor).toEqual({ 'inst-glass': 12000 });
  });
});
