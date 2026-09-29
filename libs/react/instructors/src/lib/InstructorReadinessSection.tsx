'use client';

/**
 * Contractor readiness: what has been done to clear a contract instructor to
 * teach. Admin-only. Nothing here blocks saving — an instructor can be added
 * before their paperwork is back, and the class form warns instead.
 */
import {
  Alert,
  Box,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import {
  INSTRUCTOR_PAYMENT_SETUP_METHODS,
  INSTRUCTOR_PAYMENT_SETUP_METHOD_LABELS,
  describeMissingReadiness,
  instructorReadiness,
  type InstructorPaymentSetupMethod,
} from '@maple/ts/domain';
import {
  readinessFromFormValues,
  type ReadinessFormValues,
} from './readiness-form';

export interface InstructorReadinessSectionProps {
  values: ReadinessFormValues;
  onChange: (patch: Partial<ReadinessFormValues>) => void;
  /** First validation message for a field, keyed by the Vest field name. */
  getFieldError?: (field: string) => string | null;
}

function ItemHeading({ children }: { children: string }) {
  return (
    <Typography variant="subtitle2" component="h4" sx={{ mt: 1 }}>
      {children}
    </Typography>
  );
}

export function InstructorReadinessSection({
  values,
  onChange,
  getFieldError = () => null,
}: InstructorReadinessSectionProps) {
  const status = instructorReadiness(readinessFromFormValues(values));

  return (
    <Box
      component="section"
      aria-labelledby="instructor-readiness-heading"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        p: 2,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
      }}
    >
      <Typography id="instructor-readiness-heading" variant="subtitle1" component="h3">
        Cleared to teach
      </Typography>

      <FormControlLabel
        control={
          <Switch
            checked={values.isContractor}
            onChange={(e) => onChange({ isContractor: e.target.checked })}
          />
        }
        label="Paid contractor (1099)"
      />
      <FormHelperText sx={{ mt: -1 }}>
        Contract instructors need a signed agreement, a background check and
        payment setup before teaching. Leave off for staff and unpaid
        instructors.
      </FormHelperText>

      {values.isContractor && (
        <>
          {status.kind === 'ready' ? (
            <Alert severity="success">Ready to teach.</Alert>
          ) : status.kind === 'not-ready' ? (
            <Alert severity="warning">
              Not ready: missing {describeMissingReadiness(status.missing)}.
              Classes can still be scheduled.
            </Alert>
          ) : null}

          <ItemHeading>Contractor agreement</ItemHeading>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="Date signed"
              type="date"
              value={values.agreementSignedOn}
              onChange={(e) => onChange({ agreementSignedOn: e.target.value })}
              error={!!getFieldError('agreementSignedOn')}
              helperText={getFieldError('agreementSignedOn')}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: '0 0 180px' }}
            />
            <TextField
              label="Signed copy"
              value={values.agreementReference}
              onChange={(e) => onChange({ agreementReference: e.target.value })}
              error={!!getFieldError('agreementReference')}
              helperText={
                getFieldError('agreementReference') ||
                'Optional: a link, or where the paper copy is'
              }
              sx={{ flex: '1 1 200px' }}
            />
          </Box>

          <ItemHeading>Background check</ItemHeading>
          <TextField
            label="Date cleared"
            type="date"
            value={values.backgroundCheckClearedOn}
            onChange={(e) => onChange({ backgroundCheckClearedOn: e.target.value })}
            error={!!getFieldError('backgroundCheckClearedOn')}
            helperText={getFieldError('backgroundCheckClearedOn')}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 180 }}
          />

          <ItemHeading>Payment setup</ItemHeading>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="Date completed"
              type="date"
              value={values.paymentSetupCompletedOn}
              onChange={(e) => onChange({ paymentSetupCompletedOn: e.target.value })}
              error={!!getFieldError('paymentSetupCompletedOn')}
              helperText={getFieldError('paymentSetupCompletedOn')}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: '0 0 180px' }}
            />
            <FormControl
              sx={{ flex: '1 1 200px' }}
              error={!!getFieldError('paymentSetupMethod')}
            >
              <InputLabel id="payment-setup-method-label">How they're paid</InputLabel>
              <Select
                labelId="payment-setup-method-label"
                id="payment-setup-method"
                value={values.paymentSetupMethod}
                label="How they're paid"
                onChange={(e) =>
                  onChange({
                    paymentSetupMethod: e.target.value as InstructorPaymentSetupMethod | '',
                  })
                }
              >
                <MenuItem value="">
                  <em>Not set up</em>
                </MenuItem>
                {INSTRUCTOR_PAYMENT_SETUP_METHODS.map((method) => (
                  <MenuItem key={method} value={method}>
                    {INSTRUCTOR_PAYMENT_SETUP_METHOD_LABELS[method]}
                  </MenuItem>
                ))}
              </Select>
              {getFieldError('paymentSetupMethod') && (
                <FormHelperText>{getFieldError('paymentSetupMethod')}</FormHelperText>
              )}
            </FormControl>
          </Box>
        </>
      )}
    </Box>
  );
}
