'use client';

import { use, useState } from 'react';
import { Box, Button, GlobalStyles, Stack } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { ClassInstructorStatementView, MarkStatementPaidDialog } from '@maple/react/payouts';
import { useClassInstructorStatement } from '@maple/react/data';

/**
 * One class-instructor statement, ready to print or save as a PDF to send
 * to the instructor. Print hides the admin chrome and the action buttons.
 */
export default function InstructorStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { statementState, markStatementPaid } = useClassInstructorStatement(id);
  const [paying, setPaying] = useState(false);
  const statement = statementState.status === 'success' ? statementState.data.statement : null;

  return (
    <>
      <GlobalStyles
        styles={{
          '@media print': {
            'nav, .MuiDrawer-root, .MuiAppBar-root, [data-print-hide]': {
              display: 'none !important',
            },
            body: { background: '#fff' },
          },
        }}
      />
      <Stack direction="row" spacing={1} sx={{ mb: 3 }} data-print-hide>
        <Button component={Link} href="/payouts?tab=classes" startIcon={<ArrowBackIcon />}>
          Payouts
        </Button>
        <Box sx={{ flex: 1 }} />
        {statement?.status === 'pending' && (
          <Button variant="outlined" onClick={() => setPaying(true)}>
            Mark paid
          </Button>
        )}
        <Button
          variant="contained"
          startIcon={<PrintIcon />}
          onClick={() => window.print()}
          disabled={!statement}
        >
          Print / Save PDF
        </Button>
      </Stack>

      <Box sx={{ maxWidth: 880 }}>
        <ClassInstructorStatementView statementState={statementState} />
      </Box>

      <MarkStatementPaidDialog
        statement={paying ? statement : null}
        onClose={() => setPaying(false)}
        onSubmit={markStatementPaid}
      />
    </>
  );
}
