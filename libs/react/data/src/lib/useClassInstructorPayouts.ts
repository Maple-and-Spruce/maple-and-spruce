'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallableFromURL } from 'firebase/functions';
import {
  getMapleFunctions,
  routerCallableUrl,
} from '@maple/ts/firebase/firebase-config';
import type {
  ClassInstructorStatement,
  RequestState,
  StatementAdjustment,
  StatementClassLine,
} from '@maple/ts/domain';
import type {
  ClassInstructorPayoutPreview,
  GenerateClassInstructorStatementRequest,
  GenerateClassInstructorStatementResponse,
  GetClassInstructorStatementRequest,
  GetClassInstructorStatementResponse,
  GetClassInstructorStatementsRequest,
  GetClassInstructorStatementsResponse,
  MarkClassInstructorStatementPaidRequest,
  MarkClassInstructorStatementPaidResponse,
  PreviewClassInstructorPayoutsRequest,
  PreviewClassInstructorPayoutsResponse,
  VoidClassInstructorStatementRequest,
  VoidClassInstructorStatementResponse,
} from '@maple/ts/firebase/api-types';
import { errorMessageFor } from '@maple/ts/domain';

// Dates cross the wire as ISO strings; these put them back.

function hydrateClassLine(line: StatementClassLine): StatementClassLine {
  return { ...line, sessions: line.sessions.map((s) => ({ ...s, at: new Date(s.at) })) };
}

function hydrateAdjustment(adjustment: StatementAdjustment): StatementAdjustment {
  return {
    ...adjustment,
    refundedAt: adjustment.refundedAt ? new Date(adjustment.refundedAt) : undefined,
  };
}

export function hydrateStatement(statement: ClassInstructorStatement): ClassInstructorStatement {
  return {
    ...statement,
    classes: statement.classes.map(hydrateClassLine),
    adjustments: statement.adjustments.map(hydrateAdjustment),
    voidedAt: statement.voidedAt ? new Date(statement.voidedAt) : undefined,
    createdAt: new Date(statement.createdAt),
    updatedAt: new Date(statement.updatedAt),
  };
}

function hydratePreview(preview: ClassInstructorPayoutPreview): ClassInstructorPayoutPreview {
  return {
    ...preview,
    classes: preview.classes.map(hydrateClassLine),
    adjustments: preview.adjustments.map(hydrateAdjustment),
  };
}

function route<Req, Res>(name: string) {
  return httpsCallableFromURL<Req, Res>(getMapleFunctions(), routerCallableUrl('payouts', name));
}

function errorMessage(error: unknown, fallback: string): string {
  return errorMessageFor(error, fallback);
}

/**
 * Class-instructor payouts: where each instructor stands (finished sessions
 * not on a statement yet, statements waiting to be marked paid, paid this
 * year), plus every statement. Generate, mark paid and void refresh both.
 *
 * `throughDate` (`YYYY-MM-DD`) leaves later sessions for another statement;
 * omit it for everything that has finished.
 */
export function useClassInstructorPayouts({ throughDate }: { throughDate?: string } = {}) {
  const [previewState, setPreviewState] = useState<
    RequestState<PreviewClassInstructorPayoutsResponse>
  >({ status: 'idle' });
  const [statementsState, setStatementsState] = useState<
    RequestState<GetClassInstructorStatementsResponse>
  >({ status: 'idle' });

  const fetchPreview = useCallback(async () => {
    setPreviewState({ status: 'loading' });
    try {
      const result = await route<
        PreviewClassInstructorPayoutsRequest,
        PreviewClassInstructorPayoutsResponse
      >('previewClassInstructorPayouts')(throughDate ? { throughDate } : {});
      setPreviewState({
        status: 'success',
        data: { ...result.data, previews: result.data.previews.map(hydratePreview) },
      });
    } catch (error) {
      console.error('Failed to preview class-instructor payouts:', error);
      setPreviewState({ status: 'error', error: errorMessage(error, 'Failed to load payouts') });
    }
  }, [throughDate]);

  const fetchStatements = useCallback(async () => {
    setStatementsState({ status: 'loading' });
    try {
      const result = await route<
        GetClassInstructorStatementsRequest,
        GetClassInstructorStatementsResponse
      >('getClassInstructorStatements')({});
      setStatementsState({
        status: 'success',
        data: { ...result.data, statements: result.data.statements.map(hydrateStatement) },
      });
    } catch (error) {
      console.error('Failed to fetch class-instructor statements:', error);
      setStatementsState({
        status: 'error',
        error: errorMessage(error, 'Failed to load statements'),
      });
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([fetchPreview(), fetchStatements()]);
  }, [fetchPreview, fetchStatements]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  useEffect(() => {
    fetchStatements();
  }, [fetchStatements]);

  const generateStatement = useCallback(
    async (instructorId: string): Promise<ClassInstructorStatement> => {
      const result = await route<
        GenerateClassInstructorStatementRequest,
        GenerateClassInstructorStatementResponse
      >('generateClassInstructorStatement')({
        instructorId,
        ...(throughDate && { throughDate }),
      });
      await refresh();
      return hydrateStatement(result.data.statement);
    },
    [throughDate, refresh]
  );

  const markStatementPaid = useCallback(
    async (input: MarkClassInstructorStatementPaidRequest): Promise<void> => {
      await route<MarkClassInstructorStatementPaidRequest, MarkClassInstructorStatementPaidResponse>(
        'markClassInstructorStatementPaid'
      )(input);
      await refresh();
    },
    [refresh]
  );

  const voidStatement = useCallback(
    async (id: string): Promise<void> => {
      await route<VoidClassInstructorStatementRequest, VoidClassInstructorStatementResponse>(
        'voidClassInstructorStatement'
      )({ id });
      await refresh();
    },
    [refresh]
  );

  return {
    previewState,
    statementsState,
    refresh,
    generateStatement,
    markStatementPaid,
    voidStatement,
  };
}

/** One statement, with the reasons a pending one no longer matches the data. */
export function useClassInstructorStatement(id: string) {
  const [statementState, setStatementState] = useState<
    RequestState<GetClassInstructorStatementResponse>
  >({ status: 'idle' });

  const fetchStatement = useCallback(async () => {
    setStatementState({ status: 'loading' });
    try {
      const result = await route<
        GetClassInstructorStatementRequest,
        GetClassInstructorStatementResponse
      >('getClassInstructorStatement')({ id });
      setStatementState({
        status: 'success',
        data: { ...result.data, statement: hydrateStatement(result.data.statement) },
      });
    } catch (error) {
      console.error('Failed to fetch class-instructor statement:', error);
      setStatementState({
        status: 'error',
        error: errorMessage(error, 'Failed to load statement'),
      });
    }
  }, [id]);

  useEffect(() => {
    fetchStatement();
  }, [fetchStatement]);

  const markStatementPaid = useCallback(
    async (input: MarkClassInstructorStatementPaidRequest): Promise<void> => {
      await route<MarkClassInstructorStatementPaidRequest, MarkClassInstructorStatementPaidResponse>(
        'markClassInstructorStatementPaid'
      )(input);
      await fetchStatement();
    },
    [fetchStatement]
  );

  return { statementState, fetchStatement, markStatementPaid };
}
