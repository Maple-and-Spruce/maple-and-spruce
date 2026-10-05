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
  MarkStatementPaidDialog,
  MonthStepper,
  formatMoney,
  formatMonth,
  lastMonthKey,
} from '@maple/react/payouts';
import { useClassInstructorPayouts } from '@maple/react/data';
import type { ClassInstructorStatement } from '@maple/ts/domain';

export const statementHref = (id: string): string => `/payouts/instructor-statements/${id}`;

/**
 * Class instructors tab on /payouts: what's owed for a month, and every
 * statement. Nothing here moves money — David pays in Square and records it.
 */
export function ClassInstructorPayoutsPanel() {
  const [month, setMonth] = useState(() => lastMonthKey());
  const { previewState, statementsState, generateStatement, markStatementPaid, voidStatement } =
    useClassInstructorPayouts({ month });
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
        Contract instructors get their pay rate (usually 80%) of what students paid for each class,
        after discounts and before sales tax. Each session is paid in the month it was held. Pay in
        Square Payroll or Bill Pay, then mark the statement paid here.
      </Typography>

      <Box sx={{ mb: 2 }}>
        <MonthStepper month={month} onChange={setMonth} />
      </Box>

      <ClassInstructorPayoutPreview
        previewState={previewState}
        onGenerate={async (instructorId) => {
          await generateStatement(instructorId);
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
              {voiding.instructorName}, {formatMonth(voiding.month)} ({formatMoney(voiding.totalOwedCents)}).
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
