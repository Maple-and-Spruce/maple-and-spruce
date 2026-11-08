'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Alert,
  Box,
  GlobalStyles,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import type { RequestState } from '@maple/ts/domain';
import type { GetCertificateBatchResponse } from '@maple/ts/firebase/api-types';
import { certificateHeadline, GIFT_CERTIFICATE_DESIGNS } from './certificate-designs';
import { GiftCertificatePage } from './GiftCertificatePage';

const PRINT_ROOT = 'gift-certificate-print-root';

/**
 * Printing shows only the certificates: everything else on the page (the
 * admin menu, the buttons) is hidden, the sheet has no margins, and the
 * background colour prints.
 */
const printStyles = (
  <GlobalStyles
    styles={{
      '@page': { size: 'letter', margin: 0 },
      [`.${PRINT_ROOT}`]: { display: 'none' },
      '@media print': {
        [`body > *:not(.${PRINT_ROOT})`]: { display: 'none !important' },
        [`.${PRINT_ROOT}`]: { display: 'block !important' },
        'html, body': {
          margin: 0,
          padding: 0,
          background: '#fff !important',
          printColorAdjust: 'exact',
          WebkitPrintColorAdjust: 'exact',
        },
      },
    }}
  />
);

function Pages({ batch }: { batch: GetCertificateBatchResponse }) {
  const design = GIFT_CERTIFICATE_DESIGNS[batch.design];
  const headline = certificateHeadline(batch);
  return (
    <>
      {batch.certificates.map((certificate) => (
        <GiftCertificatePage
          key={certificate.giftCardId}
          design={design}
          kind={batch.kind}
          headline={headline}
          code={certificate.code}
        />
      ))}
    </>
  );
}

/**
 * A printed batch (#314): on screen, a preview of every certificate; when
 * printed, one certificate per US Letter sheet and nothing else.
 *
 * The printed copy is drawn straight into `<body>`, outside the admin layout,
 * so the admin chrome cannot add margins, a sidebar or blank pages.
 */
export function GiftCertificateSheet({
  batchState,
}: {
  batchState: RequestState<GetCertificateBatchResponse>;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (batchState.status === 'error') {
    return (
      <Alert severity="error">
        Couldn&apos;t load the certificates: {batchState.error}
      </Alert>
    );
  }

  if (batchState.status !== 'success') {
    return (
      <Box aria-busy="true" aria-label="Loading the certificates">
        <Skeleton variant="rectangular" sx={{ width: '612pt', maxWidth: '100%', height: '792pt' }} />
      </Box>
    );
  }

  const batch = batchState.data;
  if (batch.certificates.length === 0) {
    return <Typography color="textSecondary">This batch has no certificates.</Typography>;
  }

  return (
    <>
      {printStyles}
      <Stack spacing={3} sx={{ alignItems: 'flex-start' }} aria-label="Certificate preview">
        {batch.certificates.length > 1 && (
          <Typography color="textSecondary">
            {batch.certificates.length} certificates, one per page.
          </Typography>
        )}
        <Stack spacing={3} sx={{ overflowX: 'auto', maxWidth: '100%' }}>
          {batch.certificates.map((certificate) => (
            <Paper key={certificate.giftCardId} elevation={3} sx={{ width: 'fit-content' }}>
              <GiftCertificatePage
                design={GIFT_CERTIFICATE_DESIGNS[batch.design]}
                kind={batch.kind}
                headline={certificateHeadline(batch)}
                code={certificate.code}
              />
            </Paper>
          ))}
        </Stack>
      </Stack>
      {mounted &&
        createPortal(
          <div className={PRINT_ROOT} aria-hidden="true">
            <Pages batch={batch} />
          </div>,
          document.body
        )}
    </>
  );
}
