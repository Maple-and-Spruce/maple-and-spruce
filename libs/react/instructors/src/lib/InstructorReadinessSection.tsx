'use client';

/**
 * Contractor readiness: what has been done to clear a contract instructor to
 * teach. Admin-only. Nothing here blocks saving — an instructor can be added
 * before their paperwork is back, and the class form warns instead.
 */
import type { ReactNode } from 'react';
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
  Link,
} from '@mui/material';
import {
  INSTRUCTOR_PAYMENT_SETUP_METHODS,
  INSTRUCTOR_PAYMENT_SETUP_METHOD_LABELS,
  backgroundCheckRequired,
  describeMissingReadiness,
  hasPayRate,
  instructorReadiness,
  type InstructorPayRateType,
  type InstructorPaymentSetupMethod,
  type InstructorProgram,
} from '@maple/ts/domain';
import {
  readinessFromFormValues,
  type ReadinessFormValues,
} from './readiness-form';

/** Square's payroll dashboard, where contractors are added. */
const SQUARE_PAYROLL_URL = 'https://app.squareup.com/dashboard/payroll';

export interface InstructorReadinessSectionProps {
  values: ReadinessFormValues;
  onChange: (patch: Partial<ReadinessFormValues>) => void;
  /** First validation message for a field, keyed by the Vest field name. */
  getFieldError?: (field: string) => string | null;
  /**
   * Shown under "Contractor agreement", above the date fields: sending the
   * agreement to sign online, and where it stands. Omitted for an instructor
   * who has not been saved yet.
   */
  agreementActions?: ReactNode;
  /**
   * The pay rate as set elsewhere in the form. It is part of readiness (a
   * contractor with no rate cannot be paid) but is edited in its own field.
   */
  payRate?: number;
  payRateType?: InstructorPayRateType;
  /**
   * What they teach, as ticked elsewhere in the form. Decides whether a
   * background check is required (lesson teachers only).
   */
  programs?: readonly InstructorProgram[];
}

function payRateText(payRate: number, payRateType: InstructorPayRateType): string {
  if (payRateType === 'percentage') {
    return `${Math.round(payRate * 1000) / 10}% of what students pay`;
  }
  const dollars = `$${(payRate / 100).toFixed(2)}`;
  return payRateType === 'hourly' ? `${dollars} an hour` : `${dollars} a class`;
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
  agreementActions,
  payRate,
  payRateType,
  programs = [],
}: InstructorReadinessSectionProps) {
  const status = instructorReadiness({
    ...readinessFromFormValues(values),
    payRate,
    payRateType,
    programs: [...programs],
  });
  const checkRequired = backgroundCheckRequired({ programs: [...programs] });
  const rateSet = hasPayRate({ payRate, payRateType });

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
        Contract instructors need a signed agreement, payment setup and a pay rate
        before teaching. Lesson teachers also need a background check. Leave off for
        staff and unpaid instructors.
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
          {agreementActions}
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

          <ItemHeading>{checkRequired ? 'Background check' : 'Background check (optional)'}</ItemHeading>
          {!checkRequired && (
            <Typography
              variant="body2"
              color="textSecondary"
              data-testid="readiness-background-check-optional"
            >
              Only needed for private lesson and Suzuki teachers. Record a date
              here if you run one anyway.
            </Typography>
          )}
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
          {!values.paymentSetupCompletedOn && (
            <Typography
              variant="body2"
              color="textSecondary"
              sx={{ mb: 1.5 }}
              data-testid="readiness-payment-guidance"
            >
              Add them in{' '}
              <Link
                href={SQUARE_PAYROLL_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Square Payroll
              </Link>{' '}
              as a contractor (Team, then Add contractor). Square emails them
              to enter their own tax and bank details and files their 1099. Record
              the date here once they've finished. Never collect bank or tax
              numbers in this app.
            </Typography>
          )}
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

          <ItemHeading>Pay rate</ItemHeading>
          <Typography
            variant="body2"
            color={rateSet ? 'textSecondary' : 'warning'}
            data-testid="readiness-pay-rate"
          >
            {rateSet && payRate !== undefined && payRateType
              ? `${payRateText(payRate, payRateType)}. Change it under Pay rate.`
              : 'Not set. Set it under Pay rate (a percentage for class instructors).'}
          </Typography>
        </>
      )}
    </Box>
  );
}
