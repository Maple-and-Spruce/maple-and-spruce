'use client';

import { use } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { GiftCertificateSheet } from '../../../../../components/gift-cards';
import { useCertificateBatch } from '../../../../../hooks';

/**
 * A printed batch of gift certificates (#314), ready to print. Opening it
 * reads every code in the batch from Square (logged with who asked); the codes
 * are never stored. Printing shows only the certificates, one per page.
 */
export default function PrintGiftCertificatesPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = use(params);
  const { batchState } = useCertificateBatch(decodeURIComponent(batchId));
  const count = batchState.status === 'success' ? batchState.data.certificates.length : 0;

  return (
    <>
      <Stack
        direction="row"
        spacing={1}
        sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
      >
        <Button component={Link} href="/gift-cards" startIcon={<ArrowBackIcon />}>
          Back to gift cards
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          startIcon={<PrintIcon />}
          onClick={() => window.print()}
          disabled={count === 0}
        >
          Print {count > 0 ? count : ''} {count === 1 ? 'certificate' : 'certificates'}
        </Button>
      </Stack>
      <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
        Print gift certificates
      </Typography>
      <Alert severity="warning" sx={{ mb: 3, maxWidth: 816 }}>
        These cards are loaded and can be spent now. Print on US Letter paper at
        100% scale with background graphics on, then keep them somewhere safe.
      </Alert>
      <GiftCertificateSheet batchState={batchState} />
    </>
  );
}
