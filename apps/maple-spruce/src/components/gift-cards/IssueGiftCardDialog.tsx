'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  InputAdornment,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  ISSUED_GIFT_CARD_MAX_CENTS,
  ISSUED_GIFT_CARD_MIN_CENTS,
  ISSUED_GIFT_CARD_REASON_MAX_LENGTH,
  type ClassCategory,
  type RequestState,
} from '@maple/ts/domain';
import type {
  IssueGiftCardRequest,
  IssueGiftCardResponse,
} from '@maple/ts/firebase/api-types';
import { issueGiftCardValidation } from '@maple/ts/validation';
import { ClassTypeField } from './ClassTypeField';
import {
  CertificateTextFields,
  EMPTY_CERTIFICATE_TEXT,
  type CertificateText,
} from './CertificateTextFields';
import { GiftCardCodeReveal } from './GiftCardCodeReveal';
import { formatGiftCardMoney, newGiftCardRequestKey, parseWholeDollars } from './format';

interface IssueGiftCardDialogProps {
  open: boolean;
  categoriesState: RequestState<ClassCategory[]>;
  onClose: () => void;
  /** Makes and loads the card in Square. */
  onIssue: (request: IssueGiftCardRequest) => Promise<IssueGiftCardResponse>;
  /** Called once the card exists, so the page can refresh its list. */
  onIssued?: (response: IssueGiftCardResponse) => void;
  onRevealCode: (id: string) => Promise<string>;
  copyToClipboard?: (text: string) => Promise<void>;
  /** Defaults to a random key per opening; stories pass a fixed one. */
  makeRequestKey?: () => string;
}

type Kind = 'amount' | 'class';

interface FormValues extends CertificateText {
  kind: Kind;
  dollars: string;
  classCategoryId: string;
  reason: string;
  code: string;
}

const EMPTY_FORM: FormValues = {
  kind: 'amount',
  dollars: '',
  classCategoryId: '',
  reason: '',
  code: '',
  ...EMPTY_CERTIFICATE_TEXT,
};

type SubmitState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: IssueGiftCardResponse };

const MIN = ISSUED_GIFT_CARD_MIN_CENTS / 100;
const MAX = ISSUED_GIFT_CARD_MAX_CENTS / 100;

function toRequest(values: FormValues, idempotencyKey: string): IssueGiftCardRequest {
  const cents = parseWholeDollars(values.dollars);
  const common = {
    reason: values.reason.trim(),
    code: values.code.trim() || undefined,
    recipientName: values.recipientName.trim() || undefined,
    fromName: values.fromName.trim() || undefined,
    message: values.message.trim() || undefined,
    idempotencyKey,
  };
  return values.kind === 'class'
    ? { ...common, kind: 'class', classCategoryId: values.classCategoryId, valueCents: cents }
    : { ...common, kind: 'amount', amountCents: cents };
}

/** The first message per field, keyed the way the form shows them. */
function fieldErrors(request: IssueGiftCardRequest): Record<string, string> {
  const errors = issueGiftCardValidation(request).getErrors();
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(errors)) {
    if (messages.length > 0) out[field] = messages[0];
  }
  // One dollars box serves both kinds.
  if (out['valueCents']) out['amountCents'] = out['valueCents'];
  return out;
}

/**
 * Give a gift card for free: a raffle prize, a thank-you, a make-good. The
 * studio makes and loads the card in Square without a sale, so no money comes
 * in, and its value comes out of the studio's pocket when it is spent.
 */
