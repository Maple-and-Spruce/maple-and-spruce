// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  routes: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock('firebase/functions', () => ({
  httpsCallableFromURL: (_functions: unknown, url: string) => mocks.routes[url],
}));
vi.mock('@maple/ts/firebase/firebase-config', () => ({
  getMapleFunctions: () => ({}),
  routerCallableUrl: (router: string, name: string) => `${router}/${name}`,
}));

import {
  useClassInstructorPayouts,
  useClassInstructorStatement,
} from './useClassInstructorPayouts';

const wireStatement = {
  id: 'stmt-1',
  instructorId: 'inst-1',
  instructorName: 'Test Instructor',
  payRate: 0.8,
  month: '2026-10',
  status: 'pending',
  classes: [
    {
      classId: 'class-1',
      className: 'Stained Glass Basics',
      totalSessions: 1,
      sessions: [{ index: 0, at: '2026-10-07T22:00:00.000Z' }],
      includesEarlierMonths: false,
      headcount: 1,
      registrationIds: ['reg-1'],
      grossCents: 5000,
      shareCents: 4000,
    },
  ],
  adjustments: [
    { kind: 'refund', registrationId: 'reg-0', classId: 'c0', className: 'Weaving', refundedAt: '2026-10-20T12:00:00.000Z', shareCents: -1000 },
    { kind: 'refund', registrationId: 'reg-9', classId: 'c0', className: 'Weaving', shareCents: -500 },
  ],
  grossCents: 5000,
  shareCents: 4000,
  adjustmentsCents: -1500,
  totalOwedCents: 2500,
  entryIds: [],
  createdAt: '2026-11-02T12:00:00.000Z',
  updatedAt: '2026-11-02T12:00:00.000Z',
  voidedAt: '2026-11-03T12:00:00.000Z',
};

const wirePreview = { ...wireStatement, missingRateConfig: false };

describe('useClassInstructorPayouts', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.routes = {
      'payouts/previewClassInstructorPayouts': vi
        .fn()
        .mockResolvedValue({ data: { previews: [wirePreview], monthIsOver: true } }),
      'payouts/getClassInstructorStatements': vi.fn().mockResolvedValue({
        data: { statements: [wireStatement], paidThisYearByInstructor: { 'inst-1': 9000 } },
      }),
      'payouts/generateClassInstructorStatement': vi
        .fn()
        .mockResolvedValue({ data: { statement: wireStatement } }),
      'payouts/markClassInstructorStatementPaid': vi.fn().mockResolvedValue({ data: {} }),
      'payouts/voidClassInstructorStatement': vi.fn().mockResolvedValue({ data: {} }),
      'payouts/getClassInstructorStatement': vi
        .fn()
        .mockResolvedValue({ data: { statement: wireStatement, staleReasons: [] } }),
    };
  });

  it('loads the month preview and the statements, turning wire strings back into dates', async () => {
    const { result } = renderHook(() => useClassInstructorPayouts({ month: '2026-10' }));
    await waitFor(() => expect(result.current.previewState.status).toBe('success'));
    await waitFor(() => expect(result.current.statementsState.status).toBe('success'));

    expect(mocks.routes['payouts/previewClassInstructorPayouts']).toHaveBeenCalledWith({ month: '2026-10' });
    const preview = result.current.previewState;
    if (preview.status !== 'success') throw new Error('unreachable');
    expect(preview.data.monthIsOver).toBe(true);
    expect(preview.data.previews[0].classes[0].sessions[0].at).toBeInstanceOf(Date);
    expect(preview.data.previews[0].adjustments[0].refundedAt).toBeInstanceOf(Date);
    expect(preview.data.previews[0].adjustments[1].refundedAt).toBeUndefined();

    const statements = result.current.statementsState;
    if (statements.status !== 'success') throw new Error('unreachable');
    expect(statements.data.statements[0].createdAt).toBeInstanceOf(Date);
    expect(statements.data.statements[0].voidedAt).toBeInstanceOf(Date);
    expect(statements.data.paidThisYearByInstructor).toEqual({ 'inst-1': 9000 });
  });

  it('reports failures as error state', async () => {
    mocks.routes['payouts/previewClassInstructorPayouts'].mockRejectedValue(new Error('boom'));
    mocks.routes['payouts/getClassInstructorStatements'].mockRejectedValue('nope');
    const { result } = renderHook(() => useClassInstructorPayouts({ month: '2026-10' }));
    await waitFor(() => expect(result.current.previewState).toEqual({ status: 'error', error: 'boom' }));
    await waitFor(() =>
      expect(result.current.statementsState).toEqual({ status: 'error', error: 'Failed to load statements' })
    );
  });

  it('generates, marks paid and voids, refreshing both lists each time', async () => {
    const { result } = renderHook(() => useClassInstructorPayouts({ month: '2026-10' }));
    await waitFor(() => expect(result.current.statementsState.status).toBe('success'));
    const preview = mocks.routes['payouts/previewClassInstructorPayouts'];
    const list = mocks.routes['payouts/getClassInstructorStatements'];

    let generated;
    await act(async () => {
      generated = await result.current.generateStatement('inst-1');
    });
    expect(mocks.routes['payouts/generateClassInstructorStatement']).toHaveBeenCalledWith({
      instructorId: 'inst-1',
      month: '2026-10',
    });
    expect(generated).toMatchObject({ id: 'stmt-1', createdAt: expect.any(Date) });

    await act(async () => {
      await result.current.markStatementPaid({ id: 'stmt-1', paidOn: '2026-11-05', paymentMethod: 'payroll' });
      await result.current.voidStatement('stmt-2');
    });
    expect(mocks.routes['payouts/voidClassInstructorStatement']).toHaveBeenCalledWith({ id: 'stmt-2' });
    expect(preview).toHaveBeenCalledTimes(4);
    expect(list).toHaveBeenCalledTimes(4);
  });
});

describe('useClassInstructorStatement', () => {
  it('loads one statement and refreshes it after marking it paid', async () => {
    const { result } = renderHook(() => useClassInstructorStatement('stmt-1'));
    await waitFor(() => expect(result.current.statementState.status).toBe('success'));
    const state = result.current.statementState;
    if (state.status !== 'success') throw new Error('unreachable');
    expect(state.data.statement.classes[0].sessions[0].at).toBeInstanceOf(Date);

    await act(async () => {
      await result.current.markStatementPaid({ id: 'stmt-1', paidOn: '2026-11-05', paymentMethod: 'bill-pay' });
    });
    expect(mocks.routes['payouts/getClassInstructorStatement']).toHaveBeenCalledTimes(2);
  });

  it('reports a failure', async () => {
    mocks.routes['payouts/getClassInstructorStatement'].mockRejectedValue(new Error('not found'));
    const { result } = renderHook(() => useClassInstructorStatement('missing'));
    await waitFor(() =>
      expect(result.current.statementState).toEqual({ status: 'error', error: 'not found' })
    );
  });
});
