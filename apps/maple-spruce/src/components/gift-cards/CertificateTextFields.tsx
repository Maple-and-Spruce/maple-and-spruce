'use client';

import { Stack, TextField } from '@mui/material';
import {
  GIFT_CARD_MESSAGE_MAX_LENGTH,
  GIFT_CARD_NAME_MAX_LENGTH,
} from '@maple/ts/domain';

export interface CertificateText {
  recipientName: string;
  fromName: string;
  message: string;
}

export const EMPTY_CERTIFICATE_TEXT: CertificateText = {
  recipientName: '',
  fromName: '',
  message: '',
};

interface CertificateTextFieldsProps {
  value: CertificateText;
  onChange: (value: CertificateText) => void;
  errors: Partial<Record<keyof CertificateText, string>>;
  disabled?: boolean;
}

/** The optional To, From and note, as they go on the certificate. */
export function CertificateTextFields({
  value,
  onChange,
  errors,
  disabled,
}: CertificateTextFieldsProps) {
  const set = (field: keyof CertificateText) => (text: string) =>
    onChange({ ...value, [field]: text });
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="To (optional)"
          value={value.recipientName}
          onChange={(e) => set('recipientName')(e.target.value)}
          error={Boolean(errors.recipientName)}
          helperText={errors.recipientName}
          disabled={disabled}
          slotProps={{ htmlInput: { maxLength: GIFT_CARD_NAME_MAX_LENGTH } }}
          fullWidth
        />
        <TextField
          label="From (optional)"
          value={value.fromName}
          onChange={(e) => set('fromName')(e.target.value)}
          error={Boolean(errors.fromName)}
          helperText={errors.fromName}
          disabled={disabled}
          slotProps={{ htmlInput: { maxLength: GIFT_CARD_NAME_MAX_LENGTH } }}
          fullWidth
        />
      </Stack>
      <TextField
        label="Note (optional)"
        value={value.message}
        onChange={(e) => set('message')(e.target.value)}
        error={Boolean(errors.message)}
        helperText={errors.message ?? 'Kept with the card. Nothing is emailed.'}
        disabled={disabled}
        multiline
        minRows={2}
        slotProps={{ htmlInput: { maxLength: GIFT_CARD_MESSAGE_MAX_LENGTH } }}
        fullWidth
      />
    </Stack>
  );
}
