'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  InputAdornment,
  MenuItem,
  Radio,
  RadioGroup,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  GIFT_CERTIFICATE_BATCH_MAX,
  ISSUED_GIFT_CARD_MAX_CENTS,
  ISSUED_GIFT_CARD_MIN_CENTS,
  isGiftCertificateCategory,
  type ClassCategory,
  type GiftCertificateDesignId,
  type RequestState,
} from '@maple/ts/domain';
import type {
  PrintGiftCertificatesRequest,
  PrintGiftCertificatesResponse,
} from '@maple/ts/firebase/api-types';
import { printGiftCertificatesValidation } from '@maple/ts/validation';
import { GIFT_CERTIFICATE_DESIGN_LIST } from './certificate-designs';
import { formatGiftCardMoney, parseWholeDollars } from './format';

interface PrintGiftCertificatesDialogProps {
  open: boolean;
  categoriesState: RequestState<ClassCategory[]>;
  onClose: () => void;
  /** Makes the batch in Square, with no money on the cards. */
  onPrint: (request: PrintGiftCertificatesRequest) => Promise<PrintGiftCertificatesResponse>;
  /** Called with a batch ready to print, so the page can open the print view. */
  onPrinted: (response: PrintGiftCertificatesResponse) => void;
  /** Defaults to a random key per opening; stories pass a fixed one. */
  makeRequestKey?: () => string;
}

type Kind = 'amount' | 'class';

interface FormValues {
  design: GiftCertificateDesignId;
  kind: Kind;
  dollars: string;
  classCategoryId: string;
  quantity: string;
}

const EMPTY_FORM: FormValues = {
  design: 'stained-glass',
  kind: 'amount',
  dollars: '',
  classCategoryId: '',
  quantity: '',
};

type SubmitState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  /** Some certificates were made; the rest can be retried with the same key. */
  | { status: 'partial'; data: PrintGiftCertificatesResponse };

const MIN = ISSUED_GIFT_CARD_MIN_CENTS / 100;
const MAX = ISSUED_GIFT_CARD_MAX_CENTS / 100;

/** A fresh key for each opening; the batch id and Square keys come from it. */
export function newCertificateBatchKey(): string {
  return `print-${crypto.randomUUID()}`;
}

function toRequest(values: FormValues, idempotencyKey: string): PrintGiftCertificatesRequest {
  const quantityText = values.quantity.trim();
  const quantity = /^\d+$/.test(quantityText) ? Number(quantityText) : Number.NaN;
  const common = { quantity, design: values.design, idempotencyKey };
  return values.kind === 'class'
    ? { ...common, kind: 'class', classCategoryId: values.classCategoryId }
    : { ...common, kind: 'amount', amountCents: parseWholeDollars(values.dollars) };
}

/** The first message per field. */
function fieldErrors(request: PrintGiftCertificatesRequest): Record<string, string> {
  const errors = printGiftCertificatesValidation(request).getErrors();
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(errors)) {
    if (messages.length > 0) out[field] = messages[0];
  }
  return out;
}

