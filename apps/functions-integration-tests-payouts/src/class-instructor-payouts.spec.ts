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
import { monthKeyInStudioZone, zonedDateKey } from '@maple/ts/domain';
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
 * Statements are made on demand (#344): any finished session can go on one,
 * and `throughDate` leaves later sessions for the next. The functions read
 * the real clock, so the fixtures sit in the two months before the current
 * one, and the per-class scenario at the bottom a few days back.
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
/** The last day of the earlier month: a cutoff between the glass class's two sessions. */
const END_OF_EARLIER = zonedDateKey(
  new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 0, 18))
);

function daysAgo(n: number): Date {
  const now = new Date();
  // 16:00 UTC is late morning in the studio, so the studio day matches the UTC day.
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n, 16));
}

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

  const generate = (instructorId: string, throughDate?: string) =>
    call<GenerateClassInstructorStatementRequest, GenerateClassInstructorStatementResponse>(
      'generateClassInstructorStatement',
      { instructorId, ...(throughDate && { throughDate }) }
    );

  const preview = async (throughDate?: string) => {
    const result = await call<unknown, PreviewClassInstructorPayoutsResponse>(
      'previewClassInstructorPayouts',
      throughDate ? { throughDate } : {}
    );
    expect(result.status).toBe(200);
    return Object.fromEntries(result.data!.previews.map((p) => [p.instructorId, p]));
  };

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

  it('previews each instructor\'s share up to a day, split by session', async () => {
    const byId = await preview(END_OF_EARLIER);
    // Half of each glass registration (the other session is next month), 80% of that.
    expect(byId['inst-glass']).toMatchObject({
      grossCents: 15000,
      shareCents: 12000,
      totalOwedCents: 12000,
      owedCents: 12000,
      pendingStatements: [],
      paidThisYearCents: 0,
    });
    expect(byId['inst-glass'].classes[0]).toMatchObject({ headcount: 3, totalSessions: 2 });
    expect(byId['inst-weave']).toMatchObject({ grossCents: 6000, shareCents: 4800 });
    expect(byId['inst-norate']).toMatchObject({ missingRateConfig: true, shareCents: 0 });

    // With no cutoff, both glass sessions have finished and both are owed.
    const everything = await preview();
    expect(everything['inst-glass']).toMatchObject({ grossCents: 30000, totalOwedCents: 24000 });
  });

  it('refuses a bad through date and an instructor without a rate', async () => {
    const badDay = await generate('inst-glass', '2026-02-30');
    expect(badDay.status).toBe(400);

    const noRate = await generate('inst-norate');
    expect(noRate.status).toBe(400);
    expect(message(noRate)).toMatch(/no percentage pay rate/);
  });

  it('generates a statement once, and never twice', async () => {
    const first = await generate('inst-glass', END_OF_EARLIER);
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

    // The same sessions again: there is nothing left to claim.
    const again = await generate('inst-glass', END_OF_EARLIER);
    expect(again.status).toBe(400);
    expect(message(again)).toMatch(/Nothing unpaid/);

    // Generated but not yet marked paid still reads as owed.
    const byId = await preview(END_OF_EARLIER);
    expect(byId['inst-glass']).toMatchObject({
      totalOwedCents: 0,
      owedCents: 12000,
      pendingStatements: [{ id: first.data!.statement.id, totalOwedCents: 12000 }],
    });
  });

  it('lets exactly one of two racing generates through', async () => {
    const results = await Promise.all([generate('inst-weave'), generate('inst-weave')]);
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

    const regenerated = await generate('inst-weave');
    expect(regenerated.status).toBe(200);
    expect(regenerated.data?.statement.id).not.toBe(original.id);
    expect(regenerated.data?.statement.totalOwedCents).toBe(original.totalOwedCents);

    const voidAgain = await call('voidClassInstructorStatement', { id: original.id });
    expect(voidAgain.status).toBe(400);
  });

  it('puts the later session on the next statement, leaving the first alone', async () => {
    const later = await generate('inst-glass');
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
    const regenerated = await generate('inst-glass');
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

/**
 * #344, the case that started it. An instructor on 75% teaches two
 * one-session classes close together, each with eight paid seats at $65 and
 * one refunded seat. She is paid $390 three days after the first class and
 * $390 the day after the second. The portal must show $0 owed after each
 * payment and end with two paid statements, not one figure for the month.
 *
 * Runs after the suite above and leaves its data in place: these fixtures
 * use their own instructor and classes.
 */
describe('class-instructor payouts: paid per class', () => {
  let admin: TestUser;

  const FIRST_CLASS = daysAgo(10);
  const SECOND_CLASS = daysAgo(3);
  const FIRST_DAY = zonedDateKey(FIRST_CLASS);
  const FIRST_PAID_ON = zonedDateKey(daysAgo(7));
  const SECOND_PAID_ON = zonedDateKey(daysAgo(2));

  async function call<Req, Res>(name: string, data: Req) {
    return callFunction<Req, Res>({ functionName: route(name), data, idToken: admin.idToken });
  }
  const fern = async (throughDate?: string) => {
    const result = await call<unknown, PreviewClassInstructorPayoutsResponse>(
      'previewClassInstructorPayouts',
      throughDate ? { throughDate } : {}
    );
    expect(result.status).toBe(200);
    return result.data!.previews.find((p) => p.instructorId === 'inst-fern');
  };
  const generate = (throughDate?: string) =>
    call<GenerateClassInstructorStatementRequest, GenerateClassInstructorStatementResponse>(
      'generateClassInstructorStatement',
      { instructorId: 'inst-fern', ...(throughDate && { throughDate }) }
    );
  const markPaid = (id: string, paidOn: string, paymentReference: string) =>
    call<unknown, MarkClassInstructorStatementPaidResponse>('markClassInstructorStatementPaid', {
      id,
      paidOn,
      paymentMethod: 'payroll',
      paymentReference,
    });

  beforeAll(async () => {
    admin = await createTestUser('per-class-admin@example.com', ADMIN_USER.password);
    await setFirestoreDoc('admins', admin.uid, { userId: admin.uid, email: admin.email });

    await setFirestoreDoc('instructors', 'inst-fern', {
      name: 'Fern Alder',
      email: 'fern.alder@example.com',
      status: 'active',
      payRate: 0.75,
      payRateType: 'percentage',
      createdAt: created,
      updatedAt: created,
    });
    const klass = (name: string, at: Date) => ({
      name,
      description: 'A class.',
      instructorId: 'inst-fern',
      sessions: [{ dateTime: at }],
      firstSessionAt: at,
      durationMinutes: 120,
      capacity: 9,
      priceCents: 6500,
      skillLevel: 'all-levels',
      status: 'published',
      registrationCount: 8,
      createdAt: created,
      updatedAt: created,
    });
    await setFirestoreDoc('classes', 'class-wreath', klass('Evergreen Wreaths', FIRST_CLASS));
    await setFirestoreDoc('classes', 'class-ornament', klass('Felted Ornaments', SECOND_CLASS));

    for (const classId of ['class-wreath', 'class-ornament']) {
      for (let seat = 1; seat <= 8; seat++) {
        const id = `${classId}-reg-${seat}`;
        await setFirestoreDoc('registrations', id, registration(id, classId, 6500));
      }
      // The ninth seat was refunded before the class: it earns nothing.
      const refundedId = `${classId}-reg-refunded`;
      await setFirestoreDoc('registrations', refundedId, {
        ...registration(refundedId, classId, 6500),
        status: 'refunded',
        refundedAt: daysAgo(12),
        refundedAmountCents: 6890,
      });
    }
  });

  it('shows both classes owed before anything is recorded', async () => {
    const owed = await fern();
    expect(owed).toMatchObject({
      payRate: 0.75,
      grossCents: 104000,
      totalOwedCents: 78000,
      owedCents: 78000,
      paidThisYearCents: 0,
    });
    expect(owed!.classes.map((c) => c.headcount)).toEqual([8, 8]);
  });

  it('records the first payment on its own statement, leaving only the second class owed', async () => {
    // Up to the day of the first class: just that class.
    expect(await fern(FIRST_DAY)).toMatchObject({ totalOwedCents: 39000, owedCents: 39000 });

    const first = await generate(FIRST_DAY);
    expect(first.status).toBe(200);
    expect(first.data?.statement).toMatchObject({
      status: 'pending',
      payRate: 0.75,
      grossCents: 52000,
      totalOwedCents: 39000,
    });
    expect(first.data!.statement.classes.map((c) => c.className)).toEqual(['Evergreen Wreaths']);
    expect(first.data!.statement.entryIds).toHaveLength(8);

    const paid = await markPaid(first.data!.statement.id, FIRST_PAID_ON, 'PR-first-class');
    expect(paid.data?.statement).toMatchObject({ status: 'paid', paidOn: FIRST_PAID_ON });

    // As it stood after the first payment: nothing owed.
    expect(await fern(FIRST_DAY)).toMatchObject({
      totalOwedCents: 0,
      owedCents: 0,
      pendingStatements: [],
    });
    // And today: only the second class.
    const now = await fern();
    expect(now).toMatchObject({ totalOwedCents: 39000, owedCents: 39000 });
    expect(now!.classes.map((c) => c.className)).toEqual(['Felted Ornaments']);
  });

  it('records the second payment in the same month, and owes nothing', async () => {
    const second = await generate();
    expect(second.status).toBe(200);
    expect(second.data?.statement).toMatchObject({ grossCents: 52000, totalOwedCents: 39000 });
    expect(second.data!.statement.classes.map((c) => c.className)).toEqual(['Felted Ornaments']);
    // Not one session from the first statement is claimed again.
    expect(second.data!.statement.entryIds.every((id) => id.includes('class-ornament'))).toBe(true);

    // Generated, not yet marked paid: still owed.
    expect(await fern()).toMatchObject({ totalOwedCents: 0, owedCents: 39000 });

    await markPaid(second.data!.statement.id, SECOND_PAID_ON, 'PR-second-class');

    const settled = await fern();
    expect(settled).toMatchObject({ totalOwedCents: 0, owedCents: 0, pendingStatements: [], classes: [] });

    // Nothing left to put on a third statement.
    const third = await generate();
    expect(third.status).toBe(400);
    expect(message(third)).toMatch(/Nothing unpaid/);
  });

  it('keeps two paid statements, each with its own payment, and totals them for the year', async () => {
    const list = await call<unknown, GetClassInstructorStatementsResponse>(
      'getClassInstructorStatements',
      { instructorId: 'inst-fern' }
    );
    const statements = list.data!.statements;
    expect(statements).toHaveLength(2);
    expect(statements.every((s) => s.status === 'paid' && s.totalOwedCents === 39000)).toBe(true);
    expect(statements.map((s) => s.paidOn).sort()).toEqual([FIRST_PAID_ON, SECOND_PAID_ON].sort());
    expect(statements.map((s) => s.paymentReference).sort()).toEqual([
      'PR-first-class',
      'PR-second-class',
    ]);

    // $780 in all, whichever calendar years the two paid days fall in.
    const byYear = list.data!.paidByYearByInstructor['inst-fern'];
    expect(Object.values(byYear).reduce((total, cents) => total + cents, 0)).toBe(78000);
  });

  it('takes a refund after a payout off the next statement', async () => {
    // A seat from the first, already-paid class is refunded afterwards.
    await setFirestoreDoc('registrations', 'class-wreath-reg-1', {
      ...registration('class-wreath-reg-1', 'class-wreath', 6500),
      status: 'refunded',
      refundedAt: new Date(),
      refundedAmountCents: 6890,
    });
    const owed = await fern();
    // $65 × 75% = $48.75 comes back off whatever is paid next.
    expect(owed).toMatchObject({ adjustmentsCents: -4875, totalOwedCents: -4875 });

    // On its own it cannot be a statement; it waits for the next class.
    const alone = await generate();
    expect(alone.status).toBe(400);
    expect(message(alone)).toMatch(/carry to the next statement/);
  });
});

