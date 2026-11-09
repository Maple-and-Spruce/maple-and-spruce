'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Chip,
  Divider,
  Alert,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
} from '@mui/material';
import {
  formatPrivateHourStart,
  hasOpenRefundReview,
  refundedInSquareAmountCents,
  type Registration,
} from '@maple/ts/domain';

interface RegistrationDetailDialogProps {
  open: boolean;
  onClose: () => void;
  registration: Registration | null;
  className?: string;
  /**
   * `refundedInSquare`: the money already went back in the Square dashboard,
   * so record the refund without refunding again.
   */
  onCancel: (
    id: string,
    refund: boolean,
    refundedInSquare?: boolean
  ) => Promise<{ registration: Registration; refundId?: string }>;
  /**
   * Save staff's own note. The customer's note is read-only: it stays as
   * they wrote it (#326).
   */
  onUpdateStaffNotes: (id: string, staffNotes: string) => Promise<void>;
}

/** Longest staff note; matches the server's validation. */
const STAFF_NOTES_MAX_LENGTH = 2000;

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** What cancelling does about the money. */
type RefundChoice = 'refund' | 'refunded-in-square' | 'none';

/** A flagged Square refund means the money probably already went back. */
function defaultRefundChoice(registration: Registration | null): RefundChoice {
  return registration && hasOpenRefundReview(registration)
    ? 'refunded-in-square'
    : 'refund';
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getStatusColor(
  status: string
): 'success' | 'warning' | 'error' | 'default' | 'info' {
  switch (status) {
    case 'confirmed':
      return 'success';
    case 'pending':
      return 'warning';
    case 'cancelled':
      return 'error';
    case 'refunded':
      return 'info';
    case 'no-show':
      return 'default';
    default:
      return 'default';
  }
}

export function RegistrationDetailDialog({
  open,
  onClose,
  registration,
  className,
  onCancel,
  onUpdateStaffNotes,
}: RegistrationDetailDialogProps) {
  const [isCancelling, setIsCancelling] = useState(false);
  const [refundChoice, setRefundChoice] = useState<RefundChoice>(
    defaultRefundChoice(registration)
  );
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);
  const [staffNotesDraft, setStaffNotesDraft] = useState(
    registration?.staffNotes ?? ''
  );
  const [staffNotesSave, setStaffNotesSave] = useState<
    | { status: 'idle' }
    | { status: 'saving' }
    | { status: 'saved' }
    | { status: 'error'; error: string }
  >({ status: 'idle' });

  // A different registration opened in the same dialog starts from its own
  // default, not the last one's choice.
  useEffect(() => {
    setRefundChoice(defaultRefundChoice(registration));
    setStaffNotesDraft(registration?.staffNotes ?? '');
    setStaffNotesSave({ status: 'idle' });
  }, [registration?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!registration) return null;

  const canCancel =
    registration.status === 'confirmed' || registration.status === 'pending';
  const hasPayment = !!registration.squarePaymentId;
  const reviewPending = hasOpenRefundReview(registration);

  const savedStaffNotes = registration.staffNotes ?? '';
  const staffNotesChanged = staffNotesDraft.trim() !== savedStaffNotes.trim();
  const staffNotesTooLong = staffNotesDraft.length > STAFF_NOTES_MAX_LENGTH;

  const handleSaveStaffNotes = async () => {
    setStaffNotesSave({ status: 'saving' });
    try {
      await onUpdateStaffNotes(registration.id, staffNotesDraft.trim());
      setStaffNotesSave({ status: 'saved' });
    } catch (error) {
      setStaffNotesSave({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to save',
      });
    }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    setCancelError(null);

    try {
      const alreadyRefunded = hasPayment && refundChoice === 'refunded-in-square';
      const result = await onCancel(
        registration.id,
        hasPayment && refundChoice === 'refund',
        alreadyRefunded
      );
      let message = 'Registration cancelled';
      if (result.refundId) {
        message = `Registration cancelled and refund issued (${result.refundId})`;
      } else if (alreadyRefunded) {
        message = 'Registration cancelled and recorded as refunded in Square';
      }
      setCancelSuccess(message);
      setShowCancelConfirm(false);
    } catch (error) {
      setCancelError(
        error instanceof Error ? error.message : 'Failed to cancel'
      );
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Registration Detail</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {cancelError && (
            <Alert severity="error" onClose={() => setCancelError(null)}>
              {cancelError}
            </Alert>
          )}
          {cancelSuccess && (
            <Alert severity="success">{cancelSuccess}</Alert>
          )}
          {reviewPending && !cancelSuccess && (
            <Alert severity="warning">
              Square refunded{' '}
              {formatCents(registration.refundReviewAmountCents ?? 0)} on a sale
              that included this class. If it was for this class, cancel it as
              already refunded in Square.
            </Alert>
          )}

          {/* Status + Source */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography variant="subtitle2" color="textSecondary">
              Status
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Chip
                label={registration.source === 'pos' ? 'POS' : 'Web'}
                size="small"
                variant="outlined"
                color={registration.source === 'pos' ? 'primary' : 'default'}
              />
              <Chip
                label={registration.status}
                color={getStatusColor(registration.status)}
              />
            </Box>
          </Box>

          <Divider />

          {/* Customer Info */}
          <Typography variant="subtitle2" color="textSecondary">
            Customer
          </Typography>
          <Box sx={{ pl: 1 }}>
            <Typography variant="body1" sx={{
              fontWeight: 500
            }}>
              {registration.customerName}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {registration.customerEmail}
            </Typography>
            {registration.customerPhone && (
              <Typography variant="body2" color="textSecondary">
                {registration.customerPhone}
              </Typography>
            )}
          </Box>

          <Divider />

          {/* Class Info */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography variant="subtitle2" color="textSecondary">
              Class
            </Typography>
            <Typography variant="body2">
              {className || registration.classId}
            </Typography>
          </Box>

          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography variant="subtitle2" color="textSecondary">
              {registration.slotStart ? 'Hour' : 'Quantity'}
            </Typography>
            <Typography variant="body2">
              {registration.slotStart
                ? formatPrivateHourStart(registration.slotStart)
                : `${registration.quantity} spot${registration.quantity > 1 ? 's' : ''}`}
            </Typography>
          </Box>

          {registration.slotStart && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Typography variant="subtitle2" color="textSecondary">
                Group
              </Typography>
              <Typography variant="body2">
                {registration.groupSize
                  ? `about ${registration.groupSize} people`
                  : 'size not given'}
              </Typography>
            </Box>
          )}

          <Divider />

          {/* Payment Info */}
          <Typography variant="subtitle2" color="textSecondary">
            Payment
          </Typography>
          <Box sx={{ pl: 1 }}>
            <Typography variant="body2">
              Amount: {formatCents(registration.pricePaidCents)}
            </Typography>
            {registration.discountCode && (
              <Typography variant="body2">
                Discount: {registration.discountCode} (-
                {formatCents(registration.discountAmountCents ?? 0)})
              </Typography>
            )}
            {registration.squarePaymentId && (
              <Typography variant="caption" color="textSecondary">
                Square: {registration.squarePaymentId}
              </Typography>
            )}
          </Box>

          {/* The customer's note, as they wrote it */}
          {registration.notes?.trim() && (
            <>
              <Divider />
              <Typography variant="subtitle2" color="textSecondary">
                Customer note
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {registration.notes}
              </Typography>
            </>
          )}

          {/* Staff's own notes */}
          <Divider />
          <TextField
            label="Staff notes"
            placeholder="Only staff see this"
            multiline
            minRows={2}
            size="small"
            fullWidth
            // Always above the box: it has a placeholder, and a multiline
            // field's label otherwise sat on top of typed text.
            slotProps={{ inputLabel: { shrink: true } }}
            value={staffNotesDraft}
            onChange={(e) => {
              setStaffNotesDraft(e.target.value);
              setStaffNotesSave({ status: 'idle' });
            }}
            error={staffNotesTooLong}
            helperText={
              staffNotesTooLong
                ? `Keep it to ${STAFF_NOTES_MAX_LENGTH} characters`
                : undefined
            }
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={handleSaveStaffNotes}
              disabled={
                !staffNotesChanged ||
                staffNotesTooLong ||
                staffNotesSave.status === 'saving'
              }
            >
              {staffNotesSave.status === 'saving' ? 'Saving…' : 'Save staff notes'}
            </Button>
            {staffNotesSave.status === 'saved' && !staffNotesChanged && (
              <Typography variant="caption" color="success">
                Saved
              </Typography>
            )}
          </Box>
          {staffNotesSave.status === 'error' && (
            <Alert severity="error">{staffNotesSave.error}</Alert>
          )}

          <Divider />

          {/* Timestamps */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography variant="subtitle2" color="textSecondary">
              Registered
            </Typography>
            <Typography variant="caption">
              {formatDate(registration.createdAt)}
            </Typography>
          </Box>

          {/* Cancel Section */}
          {canCancel && !cancelSuccess && (
            <>
              <Divider />
              {!showCancelConfirm ? (
                <Button
                  color="error"
                  variant="outlined"
                  onClick={() => setShowCancelConfirm(true)}
                >
                  Cancel Registration
                </Button>
              ) : (
                <Box
                  sx={{
                    p: 2,
                    border: 1,
                    borderColor: 'error.main',
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="body2" gutterBottom>
                    Are you sure you want to cancel this registration?
                  </Typography>
                  {hasPayment && (
                    <RadioGroup
                      aria-label="Refund"
                      value={refundChoice}
                      onChange={(e) =>
                        setRefundChoice(e.target.value as RefundChoice)
                      }
                    >
                      <FormControlLabel
                        value="refund"
                        control={<Radio size="small" />}
                        label={`Issue refund of ${formatCents(registration.pricePaidCents)}`}
                      />
                      <FormControlLabel
                        value="refunded-in-square"
                        control={<Radio size="small" />}
                        label={`Already refunded in Square (don't refund again): record ${formatCents(refundedInSquareAmountCents(registration))}`}
                      />
                      <FormControlLabel
                        value="none"
                        control={<Radio size="small" />}
                        label="Cancel without a refund"
                      />
                    </RadioGroup>
                  )}
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button
                      color="error"
                      variant="contained"
                      onClick={handleCancel}
                      disabled={isCancelling}
                      size="small"
                    >
                      {isCancelling ? 'Cancelling...' : 'Confirm Cancel'}
                    </Button>
                    <Button
                      onClick={() => setShowCancelConfirm(false)}
                      disabled={isCancelling}
                      size="small"
                    >
                      Back
                    </Button>
                  </Box>
                </Box>
              )}
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