/** Only class types with certificates switched on and priced, with their price. */
function CertificateClassTypeField({
  categoriesState,
  value,
  onChange,
  error,
  disabled,
}: {
  categoriesState: RequestState<ClassCategory[]>;
  value: string;
  onChange: (id: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  if (categoriesState.status === 'idle' || categoriesState.status === 'loading') {
    return (
      <Skeleton variant="rounded" height={56} aria-busy="true" aria-label="Loading class types" />
    );
  }
  if (categoriesState.status === 'error') {
    return (
      <Alert severity="error">Couldn&apos;t load the class types: {categoriesState.error}</Alert>
    );
  }
  const types = categoriesState.data.filter(isGiftCertificateCategory);
  if (types.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary">
        No class type has gift certificates switched on. Switch them on and set
        a price in Settings, then come back.
      </Typography>
    );
  }
  return (
    <TextField
      select
      label="Class type"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={Boolean(error)}
      helperText={error ?? 'Each certificate says the price set in Settings.'}
      disabled={disabled}
      required
      fullWidth
    >
      {types.map((category) => (
        <MenuItem key={category.id} value={category.id}>
          {category.name}, {formatGiftCardMoney(category.giftCertificatePriceCents ?? 0)}
        </MenuItem>
      ))}
    </TextField>
  );
}

/**
 * Print a batch of gift certificates (#314, #332). Each one is a real Square
 * card with a short MAPLE code, made with no money on it. The register loads
 * it when it is sold: Gift Cards, Check Balance, scan or type the code, load
 * the amount, add the customer, charge.
 */
export function PrintGiftCertificatesDialog({
  open,
  categoriesState,
  onClose,
  onPrint,
  onPrinted,
  makeRequestKey = newCertificateBatchKey,
}: PrintGiftCertificatesDialogProps) {
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [requestKey, setRequestKey] = useState(makeRequestKey);
  const [showErrors, setShowErrors] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });

  // Each opening is a new batch: a fresh form and a fresh key.
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
  // Once Square has made part of a batch, the batch is fixed: only a retry.
  const locked = busy || submitState.status === 'partial';
  const set = <K extends keyof FormValues>(field: K, value: FormValues[K]) =>
    setValues((v) => ({ ...v, [field]: value }));

  const submit = async () => {
    setShowErrors(true);
    if (Object.keys(fieldErrors(request)).length > 0) return;
    setSubmitState({ status: 'loading' });
    try {
      const data = await onPrint(request);
      if (data.error) {
        setSubmitState({ status: 'partial', data });
      } else {
        onPrinted(data);
      }
    } catch (error) {
      setSubmitState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Could not make the certificates',
      });
    }
  };

  const close = () => {
    if (!busy) onClose();
  };

  const quantity = Number.isInteger(request.quantity) ? request.quantity : 0;

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>Print gift certificates</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          These cards have no money on them until they are sold at the register.
          To sell one: Gift Cards, Check Balance, scan or type the code, load the
          amount, add the customer, charge.
        </Alert>
        <Stack spacing={2.5}>
          <FormControl disabled={locked}>
            <FormLabel id="print-design-label">Design</FormLabel>
            <RadioGroup
              aria-labelledby="print-design-label"
              value={values.design}
              onChange={(e) => set('design', e.target.value as GiftCertificateDesignId)}
            >
              {GIFT_CERTIFICATE_DESIGN_LIST.map((design) => (
                <FormControlLabel
                  key={design.id}
                  value={design.id}
                  control={<Radio />}
                  label={
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 0.5 }}>
                      <Box
                        component="img"
                        src={design.photoSrc}
                        alt=""
                        sx={{
                          width: 48,
                          height: 62,
                          objectFit: 'contain',
                          bgcolor: '#E5E7DF',
                          borderRadius: 0.5,
                        }}
                      />
                      <span>{design.name}</span>
                    </Stack>
                  }
                />
              ))}
            </RadioGroup>
          </FormControl>

          <FormControl disabled={locked}>
            <FormLabel id="print-kind-label">What each one is for</FormLabel>
            <RadioGroup
              row
              aria-labelledby="print-kind-label"
              value={values.kind}
              onChange={(e) => set('kind', e.target.value as Kind)}
            >
              <FormControlLabel value="amount" control={<Radio />} label="A dollar amount" />
              <FormControlLabel value="class" control={<Radio />} label="A class" />
            </RadioGroup>
          </FormControl>

          {values.kind === 'class' ? (
            <CertificateClassTypeField
              categoriesState={categoriesState}
              value={values.classCategoryId}
              onChange={(id) => set('classCategoryId', id)}
              error={errors['classCategoryId']}
              disabled={locked}
            />
          ) : (
            <TextField
              label="Amount on each"
              value={values.dollars}
              onChange={(e) => set('dollars', e.target.value)}
              error={Boolean(errors['amountCents'])}
              helperText={errors['amountCents'] ?? `Whole dollars, $${MIN} to $${MAX}.`}
              disabled={locked}
              required
              slotProps={{
                input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
                htmlInput: { inputMode: 'numeric' },
              }}
            />
          )}

          <TextField
            label="How many"
            value={values.quantity}
            onChange={(e) => set('quantity', e.target.value)}
            error={Boolean(errors['quantity'])}
            helperText={
              errors['quantity'] ?? `1 to ${GIFT_CERTIFICATE_BATCH_MAX}. One per page.`
            }
            disabled={locked}
            required
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />

          {submitState.status === 'error' && (
            <Alert severity="error">
              Couldn&apos;t make the certificates: {submitState.error}
            </Alert>
          )}
          {submitState.status === 'partial' && (
            <Alert severity="warning">
              {submitState.data.error} Or print the {submitState.data.cards.length} that
              are ready now.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>
          Cancel
        </Button>
        {submitState.status === 'partial' && (
          <Button onClick={() => onPrinted(submitState.data)}>
            Print the {submitState.data.cards.length} ready
          </Button>
        )}
        <Button variant="contained" onClick={submit} disabled={busy}>
          {busy
            ? 'Making the cards…'
            : submitState.status === 'partial'
              ? 'Try again for the rest'
              : quantity > 0
                ? `Make ${quantity} and print`
                : 'Make and print'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
