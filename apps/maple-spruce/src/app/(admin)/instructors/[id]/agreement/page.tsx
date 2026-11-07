'use client';

import { Suspense, use, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  GlobalStyles,
  Skeleton,
  Stack,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { PrintableAgreement } from '@maple/react/agreements';
import {
  applyAgreementVariables,
  instructorAgreementVariables,
} from '@maple/ts/domain';
import { useAgreementTemplates, useInstructors } from '../../../../../hooks';

/**
 * An instructor's contractor agreement, ready to print and sign on paper when
 * they can't sign online. Their own pay split is filled in. Print hides the
 * admin chrome and the buttons.
 */
function PrintAgreement({ instructorId }: { instructorId: string }) {
  const templateId = useSearchParams().get('template') ?? '';
  const { instructorsState } = useInstructors();
  const { templatesState } = useAgreementTemplates();

  const result = useMemo(() => {
    if (instructorsState.status === 'error') {
      return { kind: 'error' as const, message: "Couldn't load the instructor." };
    }
    if (templatesState.status === 'error') {
      return { kind: 'error' as const, message: "Couldn't load the agreement." };
    }
    if (instructorsState.status !== 'success' || templatesState.status !== 'success') {
      return { kind: 'loading' as const };
    }
    const instructor = instructorsState.data.find((i) => i.id === instructorId);
    const template = templatesState.data.find((t) => t.id === templateId);
    if (!instructor) return { kind: 'error' as const, message: 'Instructor not found.' };
    if (!template) return { kind: 'error' as const, message: 'Agreement not found.' };

    const { sections, unresolved } = applyAgreementVariables(
      template.sections,
      instructorAgreementVariables(instructor)
    );
    if (unresolved.length > 0) {
      return {
        kind: 'error' as const,
        message: `Set ${instructor.name}'s pay rate (a percentage) before printing. The agreement fills it in.`,
      };
    }
    return {
      kind: 'ready' as const,
      instructor,
      template,
      sections,
    };
  }, [instructorsState, templatesState, instructorId, templateId]);

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
        <Button
          component={Link}
          href={`/instructors?edit=${instructorId}`}
          startIcon={<ArrowBackIcon />}
        >
          Instructor
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          startIcon={<PrintIcon />}
          onClick={() => window.print()}
          disabled={result.kind !== 'ready'}
        >
          Print / Save PDF
        </Button>
      </Stack>

      <Box sx={{ maxWidth: 820 }}>
        {result.kind === 'loading' && (
          <Box aria-busy="true" aria-label="Loading agreement">
            <Skeleton variant="text" width="60%" height={40} />
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} variant="rounded" height={90} sx={{ mb: 1.5 }} />
            ))}
          </Box>
        )}
        {result.kind === 'error' && <Alert severity="error">{result.message}</Alert>}
        {result.kind === 'ready' && (
          <PrintableAgreement
            templateName={result.template.name}
            sections={result.sections}
            signerName={result.instructor.name}
          />
        )}
      </Box>
    </>
  );
}

export default function InstructorAgreementPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense>
      <PrintAgreement instructorId={id} />
    </Suspense>
  );
}
