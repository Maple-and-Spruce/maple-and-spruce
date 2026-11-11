'use client';

/**
 * Settings card for the dollar gift cards the website sells (#309).
 *
 * The one-tap amounts on the gift card page, and the lowest and highest
 * "Other amount". The buy page shows them and `giftCards/purchaseGiftCard`
 * enforces them, so what is saved here is what can be bought. Class gift
 * certificates are switched on per class type, on the Class Categories page.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  InputAdornment,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import {
  GIFT_CARD_MAX_PRESETS,
  GIFT_CARD_SETTINGS_CEILING_CENTS,
  GIFT_CARD_SETTINGS_FLOOR_CENTS,
  formatGiftCardDollars,
  errorMessageFor,
} from '@maple/ts/domain';
import type { GiftCardAmountSettings, RequestState } from '@maple/ts/domain';
import { giftCardSettingsValidation } from '@maple/ts/validation';

export interface GiftCardSettingsCardProps {
  settingsState: RequestState<GiftCardAmountSettings>;
  isSaving: boolean;
  onSave: (settings: GiftCardAmountSettings) => Promise<unknown>;
}

interface Draft {
  presets: string[];
  min: string;
  max: string;
}

function toDraft(settings: GiftCardAmountSettings): Draft {
  return {
    presets: settings.presetCents.map((c) => String(c / 100)),
    min: String(settings.minCents / 100),
    max: String(settings.maxCents / 100),
  };
}

/** Dollars as typed to cents; NaN when it is not a number. */
function toCents(text: string): number {
  const t = text.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return Number.NaN;
  return Math.round(Number(t) * 100);
}

function fromDraft(draft: Draft): GiftCardAmountSettings {
  return {
    presetCents: draft.presets.map(toCents),
    minCents: toCents(draft.min),
    maxCents: toCents(draft.max),
  };
}

const dollarAdornment = {
  input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
  htmlInput: { inputMode: 'numeric' as const },
};

export function GiftCardSettingsCard({
  settingsState,
  isSaving,
  onSave,
}: GiftCardSettingsCardProps) {
  const [draft, setDraft] = useState<Draft>({ presets: [], min: '', max: '' });
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settingsState.status === 'success') {
      setDraft(toDraft(settingsState.data));
      setDirty(false);
    }
  }, [settingsState]);

  const change = (next: Draft) => {
    setDraft(next);
    setDirty(true);
    setSaved(false);
    setError(null);
  };

  const validation = useMemo(() => giftCardSettingsValidation(fromDraft(draft)), [draft]);
  const fieldError = (field: string): string | undefined =>
    dirty ? validation.getErrors(field)[0] : undefined;

  const save = async () => {
    setError(null);
    try {
      const next = fromDraft(draft);
      await onSave({ ...next, presetCents: [...next.presetCents].sort((a, b) => a - b) });
      setDirty(false);
      setSaved(true);
    } catch (e) {
      setError(errorMessageFor(e, 'Could not save'));
    }
  };

  const presetsError = fieldError('presetCents');

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" component="h2" gutterBottom>
          Gift cards
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          The amounts the gift card page offers. Buyers tap one of the amounts, or choose
          &quot;Other amount&quot; and type any whole-dollar amount between the lowest and the
          highest. Class gift certificates are switched on for each class type on the Class
          Categories page.
        </Typography>

        {(settingsState.status === 'idle' || settingsState.status === 'loading') && (
          <Box aria-busy="true" aria-label="Loading gift card amounts">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="text" height={48} />
            ))}
          </Box>
        )}

        {settingsState.status === 'error' && (
          <Alert severity="error">
            Could not load gift card amounts: {settingsState.error}
          </Alert>
        )}

        {settingsState.status === 'success' && (
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
                One-tap amounts
              </Typography>
              <Stack spacing={1}>
                {draft.presets.map((value, index) => (
                  <Stack key={index} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <TextField
                      size="small"
                      label={`Amount ${index + 1}`}
                      value={value}
                      onChange={(e) =>
                        change({
                          ...draft,
                          presets: draft.presets.map((p, i) => (i === index ? e.target.value : p)),
                        })
                      }
                      slotProps={dollarAdornment}
                      sx={{ width: 180 }}
                    />
                    <Tooltip title="Stop offering this amount">
                      <span>
                        <IconButton
                          aria-label={`Remove amount ${index + 1}`}
                          disabled={draft.presets.length <= 1}
                          onClick={() =>
                            change({ ...draft, presets: draft.presets.filter((_, i) => i !== index) })
                          }
                        >
                          <DeleteOutlineIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                ))}
                <Box>
                  <Button
                    onClick={() => change({ ...draft, presets: [...draft.presets, ''] })}
                    disabled={draft.presets.length >= GIFT_CARD_MAX_PRESETS}
                  >
                    Add an amount
                  </Button>
                </Box>
                {presetsError && (
                  <Typography variant="body2" color="error" role="alert">
                    {presetsError}
                  </Typography>
                )}
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
                &quot;Other amount&quot; limits
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  size="small"
                  label="Lowest amount"
                  value={draft.min}
                  onChange={(e) => change({ ...draft, min: e.target.value })}
                  error={Boolean(fieldError('minCents'))}
                  helperText={
                    fieldError('minCents') ??
                    `At least ${formatGiftCardDollars(GIFT_CARD_SETTINGS_FLOOR_CENTS)}`
                  }
                  slotProps={dollarAdornment}
                />
                <TextField
                  size="small"
                  label="Highest amount"
                  value={draft.max}
                  onChange={(e) => change({ ...draft, max: e.target.value })}
                  error={Boolean(fieldError('maxCents'))}
                  helperText={
                    fieldError('maxCents') ??
                    `At most ${formatGiftCardDollars(GIFT_CARD_SETTINGS_CEILING_CENTS)}`
                  }
                  slotProps={dollarAdornment}
                />
              </Stack>
            </Box>

            {error && <Alert severity="error">{error}</Alert>}
            {saved && !dirty && <Alert severity="success">Saved.</Alert>}

            <Box>
              <Button
                variant="contained"
                onClick={save}
                disabled={!dirty || validation.hasErrors() || isSaving}
              >
                {isSaving ? 'Saving…' : 'Save gift card amounts'}
              </Button>
            </Box>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
