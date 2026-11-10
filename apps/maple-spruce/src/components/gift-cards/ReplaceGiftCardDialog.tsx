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
import { giftCardEndingText, type GiftCardSummary } from '@maple/ts/domain';
import type {
  ReplaceGiftCardRequest,
  ReplaceGiftCardResponse,
} from '@maple/ts/firebase/api-types';
import { GiftCardCodeReveal } from './GiftCardCodeReveal';
import { formatGiftCardMoney, newGiftCardRequestKey } from './format';

interface ReplaceGiftCardDialogProps {
  /** The lost card. Null keeps the dialog closed. */
  card: GiftCardSummary | null;
  onClose: () => void;
  /** Moves the balance to a new card and turns the lost one off. */
  onReplace: (request: ReplaceGiftCardRequest) => Promise<ReplaceGiftCardResponse>;
  /** After a replacement: refresh the list and open the new card. */
  onReplaced: (result: ReplaceGiftCardResponse) => void;
  /** Fetches the new card's full code. The server logs each call. */
  onRevealCode: (id: string) => Promise<string>;
  /** Defaults to the browser clipboard; stories pass a spy. */
  copyToClipboard?: (text: string) => Promise<void>;
  /** One key per opening; stories pass a fixed one. */
  makeRequestKey?: () => string;
}

type SubmitState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: ReplaceGiftCardResponse };

/**
 * Replace a lost card (#332). Katie confirms, then the balance moves to a new
 * card and the lost one stops working. The key is made once per opening, so
 * "Try again" after a failure finishes the same replacement instead of
 * starting a second one.
 */
export function ReplaceGiftCardDialog({
  card,
  onClose,
  onReplace,
  onReplaced,
  onRevealCode,
  copyToClipboard,
  makeRequestKey = newGiftCardRequestKey,
}: ReplaceGiftCardDialogProps) {
  const [requestKey, setRequestKey] = useState(makeRequestKey);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const open = card !== null;

  useEffect(() => {
    if (!open) return;
    setRequestKey(makeRequestKey());
    setSubmitState({ status: 'idle' });
  }, [open, makeRequestKey]);

  const busy = submitState.status === 'loading';

  const replace = async () => {
    if (!card) return;
    setSubmitState({ status: 'loading' });
    try {
      const data = await onReplace({ giftCardId: card.id, idempotencyKey: requestKey });
      setSubmitState({ status: 'success', data });
    } catch (error) {
      setSubmitState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Could not replace the card',
      });
    }
  };

  const close = () => {
    if (busy) return;
    if (submitState.status === 'success') onReplaced(submitState.data);
    else onClose();
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>Replace lost card{card ? giftCardEndingText(card.last4) : ''}</DialogTitle>
      <DialogContent dividers>
        {submitState.status === 'success' ? (
          <Stack spacing={2}>
            <Alert severity="success">
              New card ending {submitState.data.last4} holds{' '}
              {formatGiftCardMoney(submitState.data.balanceCents)}. The card
              {giftCardEndingText(card?.last4)} no longer works.
            </Alert>
            {submitState.data.warning && (
              <Alert severity="warning">{submitState.data.warning}</Alert>
            )}
            <Typography variant="body2">
              Show the new code to write or print a fresh certificate for the customer.
            </Typography>
            <GiftCardCodeReveal
              key={submitState.data.newGiftCardId}
              giftCardId={submitState.data.newGiftCardId}
              onRevealCode={onRevealCode}
              copyToClipboard={copyToClipboard}
            />
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Typography>
              Move the {card ? formatGiftCardMoney(card.balanceCents) : ''} on this card
              to a new card?
            </Typography>
            <Alert severity="warning">
              The card{giftCardEndingText(card?.last4)} will stop working for good. Anyone who
              finds it will not be able to spend it. Only do this when the customer
              has lost it.
            </Alert>
            {submitState.status === 'error' && (
              <Alert severity="error">
                Couldn&apos;t replace the card: {submitState.error}
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {submitState.status === 'success' ? (
          <Button variant="contained" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="contained" color="error" onClick={replace} disabled={busy}>
              {busy && 'Replacing…'}
              {!busy && submitState.status === 'error' && 'Try again'}
              {!busy && submitState.status !== 'error' && 'Replace card'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
