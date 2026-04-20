'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Container,
  CircularProgress,
  Alert,
} from '@mui/material';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import { SigningForm } from '@maple/react/agreements';
import type {
  GetAgreementForSigningRequest,
  GetAgreementForSigningResponse,
  SubmitSignedAgreementRequest,
  SubmitSignedAgreementResponse,
} from '@maple/ts/firebase/api-types';
import type { AgreementSection, MediaReleaseChoice } from '@maple/ts/domain';

interface AgreementData {
  templateName: string;
  sections: AgreementSection[];
  supportsMinor: boolean;
  signerName: string;
  signerEmail: string;
  className?: string;
}

export default function SignAgreementPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token as string;
  const kioskMode = searchParams.get('kiosk') === 'true';

  const [agreement, setAgreement] = useState<AgreementData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const fetchAgreement = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const functions = getMapleFunctions();
        const getAgreement = httpsCallable<
          GetAgreementForSigningRequest,
          GetAgreementForSigningResponse
        >(functions, 'getAgreementForSigning');

        const result = await getAgreement({ token });
        setAgreement(result.data);
      } catch (err) {
        console.error('Failed to fetch agreement:', err);
        const message =
          err instanceof Error ? err.message : 'Unable to load agreement.';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAgreement();
  }, [token]);

  const handleSubmit = useCallback(
    async (data: {
      signatureData: string;
      printedName: string;
      mediaReleaseChoice?: MediaReleaseChoice;
      isMinor: boolean;
      minorName?: string;
      guardianName?: string;
      guardianSignatureData?: string;
    }): Promise<void> => {
      const functions = getMapleFunctions();
      const submitSigned = httpsCallable<
        SubmitSignedAgreementRequest,
        SubmitSignedAgreementResponse
      >(functions, 'submitSignedAgreement');

      await submitSigned({
        token,
        signatureData: data.signatureData,
        printedName: data.printedName,
        mediaReleaseChoice: data.mediaReleaseChoice,
        isMinor: data.isMinor,
        minorName: data.minorName,
        guardianName: data.guardianName,
        guardianSignatureData: data.guardianSignatureData,
      });
    },
    [token]
  );

  // Loading state
  if (isLoading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // Error state
  if (error || !agreement) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: 'background.default',
          py: 4,
        }}
      >
        <Container maxWidth="md">
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h5" gutterBottom>
              Unable to Load Agreement
            </Typography>
            <Alert severity="error" sx={{ mt: 2, textAlign: 'left' }}>
              {error || 'Agreement not found'}
            </Alert>
          </Box>
        </Container>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        py: 4,
      }}
    >
      <Container maxWidth="md">
        {/* Maple & Spruce header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography
            variant="h6"
            sx={{
              fontStyle: 'italic',
              color: 'text.secondary',
              letterSpacing: 1,
            }}
          >
            Maple & Spruce Folk Arts Collective LLC
          </Typography>
        </Box>

        <SigningForm
          templateName={agreement.templateName}
          sections={agreement.sections}
          supportsMinor={agreement.supportsMinor}
          signerName={agreement.signerName}
          signerEmail={agreement.signerEmail}
          className={agreement.className}
          onSubmit={handleSubmit}
          kioskMode={kioskMode}
        />
      </Container>
    </Box>
  );
}
