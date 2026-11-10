'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import type {
  ClassCategory,
  GiftCardSummary,
  RequestState,
} from '@maple/ts/domain';
import type {
  MarkClassCertificateRequest,
  MarkClassCertificateResponse,
} from '@maple/ts/firebase/api-types';
import { giftCardEndingText } from '@maple/ts/domain';
import { markClassCertificateValidation } from '@maple/ts/validation';
import { ClassTypeField } from './ClassTypeField';
import {
  CertificateTextFields,
  EMPTY_CERTIFICATE_TEXT,
  type CertificateText,
} from './CertificateTextFields';

interface MarkClassCertificateDialogProps {
  /** The card to mark; the dialog is open while it is set. */
  card: GiftCardSummary | null;
  categoriesState: RequestState<ClassCategory[]>;
  onClose: () => void;
  onSubmit: (
    request: MarkClassCertificateRequest
  ) => Promise<MarkClassCertificateResponse>;
  /** Called after the record is saved, so the page can refresh. */
  onDone: (response: MarkClassCertificateResponse) => void;
}

type SubmitState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: string };

/**
 * Make a card sold at the register a class certificate: choose the class type
 * it is for. Only our record changes; the card, its balance and its code stay
 * the same in Square.
 */
export function MarkClassCertificateDialog({
  card,
  categoriesState,
  onClose,
  onSubmit,
  onDone,
}: MarkClassCertificateDialogProps) {
  const [classCategoryId, setClassCategoryId] = useState('');
  const [text, setText] = useState<CertificateText>(EMPTY_CERTIFICATE_TEXT);
  const [showErrors, setShowErrors] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });

  useEffect(() => {
    if (!card) return;
    setClassCategoryId('');
    setText(EMPTY_CERTIFICATE_TEXT);
    setShowErrors(false);
    setSubmitState({ status: 'idle' });
  }, [card]);

  const request: MarkClassCertificateRequest = {
    giftCardId: card?.id ?? '',
    classCategoryId,
    recipientName: text.recipientName.trim() || undefined,
    fromName: text.fromName.trim() || undefined,
    message: text.message.trim() || undefined,
  };
  const validation = markClassCertificateValidation(request);
  const errors: Record<string, string> = {};
  if (showErrors) {
    for (const [field, messages] of Object.entries(validation.getErrors())) {
      if (messages.length > 0) errors[field] = messages[0];
    }
  }
  const busy = submitState.status === 'loading';

  const submit = async () => {
    setShowErrors(true);
    if (validation.hasErrors()) return;
    setSubmitState({ status: 'loading' });
    try {
      const response = await onSubmit(request);
      setSubmitState({ status: 'idle' });
      onDone(response);
    } catch (error) {
      setSubmitState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Could not save it',
      });
    }
  };

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Dialog open={card !== null} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>
        Make card{giftCardEndingText(card?.last4)} a class certificate
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2 }}>
          For a card sold at the register as a gift for a class. Choose the
          class type. It is worth what was put on the card when it was sold.
          Nothing changes in Square: the balance and the code stay the same.
        </Typography>
        <Stack spacing={2.5}>
          <ClassTypeField
            categoriesState={categoriesState}
            value={classCategoryId}
            onChange={setClassCategoryId}
            error={errors['classCategoryId']}
            disabled={busy}
          />
          <CertificateTextFields
            value={text}
            onChange={setText}
            errors={errors}
            disabled={busy}
          />
          {submitState.status === 'error' && (
            <Alert severity="error">
              Couldn&apos;t make it a class certificate: {submitState.error}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : 'Make it a class certificate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
