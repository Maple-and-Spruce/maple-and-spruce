'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Chip,
  Divider,
  Alert,
  Skeleton,
  Tabs,
  Tab,
} from '@mui/material';
import type { RequestState } from '@maple/ts/domain';
import type { SignedAgreementDetail } from '@maple/react/data';

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMediaRelease(choice: string): { label: string; color: 'success' | 'warning' | 'error' } {
  switch (choice) {
    case 'grant':
      return { label: 'Granted', color: 'success' };
    case 'grant-without-name':
      return { label: 'Granted (no name)', color: 'warning' };
    case 'deny':
      return { label: 'Denied', color: 'error' };
    default:
      return { label: choice, color: 'warning' };
  }
}

interface SignedAgreementDetailDialogProps {
  open: boolean;
  onClose: () => void;
  detailState: RequestState<SignedAgreementDetail>;
  signerName?: string;
}

export function SignedAgreementDetailDialog({
  open,
  onClose,
  detailState,
  signerName,
}: SignedAgreementDetailDialogProps) {
  const [tab, setTab] = useState(0);

  const handleClose = () => {
    setTab(0);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Signed Agreement{signerName ? ` — ${signerName}` : ''}
      </DialogTitle>
      <DialogContent>
        {detailState.status === 'loading' || detailState.status === 'idle' ? (
          <Box sx={{ mt: 1 }}>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={40} sx={{ mb: 1 }} />
            ))}
          </Box>
        ) : detailState.status === 'error' ? (
          <Alert severity="error" sx={{ mt: 1 }}>
            {detailState.error}
          </Alert>
        ) : (
          <SignedAgreementContent
            detail={detailState.data}
            tab={tab}
            onTabChange={setTab}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function SignedAgreementContent({
  detail,
  tab,
  onTabChange,
}: {
  detail: SignedAgreementDetail;
  tab: number;
  onTabChange: (tab: number) => void;
}) {
  const { agreement, signatureImageUrl, guardianSignatureImageUrl } = detail;
  const mediaRelease = agreement.mediaReleaseChoice
    ? formatMediaRelease(agreement.mediaReleaseChoice)
    : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
      <Tabs value={tab} onChange={(_e, v) => onTabChange(v)}>
        <Tab label="Details" />
        <Tab label="Agreement" />
      </Tabs>

      {tab === 0 && (
        <>
          {/* Signer Info */}
          <Typography variant="subtitle2" color="text.secondary">
            Signer
          </Typography>
          <Box sx={{ pl: 1 }}>
            <Typography variant="body1" fontWeight={500}>
              {agreement.printedName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {agreement.signerEmail}
            </Typography>
          </Box>

          <Divider />

          {/* Signed Date */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography variant="subtitle2" color="text.secondary">
              Signed
            </Typography>
            <Typography variant="body2">
              {formatDate(agreement.signedAt)}
            </Typography>
          </Box>

          <Divider />

          {/* Media Release */}
          {mediaRelease && (
            <>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography variant="subtitle2" color="text.secondary">
                  Photo / Media Release
                </Typography>
                <Chip
                  label={mediaRelease.label}
                  size="small"
                  color={mediaRelease.color}
                />
              </Box>
              <Divider />
            </>
          )}

          {/* Minor Info */}
          {agreement.isMinor && (
            <>
              <Typography variant="subtitle2" color="text.secondary">
                Minor
              </Typography>
              <Box sx={{ pl: 1 }}>
                <Typography variant="body2">
                  Minor: {agreement.minorName}
                </Typography>
                <Typography variant="body2">
                  Guardian: {agreement.guardianName}
                </Typography>
              </Box>
              <Divider />
            </>
          )}

          {/* Signature */}
          <Typography variant="subtitle2" color="text.secondary">
            Signature
          </Typography>
          <Box
            sx={{
              pl: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <Box
              component="img"
              src={signatureImageUrl}
              alt={`Signature of ${agreement.printedName}`}
              sx={{
                maxWidth: '100%',
                maxHeight: 120,
                objectFit: 'contain',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                p: 1,
                backgroundColor: 'grey.50',
              }}
            />
            {guardianSignatureImageUrl && (
              <>
                <Typography variant="caption" color="text.secondary">
                  Guardian Signature
                </Typography>
                <Box
                  component="img"
                  src={guardianSignatureImageUrl}
                  alt={`Guardian signature of ${agreement.guardianName}`}
                  sx={{
                    maxWidth: '100%',
                    maxHeight: 120,
                    objectFit: 'contain',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 1,
                    backgroundColor: 'grey.50',
                  }}
                />
              </>
            )}
          </Box>
        </>
      )}

      {tab === 1 && (
        <Box
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            p: 2,
            maxHeight: 400,
            overflow: 'auto',
            '& h1, & h2, & h3': {
              fontSize: '1rem',
              fontWeight: 600,
              mt: 2,
              mb: 1,
            },
            '& p': { mb: 1 },
            '& ul, & ol': { pl: 3, mb: 1 },
          }}
          dangerouslySetInnerHTML={{
            __html: agreement.agreementHtmlSnapshot,
          }}
        />
      )}
    </Box>
  );
}
