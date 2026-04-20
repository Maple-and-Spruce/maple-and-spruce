'use client';

import React, { useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Divider,
  Paper,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  FormHelperText,
  Switch,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import {
  useSignal,
  useComputed,
  useSignals,
} from '@maple/react/signals';
import { SignatureCanvas, type SignatureCanvasHandle } from './SignatureCanvas';
import type { AgreementSection, MediaReleaseChoice } from '@maple/ts/domain';

interface FirebaseError {
  code?: string;
  message?: string;
}

const GENERIC_ERROR_CODES = new Set(['internal', 'INTERNAL', 'unknown', 'UNKNOWN']);

function extractErrorMessage(error: unknown): string {
  const fallback = 'Something went wrong. Please try again.';
  if (!error) return fallback;
  const fbError = error as FirebaseError;
  if (fbError.message && !GENERIC_ERROR_CODES.has(fbError.message)) {
    return fbError.message;
  }
  if (error instanceof Error && !GENERIC_ERROR_CODES.has(error.message)) {
    return error.message;
  }
  return fallback;
}

export interface SigningFormProps {
  templateName: string;
  sections: AgreementSection[];
  supportsMinor: boolean;
  signerName: string;
  signerEmail: string;
  className?: string;
  onSubmit: (data: {
    signatureData: string;
    printedName: string;
    mediaReleaseChoice?: MediaReleaseChoice;
    isMinor: boolean;
    minorName?: string;
    guardianName?: string;
    guardianSignatureData?: string;
  }) => Promise<void>;
  /** If true, resets the form after successful submission (kiosk mode) */
  kioskMode?: boolean;
}

export function SigningForm({
  templateName,
  sections,
  supportsMinor,
  signerName,
  signerEmail,
  className,
  onSubmit,
  kioskMode = false,
}: SigningFormProps): React.JSX.Element {
  useSignals();

  const signatureRef = useRef<SignatureCanvasHandle>(null);
  const guardianSignatureRef = useRef<SignatureCanvasHandle>(null);

  const printedName = useSignal(signerName);
  const mediaReleaseChoice = useSignal<MediaReleaseChoice | ''>('');
  const isMinor = useSignal(false);
  const minorName = useSignal('');
  const guardianName = useSignal('');

  const isSubmitting = useSignal(false);
  const submitError = useSignal('');
  const isComplete = useSignal(false);
  const showValidation = useSignal(false);

  const hasMediaRelease = useComputed(() =>
    sections.some((s) => s.responseType === 'media-release')
  );

  const validationErrors = useComputed(() => {
    if (!showValidation.value) return {} as Record<string, string>;
    const errors: Record<string, string> = {};

    if (!printedName.value.trim()) {
      errors.printedName = 'Printed name is required';
    }

    if (hasMediaRelease.value && !mediaReleaseChoice.value) {
      errors.mediaReleaseChoice = 'Please select a photo/media release option';
    }

    if (isMinor.value) {
      if (!minorName.value.trim()) {
        errors.minorName = "Minor's name is required";
      }
      if (!guardianName.value.trim()) {
        errors.guardianName = 'Parent/guardian name is required';
      }
    }

    return errors;
  });

  const handleSubmit = useCallback(async () => {
    showValidation.value = true;

    // Check signature
    if (signatureRef.current?.isEmpty()) {
      submitError.value = 'Please sign the agreement before submitting.';
      return;
    }

    // Check guardian signature for minors
    if (isMinor.value && guardianSignatureRef.current?.isEmpty()) {
      submitError.value = 'Parent/guardian signature is required.';
      return;
    }

    // Check validation errors
    const errors = validationErrors.peek();
    if (Object.keys(errors).length > 0) {
      submitError.value = '';
      return;
    }

    // Prevent double-submit
    if (isSubmitting.value) return;
    isSubmitting.value = true;
    submitError.value = '';

    try {
      await onSubmit({
        signatureData: signatureRef.current!.toDataURL(),
        printedName: printedName.value.trim(),
        mediaReleaseChoice: mediaReleaseChoice.value as MediaReleaseChoice || undefined,
        isMinor: isMinor.value,
        minorName: isMinor.value ? minorName.value.trim() : undefined,
        guardianName: isMinor.value ? guardianName.value.trim() : undefined,
        guardianSignatureData: isMinor.value
          ? guardianSignatureRef.current?.toDataURL()
          : undefined,
      });

      isComplete.value = true;

      if (kioskMode) {
        // Reset form after 5 seconds in kiosk mode
        setTimeout(() => {
          printedName.value = '';
          mediaReleaseChoice.value = '';
          isMinor.value = false;
          minorName.value = '';
          guardianName.value = '';
          showValidation.value = false;
          isComplete.value = false;
          signatureRef.current?.clear();
          guardianSignatureRef.current?.clear();
        }, 5000);
      }
    } catch (err) {
      submitError.value = extractErrorMessage(err);
    } finally {
      isSubmitting.value = false;
    }
  }, [
    onSubmit,
    kioskMode,
    printedName,
    mediaReleaseChoice,
    isMinor,
    minorName,
    guardianName,
    isSubmitting,
    submitError,
    isComplete,
    showValidation,
    validationErrors,
  ]);

  // Success state
  if (isComplete.value) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <CheckCircleOutlineIcon
          sx={{ fontSize: 64, color: 'success.main', mb: 2 }}
        />
        <Typography variant="h5" gutterBottom>
          Agreement Signed Successfully
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Thank you, {printedName.value}. Your signed agreement has been recorded.
        </Typography>
        {kioskMode && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            This form will reset shortly for the next person.
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {templateName}
        </Typography>
        {className && (
          <Typography variant="subtitle1" color="text.secondary">
            For: {className}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          {signerEmail}
        </Typography>
      </Box>

      {/* Agreement Sections */}
      {sections.map((section) => (
        <Paper key={section.id} sx={{ p: 3, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            {section.title}
          </Typography>
          <Box
            sx={{ '& p': { mb: 1.5 }, '& ul': { pl: 3 }, '& li': { mb: 0.5 } }}
            dangerouslySetInnerHTML={{ __html: section.content }}
          />

          {/* Media Release Radio Buttons */}
          {section.responseType === 'media-release' && (
            <FormControl
              sx={{ mt: 2 }}
              error={!!validationErrors.value.mediaReleaseChoice}
            >
              <FormLabel>Select one:</FormLabel>
              <RadioGroup
                value={mediaReleaseChoice.value}
                onChange={(e) => {
                  mediaReleaseChoice.value = e.target.value as MediaReleaseChoice;
                }}
              >
                <FormControlLabel
                  value="grant"
                  control={<Radio />}
                  label="I grant permission for this photo and media release."
                />
                <FormControlLabel
                  value="grant-without-name"
                  control={<Radio />}
                  label="I grant permission for this photo and media release, but request that my (or my child's) name not be attached to any images or media used."
                />
                <FormControlLabel
                  value="deny"
                  control={<Radio />}
                  label="I do not grant this release. I request that my image (or my child's image) not be used in Maple & Spruce promotional materials."
                />
              </RadioGroup>
              {validationErrors.value.mediaReleaseChoice && (
                <FormHelperText>
                  {validationErrors.value.mediaReleaseChoice}
                </FormHelperText>
              )}
            </FormControl>
          )}
        </Paper>
      ))}

      <Divider sx={{ my: 3 }} />

      {/* Minor Toggle */}
      {supportsMinor && (
        <Box sx={{ mb: 3 }}>
          <FormControlLabel
            control={
              <Switch
                checked={isMinor.value}
                onChange={(e) => {
                  isMinor.value = e.target.checked;
                }}
              />
            }
            label="I am signing on behalf of a minor (under 18)"
          />

          {isMinor.value && (
            <Box sx={{ mt: 2, pl: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Minor's Full Name"
                value={minorName.value}
                onChange={(e) => {
                  minorName.value = e.target.value;
                }}
                error={!!validationErrors.value.minorName}
                helperText={validationErrors.value.minorName}
                fullWidth
              />
              <TextField
                label="Parent/Guardian Full Name"
                value={guardianName.value}
                onChange={(e) => {
                  guardianName.value = e.target.value;
                }}
                error={!!validationErrors.value.guardianName}
                helperText={validationErrors.value.guardianName}
                fullWidth
              />
              <SignatureCanvas
                ref={guardianSignatureRef}
                label="Parent/Guardian Signature"
                height={150}
              />
            </Box>
          )}
        </Box>
      )}

      {/* Signature Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Acknowledgment & Agreement
        </Typography>
        <Typography variant="body2" sx={{ mb: 3 }}>
          By signing below, I acknowledge that I have read and understand this
          entire agreement. I agree to be bound by all terms and conditions
          contained herein.
        </Typography>

        <SignatureCanvas
          ref={signatureRef}
          label="Your Signature"
          height={kioskMode ? 250 : 200}
        />

        <TextField
          label="Print Your Full Name"
          value={printedName.value}
          onChange={(e) => {
            printedName.value = e.target.value;
          }}
          error={!!validationErrors.value.printedName}
          helperText={validationErrors.value.printedName}
          fullWidth
          sx={{ mt: 2 }}
        />

        <TextField
          label="Date"
          value={new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
          disabled
          fullWidth
          sx={{ mt: 2 }}
        />
      </Paper>

      {/* Error */}
      {submitError.value && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {submitError.value}
        </Alert>
      )}

      {/* Submit */}
      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={handleSubmit}
        disabled={isSubmitting.value}
        sx={{ py: 1.5 }}
      >
        {isSubmitting.value ? (
          <CircularProgress size={24} color="inherit" />
        ) : (
          'Sign Agreement'
        )}
      </Button>
    </Box>
  );
}
