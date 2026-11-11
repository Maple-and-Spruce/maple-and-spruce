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
import { errorMessageFor, giftCardEndingText, type GiftCardSummary } from '@maple/ts/domain';
import type {
  CloseGiftCardRequest,
  CloseGiftCardResponse,
} from '@maple/ts/firebase/api-types';
import { formatGiftCardMoney } from './format';

/** What to do with the card: refund it (bought online) or turn it off. */
export type CloseGiftCardMode = CloseGiftCardRequest['mode'];

interface CloseGiftCardDialogProps {
  /** The card. Null keeps the dialog closed. */
  card: GiftCardSummary | null;
  mode: CloseGiftCardMode;
  /**
   * What will be taken off, when a refund or turn-off was already started and
   * the card may already be empty. Defaults to the card's balance.
   */
  amountCents?: number;
  /**
   * Refund only: Square already made the refund on an earlier try, which
   * stopped before it was recorded done. Finishing moves no money.
   */
  refundMade?: boolean;
  onClose: () => void;
  onCloseCard: (request: CloseGiftCardRequest) => Promise<CloseGiftCardResponse>;
  /** After it is done: refresh the list and the card. */
  onDone: (result: CloseGiftCardResponse) => void;
}

type SubmitState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: CloseGiftCardResponse };

/**
 * Refund a card bought online, or turn any card off. Katie confirms first.
 * A refund leaves the card at $0 rather than turning it off: Square lets an
 * app turn a card off only as "suspicious activity". "Try again" after a
 * failure finishes the same refund: the server keys every step by the card,
 * so no money moves twice.
 */
export function CloseGiftCardDialog({
  card,
  mode,
  amountCents,
  refundMade = false,
  onClose,
  onCloseCard,
  onDone,
}: CloseGiftCardDialogProps) {
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const open = card !== null;

  useEffect(() => {
    if (open) setSubmitState({ status: 'idle' });
  }, [open]);

  const busy = submitState.status === 'loading';
  const ending = giftCardEndingText(card?.last4);
  const amount = formatGiftCardMoney(amountCents ?? card?.balanceCents ?? 0);
  const refund = mode === 'refund';
  /** Deactivate: what is still on the card to take off. A retry may find it empty. */
  const onCard = card?.balanceCents ?? 0;

  const submit = async () => {
    if (!card) return;
    setSubmitState({ status: 'loading' });
    try {
      const data = await onCloseCard({ giftCardId: card.id, mode });
      setSubmitState({ status: 'success', data });
    } catch (error) {
      setSubmitState({
        status: 'error',
        error: errorMessageFor(error, refund ? 'Could not refund the card' : 'Could not turn the card off'),
      });
    }
  };

  const close = () => {
    if (busy) return;
    if (submitState.status === 'success') onDone(submitState.data);
    else onClose();
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>
        {refund ? 'Refund' : 'Turn off'} card{ending}
      </DialogTitle>
      <DialogContent dividers>
        {submitState.status === 'success' ? (
          <Stack spacing={2}>
            <Alert severity="success">
              {successText(submitState.data)}
            </Alert>
            {submitState.data.warning && (
              <Alert severity="warning">{submitState.data.warning}</Alert>
            )}
            {refund && (
              <Typography variant="body2">
                The refund takes a few days to reach the buyer&apos;s bank.
              </Typography>
            )}
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Typography>
              {refund
                ? refundMade
                  ? `The ${amount} refund was already made. Finish it?`
                  : `Refund the ${amount} left on this card to the card that bought it?`
                : onCard > 0
                  ? `Turn this card off and take the ${formatGiftCardMoney(onCard)} off it?`
                  : 'Turn this card off?'}
            </Typography>
            <Alert severity={refund ? 'info' : 'warning'}>
              {refund
                ? 'The gift card is left at $0, so nothing more can be spent from it. If some of it was spent, only what is left is refunded.'
                : 'The gift card stops working for good. No money goes back to anyone from here: if it was paid for at the register, refund it there or in Square.'}
            </Alert>
            {submitState.status === 'error' && (
              <Alert severity="error">
                {refund ? 'Couldn’t refund the card' : 'Couldn’t turn the card off'}:{' '}
                {submitState.error}
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
            <Button variant="contained" color="error" onClick={submit} disabled={busy}>
              {busy && (refund ? 'Refunding…' : 'Turning off…')}
              {!busy && submitState.status === 'error' && 'Try again'}
              {!busy &&
                submitState.status !== 'error' &&
                (refund ? (refundMade ? 'Finish' : `Refund ${amount}`) : 'Turn off card')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

/** What the success message says. "No longer works" only once Square turned it off. */
function successText(result: CloseGiftCardResponse): string {
  if (result.mode === 'refund') {
    return `Refunded ${formatGiftCardMoney(result.refundedCents)} to the card that paid for it. The gift card now holds $0.`;
  }
  const tookOff =
    result.amountCents > 0 ? `Took ${formatGiftCardMoney(result.amountCents)} off. ` : '';
  return result.warning
    ? `${tookOff}The gift card holds $0.`
    : `${tookOff}The gift card no longer works.`;
}