export function IssueGiftCardDialog({
  open,
  categoriesState,
  onClose,
  onIssue,
  onIssued,
  onRevealCode,
  copyToClipboard,
  makeRequestKey = newGiftCardRequestKey,
}: IssueGiftCardDialogProps) {
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [requestKey, setRequestKey] = useState(makeRequestKey);
  const [showErrors, setShowErrors] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });

  // Each opening is a new card: a fresh form and a fresh key.
  useEffect(() => {
    if (!open) return;
    setValues(EMPTY_FORM);
    setRequestKey(makeRequestKey());
    setShowErrors(false);
    setSubmitState({ status: 'idle' });
  }, [open, makeRequestKey]);

  const request = toRequest(values, requestKey);
  const errors = showErrors ? fieldErrors(request) : {};
  const busy = submitState.status === 'loading';
  const set = <K extends keyof FormValues>(field: K, value: FormValues[K]) =>
    setValues((v) => ({ ...v, [field]: value }));

  const submit = async () => {
    setShowErrors(true);
    if (Object.keys(fieldErrors(request)).length > 0) return;
    setSubmitState({ status: 'loading' });
    try {
      const data = await onIssue(request);
      setSubmitState({ status: 'success', data });
      onIssued?.(data);
    } catch (error) {
      setSubmitState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Could not make the gift card',
      });
    }
  };

  const close = () => {
    if (!busy) onClose();
  };

  if (submitState.status === 'success') {
    const issued = submitState.data;
    return (
      <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
        <DialogTitle>Gift card ending {issued.last4} is ready</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ mb: 2 }}>
            {formatGiftCardMoney(issued.valueCents)} is on it
            {issued.kind === 'class' && issued.className
              ? `, as a class certificate for ${issued.className}`
              : ''}
            . It is in the list now, marked as given free.
          </Typography>
          {!issued.recorded && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              The card works, but the note of why it was given could not be
              saved. Tell David the last 4 digits, {issued.last4}.
            </Alert>
          )}
          <GiftCardCodeReveal
            key={issued.giftCardId}
            giftCardId={issued.giftCardId}
            onRevealCode={onRevealCode}
            copyToClipboard={copyToClipboard}
          />
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={close}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>Give a free gift card</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          This card is free. Nobody pays for it: Square makes the card and puts
          the money on it, and when it is spent, the studio covers it.
        </Alert>
        <Stack spacing={2.5}>
          <FormControl disabled={busy}>
            <FormLabel id="issue-kind-label">What to give</FormLabel>
            <RadioGroup
              row
              aria-labelledby="issue-kind-label"
              value={values.kind}
              onChange={(e) => set('kind', e.target.value as Kind)}
            >
              <FormControlLabel value="amount" control={<Radio />} label="A dollar amount" />
              <FormControlLabel value="class" control={<Radio />} label="A class" />
            </RadioGroup>
          </FormControl>

          {values.kind === 'class' && (
            <ClassTypeField
              categoriesState={categoriesState}
              value={values.classCategoryId}
              onChange={(id) => set('classCategoryId', id)}
              error={errors['classCategoryId']}
              disabled={busy}
            />
          )}

          <TextField
            label={values.kind === 'class' ? 'Value of the class' : 'Amount'}
            value={values.dollars}
            onChange={(e) => set('dollars', e.target.value)}
            error={Boolean(errors['amountCents'])}
            helperText={
              errors['amountCents'] ??
              (values.kind === 'class'
                ? `What goes on the card, usually the class price. Whole dollars, $${MIN} to $${MAX}.`
                : `Whole dollars, $${MIN} to $${MAX}.`)
            }
            disabled={busy}
            required
            slotProps={{
              input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
              htmlInput: { inputMode: 'numeric' },
            }}
          />

          <TextField
            label="Why is the studio giving it?"
            value={values.reason}
            onChange={(e) => set('reason', e.target.value)}
            error={Boolean(errors['reason'])}
            helperText={
              errors['reason'] ?? 'For example: raffle prize at the fall fair. Kept with the card.'
            }
            disabled={busy}
            required
            slotProps={{ htmlInput: { maxLength: ISSUED_GIFT_CARD_REASON_MAX_LENGTH } }}
          />

          <TextField
            label="Custom code (optional)"
            value={values.code}
            onChange={(e) => set('code', e.target.value)}
            error={Boolean(errors['code'])}
            helperText={
              errors['code'] ??
              'Leave empty for a Square number. Or 8 to 20 letters and numbers, like FERN REEL HARP 4821.'
            }
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 30, autoCapitalize: 'characters', spellCheck: false } }}
          />

          <CertificateTextFields
            value={values}
            onChange={(text) => setValues((v) => ({ ...v, ...text }))}
            errors={errors}
            disabled={busy}
          />

          {submitState.status === 'error' && (
            <Alert severity="error">
              Couldn&apos;t make the gift card: {submitState.error}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={busy}>
          {busy ? 'Making the card…' : 'Give gift card'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
