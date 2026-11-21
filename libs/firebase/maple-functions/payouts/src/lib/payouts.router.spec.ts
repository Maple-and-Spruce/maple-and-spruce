import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for the payouts router's class-instructor routes. The money math
 * lives (and is tested) in `class-instructor-payout.spec.ts`; the ledger
 * transaction is exercised against the emulator in
 * `apps/functions-integration-tests-payouts`. Here: the wiring — what each
 * route loads, when it refuses, and how repository outcomes become errors.
 */

const mocks = vi.hoisted(() => ({
  instructorFindAll: vi.fn(),
  instructorFindById: vi.fn(),
  classFindAll: vi.fn(),
  classFindById: vi.fn(),
  registrationFindByClassId: vi.fn(),
  registrationFindAll: vi.fn(),
  ledgerFindByRegistrationIds: vi.fn(),
  statementFindAll: vi.fn(),
  statementFindById: vi.fn(),
  statementFindByIds: vi.fn(),
  statementGenerate: vi.fn(),
  statementMarkPaid: vi.fn(),
  statementVoid: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  const fail = (message: string): never => {
    throw new Error(message);
  };
  const chain = {
    requiringRole: () => chain,
    validating: (suite: (d: unknown) => { hasErrors: () => boolean; getErrors: () => unknown }) => ({
      asRoute: (handler: (d: unknown) => unknown) => async (data: unknown) => {
        const result = suite(data);
        if (result.hasErrors()) throw new Error(`invalid: ${JSON.stringify(result.getErrors())}`);
        return handler(data);
      },
    }),
    asRoute: (handler: unknown) => handler,
  };
  return {
    Functions: { endpoint: chain, router: (_name: string, routes: unknown) => routes },
    Role: { Admin: 'admin' },
    throwFailedPrecondition: fail,
    throwInvalidArgument: fail,
    throwNotFound: (entity: string, id: string) => fail(`${entity} ${id} not found`),
  };
});

vi.mock('@maple/firebase/database', () => ({
  InstructorRepository: { findAll: mocks.instructorFindAll, findById: mocks.instructorFindById },
  ClassRepository: { findAll: mocks.classFindAll, findById: mocks.classFindById },
  RegistrationRepository: {
    findByClassId: mocks.registrationFindByClassId,
    findAll: mocks.registrationFindAll,
  },
  PayoutLedgerRepository: { findByRegistrationIds: mocks.ledgerFindByRegistrationIds },
  ClassInstructorStatementRepository: {
    findAll: mocks.statementFindAll,
    findById: mocks.statementFindById,
    findByIds: mocks.statementFindByIds,
    generate: mocks.statementGenerate,
    markPaid: mocks.statementMarkPaid,
    void: mocks.statementVoid,
  },
}));

import { payouts } from './payouts.router';
import { generateArtistPayout, getArtistPayouts, markArtistPayoutPaid } from './artist-payouts';
import { getTeacherPayouts } from './teacher-payouts';

type Route = (data: unknown) => Promise<Record<string, unknown>>;
const routes = payouts as unknown as Record<string, Route>;

const created = new Date('2026-09-01T12:00:00Z');
const instructor = {
  id: 'inst-1',
  name: 'Test Instructor',
  email: 'instructor@example.com',
  status: 'active',
  payRateType: 'percentage',
  payRate: 0.8,
  createdAt: created,
  updatedAt: created,
};
const octoberClass = {
  id: 'class-1',
  name: 'Stained Glass Basics',
  instructorId: 'inst-1',
  sessions: [{ dateTime: new Date('2026-10-07T22:00:00Z') }],
  durationMinutes: 120,
  status: 'published',
};
const registration = {
  id: 'reg-1',
  classId: 'class-1',
  quantity: 1,
  subtotalCents: 5000,
  pricePaidCents: 5300,
  status: 'confirmed',
};
const statement = {
  id: 'stmt-1',
  instructorId: 'inst-1',
  instructorName: 'Test Instructor',
  month: '2026-10',
  status: 'pending',
  totalOwedCents: 4000,
  createdAt: new Date('2026-10-09T12:00:00Z'),
  classes: [
    {
      classId: 'class-1',
      className: 'Stained Glass Basics',
      totalSessions: 1,
      sessions: [{ index: 0, at: new Date('2026-10-07T22:00:00Z') }],
      includesEarlierMonths: false,
      headcount: 1,
      registrationIds: ['reg-1'],
      grossCents: 5000,
      shareCents: 4000,
    },
  ],
};

describe('payouts router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T15:00:00Z'));
    mocks.instructorFindAll.mockResolvedValue([instructor]);
    mocks.instructorFindById.mockResolvedValue(instructor);
    mocks.classFindAll.mockResolvedValue([octoberClass]);
    mocks.classFindById.mockResolvedValue(octoberClass);
    mocks.registrationFindByClassId.mockResolvedValue([registration]);
    mocks.registrationFindAll.mockResolvedValue([]);
    mocks.ledgerFindByRegistrationIds.mockResolvedValue([]);
    mocks.statementFindAll.mockResolvedValue([]);
    mocks.statementFindByIds.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('previewClassInstructorPayouts', () => {
    const preview = async (data: unknown = {}) =>
      (await routes.previewClassInstructorPayouts(data))['previews'] as Record<string, unknown>[];

    it('rejects a malformed through date', async () => {
      await expect(routes.previewClassInstructorPayouts({ throughDate: 'October' })).rejects.toThrow(
        'YYYY-MM-DD'
      );
      await expect(
        routes.previewClassInstructorPayouts({ throughDate: '2026-02-30' })
      ).rejects.toThrow('YYYY-MM-DD');
    });

    it('returns each teaching instructor\'s unclaimed earnings, without the ledger entries', async () => {
      const result = await routes.previewClassInstructorPayouts({});
      expect(result).not.toHaveProperty('throughDate');
      const previews = result['previews'] as Record<string, unknown>[];
      expect(previews).toHaveLength(1);
      expect(previews[0]).toMatchObject({
        instructorId: 'inst-1',
        // A label: the month of the latest session covered, not the month it was asked in.
        month: '2026-10',
        grossCents: 5000,
        shareCents: 4000,
        totalOwedCents: 4000,
        pendingStatements: [],
        owedCents: 4000,
        paidThisYearCents: 0,
      });
      expect(previews[0]).not.toHaveProperty('entries');
    });

    it('needs no finished month: a class that ended this month is owed now', async () => {
      // "Now" is Nov 5; this class was Nov 3.
      mocks.classFindAll.mockResolvedValue([
        { ...octoberClass, sessions: [{ dateTime: new Date('2026-11-03T23:00:00Z') }] },
      ]);
      const [owed] = await preview();
      expect(owed).toMatchObject({ month: '2026-11', totalOwedCents: 4000, owedCents: 4000 });
    });

    it('never offers a session that has not ended', async () => {
      mocks.classFindAll.mockResolvedValue([
        { ...octoberClass, sessions: [{ dateTime: new Date('2026-11-05T14:30:00Z') }] },
      ]);
      expect(await preview()).toEqual([]);
    });

    it('leaves sessions after the through date for a later statement', async () => {
      mocks.classFindAll.mockResolvedValue([
        octoberClass,
        { ...octoberClass, id: 'class-2', sessions: [{ dateTime: new Date('2026-11-03T23:00:00Z') }] },
      ]);
      mocks.registrationFindByClassId.mockImplementation(async (classId: string) => [
        { ...registration, id: `reg-${classId}`, classId },
      ]);

      const everything = await preview();
      expect(everything[0]).toMatchObject({ totalOwedCents: 8000 });

      const result = await routes.previewClassInstructorPayouts({ throughDate: '2026-10-07' });
      expect(result['throughDate']).toBe('2026-10-07');
      const [upToOctober] = result['previews'] as { totalOwedCents: number; classes: { classId: string }[] }[];
      expect(upToOctober.totalOwedCents).toBe(4000);
      expect(upToOctober.classes.map((c) => c.classId)).toEqual(['class-1']);
    });

    it('says what an uncleared contractor is missing, without blocking anything', async () => {
      mocks.instructorFindAll.mockResolvedValue([
        { ...instructor, isContractor: true, readiness: { backgroundCheck: { clearedOn: '2026-09-02' } } },
      ]);
      const [owed] = await preview();
      expect(owed['readinessMissing']).toEqual(['contractor-agreement', 'payment-setup']);
      expect(owed['totalOwedCents']).toBe(4000);
    });

    it('says nothing about readiness for a cleared contractor or a non-contractor', async () => {
      const [plain] = await preview();
      expect(plain).not.toHaveProperty('readinessMissing');

      mocks.instructorFindAll.mockResolvedValue([
        {
          ...instructor,
          isContractor: true,
          readiness: {
            contractorAgreement: { signedOn: '2026-09-01' },
            backgroundCheck: { clearedOn: '2026-09-02' },
            paymentSetup: { completedOn: '2026-09-03', method: 'square-payroll' },
          },
        },
      ]);
      const [cleared] = await preview();
      expect(cleared).not.toHaveProperty('readinessMissing');
    });

    it('ignores classes outside the window and classes with no instructor', async () => {
      mocks.classFindAll.mockResolvedValue([
        { ...octoberClass, id: 'aug', sessions: [{ dateTime: new Date('2026-08-10T18:00:00Z') }] },
        { ...octoberClass, id: 'dec', sessions: [{ dateTime: new Date('2026-12-10T18:00:00Z') }] },
        { ...octoberClass, id: 'none', instructorId: undefined },
      ]);
      expect(await preview()).toEqual([]);
      expect(mocks.registrationFindByClassId).not.toHaveBeenCalled();
    });

    it('reaches back to a refunded registration on a class outside the window', async () => {
      const oldClass = { ...octoberClass, id: 'class-old', sessions: [{ dateTime: new Date('2025-10-07T22:00:00Z') }] };
      const oldRefund = { ...registration, id: 'reg-old', classId: 'class-old', status: 'refunded' };
      mocks.classFindAll.mockResolvedValue([octoberClass, oldClass, { ...oldClass, id: 'unrelated', instructorId: undefined }]);
      mocks.registrationFindAll.mockResolvedValue([
        oldRefund,
        { ...oldRefund, id: 'reg-old-2' },
        { ...oldRefund, id: 'in-window', classId: 'class-1' },
        { ...oldRefund, id: 'orphan', classId: 'deleted-class' },
      ]);
      mocks.ledgerFindByRegistrationIds.mockResolvedValue([
        { id: 'class-session_reg-old_0', kind: 'class-session', registrationId: 'reg-old', statementId: 'stmt-2025', shareCents: 4000 },
      ]);
      mocks.statementFindByIds.mockResolvedValue([{ id: 'stmt-2025', status: 'paid' }]);

      const [owed] = (await preview()) as { adjustmentsCents: number; shareCents: number }[];
      expect(mocks.registrationFindAll).toHaveBeenCalledWith({ status: 'refunded' });
      expect(mocks.registrationFindByClassId).toHaveBeenCalledTimes(1);
      expect(owed.adjustmentsCents).toBe(-4000);
      expect(owed.shareCents).toBe(4000);
    });

    it('counts a statement that is generated but not marked paid as still owed', async () => {
      mocks.ledgerFindByRegistrationIds.mockResolvedValue([
        { id: 'class-session_reg-1_0', kind: 'class-session', registrationId: 'reg-1', statementId: 'stmt-1', shareCents: 4000 },
      ]);
      mocks.statementFindAll.mockResolvedValue([statement, { ...statement, id: 'old', status: 'void' }]);
      mocks.statementFindByIds.mockResolvedValue([statement]);

      const previews = await preview();
      expect(previews[0]).toMatchObject({
        totalOwedCents: 0,
        owedCents: 4000,
        paidThisYearCents: 0,
        pendingStatements: [
          { id: 'stmt-1', totalOwedCents: 4000, coversFrom: '2026-10-07', coversTo: '2026-10-07' },
        ],
      });
    });

    it('shows a paid-up instructor as owed nothing, with what they were paid this year', async () => {
      const paid = { ...statement, status: 'paid', paidOn: '2026-10-10' };
      mocks.ledgerFindByRegistrationIds.mockResolvedValue([
        { id: 'class-session_reg-1_0', kind: 'class-session', registrationId: 'reg-1', statementId: 'stmt-1', shareCents: 4000 },
      ]);
      mocks.statementFindAll.mockResolvedValue([
        paid,
        // Paid last year: not part of this year's figure.
        { ...paid, id: 'stmt-2025', paidOn: '2025-12-30', totalOwedCents: 9999 },
      ]);
      mocks.statementFindByIds.mockResolvedValue([paid]);

      const previews = await preview();
      expect(previews).toHaveLength(1);
      expect(previews[0]).toMatchObject({
        instructorId: 'inst-1',
        owedCents: 0,
        totalOwedCents: 0,
        pendingStatements: [],
        paidThisYearCents: 4000,
      });
    });

    it('still shows an instructor with a pending statement and no class left to draft from', async () => {
      mocks.classFindAll.mockResolvedValue([]);
      mocks.statementFindAll.mockResolvedValue([
        { ...statement, instructorId: 'inst-gone', instructorName: 'Former Instructor', classes: [] },
      ]);
      const previews = await preview();
      expect(previews).toEqual([
        expect.objectContaining({
          instructorId: 'inst-gone',
          instructorName: 'Former Instructor',
          classes: [],
          owedCents: 4000,
          pendingStatements: [{ id: 'stmt-1', totalOwedCents: 4000 }],
        }),
      ]);
    });
  });

  describe('generateClassInstructorStatement', () => {
    const generate = (data: unknown) => routes.generateClassInstructorStatement(data);

    it('validates the input', async () => {
      await expect(generate({})).rejects.toThrow('invalid');
      await expect(generate({ instructorId: 'inst-1', throughDate: 'Nov 8' })).rejects.toThrow('invalid');
    });

    it('refuses an unknown instructor', async () => {
      mocks.instructorFindById.mockResolvedValue(undefined);
      await expect(generate({ instructorId: 'ghost' })).rejects.toThrow('Instructor ghost not found');
    });

    it('refuses when there is nothing unpaid', async () => {
      mocks.registrationFindByClassId.mockResolvedValue([]);
      await expect(generate({ instructorId: 'inst-1' })).rejects.toThrow('Nothing unpaid');
    });

    it('refuses a class that has not finished, however it is asked', async () => {
      // "Now" is Nov 5 10:00 Eastern; the class starts at 9:30 and runs two hours.
      mocks.classFindAll.mockResolvedValue([
        { ...octoberClass, sessions: [{ dateTime: new Date('2026-11-05T14:30:00Z') }] },
      ]);
      await expect(generate({ instructorId: 'inst-1' })).rejects.toThrow('Nothing unpaid');
      await expect(generate({ instructorId: 'inst-1', throughDate: '2026-12-31' })).rejects.toThrow(
        'Nothing unpaid'
      );
      expect(mocks.statementGenerate).not.toHaveBeenCalled();
    });

    it('refuses an instructor with no percentage rate', async () => {
      mocks.instructorFindById.mockResolvedValue({ ...instructor, payRateType: 'flat', payRate: 5000 });
      await expect(generate({ instructorId: 'inst-1' })).rejects.toThrow('no percentage pay rate');
    });

    it('refuses when refunds cancel out what is owed', async () => {
      mocks.registrationFindByClassId.mockResolvedValue([{ ...registration, status: 'refunded' }]);
      mocks.ledgerFindByRegistrationIds.mockResolvedValue([
        { id: 'class-session_reg-1_0', kind: 'class-session', registrationId: 'reg-1', statementId: 'stmt-sep', shareCents: 4000 },
      ]);
      mocks.statementFindByIds.mockResolvedValue([{ id: 'stmt-sep', status: 'paid' }]);
      await expect(generate({ instructorId: 'inst-1' })).rejects.toThrow('carry to the next statement');
    });

    it('generates from the draft with its rate', async () => {
      mocks.statementGenerate.mockResolvedValue({ kind: 'created', statement });
      const result = await generate({ instructorId: 'inst-1' });

      expect(mocks.classFindAll).toHaveBeenCalledWith({ instructorId: 'inst-1' });
      const draft = mocks.statementGenerate.mock.calls[0][0];
      expect(draft).toMatchObject({ instructorId: 'inst-1', month: '2026-10', payRate: 0.8, totalOwedCents: 4000 });
      expect(draft.entries.map((e: { id: string }) => e.id)).toEqual(['class-session_reg-1_0']);
      expect(result).toEqual({ statement });
    });

    it('generates a second statement in a month that already has one', async () => {
      // The first class is on a paid statement; a later class the same month is not.
      const second = { ...octoberClass, id: 'class-2', sessions: [{ dateTime: new Date('2026-10-21T22:00:00Z') }] };
      mocks.classFindAll.mockResolvedValue([octoberClass, second]);
      mocks.registrationFindByClassId.mockImplementation(async (classId: string) => [
        { ...registration, id: classId === 'class-1' ? 'reg-1' : 'reg-2', classId },
      ]);
      mocks.ledgerFindByRegistrationIds.mockResolvedValue([
        { id: 'class-session_reg-1_0', kind: 'class-session', registrationId: 'reg-1', statementId: 'stmt-1', shareCents: 4000 },
      ]);
      mocks.statementFindByIds.mockResolvedValue([{ ...statement, status: 'paid' }]);
      mocks.statementGenerate.mockResolvedValue({ kind: 'created', statement });

      await generate({ instructorId: 'inst-1' });
      const draft = mocks.statementGenerate.mock.calls[0][0];
      expect(draft.entries.map((e: { id: string }) => e.id)).toEqual(['class-session_reg-2_0']);
      expect(draft.totalOwedCents).toBe(4000);
    });

    it('claims only the sessions up to the through date', async () => {
      const second = { ...octoberClass, id: 'class-2', sessions: [{ dateTime: new Date('2026-10-21T22:00:00Z') }] };
      mocks.classFindAll.mockResolvedValue([octoberClass, second]);
      mocks.registrationFindByClassId.mockImplementation(async (classId: string) => [
        { ...registration, id: classId === 'class-1' ? 'reg-1' : 'reg-2', classId },
      ]);
      mocks.statementGenerate.mockResolvedValue({ kind: 'created', statement });

      await generate({ instructorId: 'inst-1', throughDate: '2026-10-07' });
      const draft = mocks.statementGenerate.mock.calls[0][0];
      expect(draft.entries.map((e: { id: string }) => e.id)).toEqual(['class-session_reg-1_0']);

      await expect(generate({ instructorId: 'inst-1', throughDate: '2026-10-06' })).rejects.toThrow(
        'Nothing unpaid for this instructor up to 2026-10-06'
      );
    });

    it('explains losing a race to another generate', async () => {
      mocks.statementGenerate.mockResolvedValue({ kind: 'already-claimed', entryIds: ['x'] });
      await expect(generate({ instructorId: 'inst-1' })).rejects.toThrow('refresh and try again');
    });
  });

  describe('getClassInstructorStatements', () => {
    it('lists with filters and totals what each instructor was paid this year', async () => {
      const paid = [
        { ...statement, id: 'a', status: 'paid', paidOn: '2026-10-03', totalOwedCents: 1000 },
        { ...statement, id: 'b', status: 'paid', paidOn: '2025-12-20', totalOwedCents: 9999 },
        { ...statement, id: 'c', instructorId: 'inst-2', status: 'paid', paidOn: '2026-02-01', totalOwedCents: 300 },
      ];
      mocks.statementFindAll.mockImplementation(async (filters: { status?: string }) =>
        filters.status === 'paid' ? paid : [statement]
      );

      const result = await routes.getClassInstructorStatements({ instructorId: 'inst-1' });
      expect(mocks.statementFindAll).toHaveBeenCalledWith({
        instructorId: 'inst-1',
        month: undefined,
        status: undefined,
      });
      expect(result).toEqual({
        statements: [statement],
        paidThisYearByInstructor: { 'inst-1': 1000, 'inst-2': 300 },
        // Every year, so last year's 1099 figure is still there in January.
        paidByYearByInstructor: {
          'inst-1': { '2026': 1000, '2025': 9999 },
          'inst-2': { '2026': 300 },
        },
      });
    });
  });

  describe('getClassInstructorStatement', () => {
    it('requires an id and a real statement', async () => {
      await expect(routes.getClassInstructorStatement({})).rejects.toThrow('required');
      mocks.statementFindById.mockResolvedValue(undefined);
      await expect(routes.getClassInstructorStatement({ id: 'x' })).rejects.toThrow('not found');
    });

    it('checks a pending statement against current registrations', async () => {
      mocks.statementFindById.mockResolvedValue(statement);
      mocks.registrationFindByClassId.mockResolvedValue([{ ...registration, status: 'refunded' }]);
      const result = await routes.getClassInstructorStatement({ id: 'stmt-1' });
      expect(result['staleReasons']).toEqual([
        { kind: 'registration-no-longer-earns', classId: 'class-1', registrationId: 'reg-1', status: 'refunded' },
      ]);
    });

    it('tolerates a class that has since been deleted', async () => {
      mocks.statementFindById.mockResolvedValue(statement);
      mocks.classFindById.mockResolvedValue(undefined);
      const result = await routes.getClassInstructorStatement({ id: 'stmt-1' });
      expect(result['staleReasons']).toEqual([]);
    });

    it('does not look up anything for a paid statement', async () => {
      mocks.statementFindById.mockResolvedValue({ ...statement, status: 'paid' });
      const result = await routes.getClassInstructorStatement({ id: 'stmt-1' });
      expect(result['staleReasons']).toEqual([]);
      expect(mocks.registrationFindByClassId).not.toHaveBeenCalled();
    });
  });

  describe('markClassInstructorStatementPaid', () => {
    const valid = { id: 'stmt-1', paidOn: '2026-11-05', paymentMethod: 'payroll' };

    it('validates the payment', async () => {
      await expect(
        routes.markClassInstructorStatementPaid({ ...valid, paymentMethod: 'venmo' })
      ).rejects.toThrow('invalid');
    });

    it('records the payment, trimming an empty reference away', async () => {
      mocks.statementMarkPaid.mockResolvedValue({ kind: 'ok', statement: { ...statement, status: 'paid' } });
      await routes.markClassInstructorStatementPaid({ ...valid, paymentReference: '   ' });
      expect(mocks.statementMarkPaid).toHaveBeenCalledWith('stmt-1', {
        paidOn: '2026-11-05',
        paymentMethod: 'payroll',
        paymentReference: undefined,
      });
    });

    it('refuses a statement that is not pending, or missing', async () => {
      mocks.statementMarkPaid.mockResolvedValue({ kind: 'wrong-status', status: 'paid' });
      await expect(routes.markClassInstructorStatementPaid(valid)).rejects.toThrow(
        'Only a pending statement can be marked paid; this one is paid'
      );
      mocks.statementMarkPaid.mockResolvedValue({ kind: 'not-found' });
      await expect(routes.markClassInstructorStatementPaid(valid)).rejects.toThrow('not found');
    });
  });

  describe('voidClassInstructorStatement', () => {
    it('voids a pending statement', async () => {
      mocks.statementVoid.mockResolvedValue({ kind: 'ok', statement: { ...statement, status: 'void' } });
      const result = await routes.voidClassInstructorStatement({ id: 'stmt-1' });
      expect(result).toMatchObject({ statement: { status: 'void' } });
    });

    it('refuses a paid statement and a missing id', async () => {
      await expect(routes.voidClassInstructorStatement({})).rejects.toThrow('required');
      mocks.statementVoid.mockResolvedValue({ kind: 'wrong-status', status: 'paid' });
      await expect(routes.voidClassInstructorStatement({ id: 'stmt-1' })).rejects.toThrow(
        'can be voided'
      );
    });
  });

  // The handlers are tested in artist-payouts.spec.ts and teacher-payouts.spec.ts.
  it('serves artist payouts and the teacher report from their own handlers', () => {
    expect(routes['getArtistPayouts']).toBe(getArtistPayouts);
    expect(routes['generateArtistPayout']).toBe(generateArtistPayout);
    expect(routes['markArtistPayoutPaid']).toBe(markArtistPayoutPaid);
    expect(routes['getTeacherPayouts']).toBe(getTeacherPayouts);
  });
});
