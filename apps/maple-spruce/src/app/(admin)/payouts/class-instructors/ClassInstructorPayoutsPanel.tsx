'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import {
  ClassInstructorPayoutPreview,
  ClassInstructorStatementsList,
  InstructorYearTotals,
  MarkStatementPaidDialog,
  ThroughDatePicker,
  formatMoney,
  formatStatementPeriod,
} from '@maple/react/payouts';
import { useClassInstructorPayouts } from '@maple/react/data';
import type { ClassInstructorStatement } from '@maple/ts/domain';

export const statementHref = (id: string): string => `/payouts/instructor-statements/${id}`;

/**
 * Class instructors tab on /payouts: what each instructor is owed and not yet
 * paid, every statement, and what was paid each year. Nothing here moves
 * money — David pays in Square and records it.
 */
export function ClassInstructorPayoutsPanel() {
  // Empty means "everything that has finished"; a day leaves later classes
  // for another statement (recording a payment made a while ago).
  const [throughDate, setThroughDate] = useState('');
  const { previewState, statementsState, generateStatement, markStatementPaid, voidStatement } =
    useClassInstructorPayouts({ throughDate: throughDate || undefined });
  const [paying, setPaying] = useState<ClassInstructorStatement | null>(null);
  const [voiding, setVoiding] = useState<ClassInstructorStatement | null>(null);
  const [voidBusy, setVoidBusy] = useState(false);

  const confirmVoid = async () => {
    if (!voiding || voidBusy) return;
    setVoidBusy(true);
    try {
      await voidStatement(voiding.id);
      setVoiding(null);
    } finally {
      setVoidBusy(false);
    }
  };

  return (
    <>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
        Contract instructors get their pay rate of what students paid for each class, after
        discounts and before sales tax. Pay whenever you like: after each class, weekly or monthly.
        Generate a statement for the classes you are paying, pay it in Square Payroll, then mark it
        paid here.
      </Typography>

      <Box sx={{ mb: 2 }}>
        <ThroughDatePicker value={throughDate} onChange={setThroughDate} />
      </Box>

      <ClassInstructorPayoutPreview
        previewState={previewState}
        onGenerate={async (instructorId) => {
          await generateStatement(instructorId);
        }}
        onMarkPaid={(statementId) => {
          if (statementsState.status !== 'success') return;
          setPaying(statementsState.data.statements.find((s) => s.id === statementId) ?? null);
        }}
        statementHref={statementHref}
      />

      <Typography variant="h5" component="h2" sx={{ mt: 5, mb: 2 }}>
        Statements
      </Typography>
      <ClassInstructorStatementsList
        statementsState={statementsState}
        onMarkPaid={setPaying}
        onVoid={setVoiding}
        statementHref={statementHref}
      />

      <Typography variant="h5" component="h2" sx={{ mt: 5, mb: 1 }}>
        Paid by year
      </Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
        What was actually paid, by the day you paid it. Use these for the 1099-NEC and the
        workers&apos; comp audit.
      </Typography>
      <InstructorYearTotals statementsState={statementsState} />

      <MarkStatementPaidDialog
        statement={paying}
        onClose={() => setPaying(null)}
        onSubmit={markStatementPaid}
      />

      <Dialog open={voiding !== null} onClose={() => !voidBusy && setVoiding(null)}>
        <DialogTitle>Void this statement?</DialogTitle>
        <DialogContent>
          {voiding && (
            <DialogContentText>
              {voiding.instructorName}, classes held {formatStatementPeriod(voiding)} ({formatMoney(voiding.totalOwedCents)}).
              Its sessions go back to unpaid, so you can generate it again.
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          <Stack direction="row" spacing={1}>
            <Button onClick={() => setVoiding(null)} disabled={voidBusy}>
              Keep it
            </Button>
            <Button color="error" variant="contained" onClick={confirmVoid} disabled={voidBusy}>
              {voidBusy ? 'Voiding…' : 'Void statement'}
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>
    </>
  );
}
