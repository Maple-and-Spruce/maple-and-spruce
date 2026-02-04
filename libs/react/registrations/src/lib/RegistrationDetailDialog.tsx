'use client';

import { useState } from 'react';
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
  Checkbox,
} from '@mui/material';
import type { Registration } from '@maple/ts/domain';

interface RegistrationDetailDialogProps {
  open: boolean;
  onClose: () => void;
  registration: Registration | null;
  className?: string;
  onCancel: (
    id: string,
    refund: boolean
  ) => Promise<{ registration: Registration; refundId?: string }>;
  onUpdateNotes: (id: string, notes: string) => Promise<void>;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
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
  onUpdateNotes,
}: RegistrationDetailDialogProps) {
  const [isCancelling, setIsCancelling] = useState(false);
  const [issueRefund, setIssueRefund] = useState(true);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);

  if (!registration) return null;

  const canCancel =
    registration.status === 'confirmed' || registration.status === 'pending';
  const hasPayment = !!registration.squarePaymentId;

  const handleCancel = async () => {
    setIsCancelling(true);
    setCancelError(null);

    try {
      const result = await onCancel(registration.id, issueRefund && hasPayment);
      const message = result.refundId
        ? `Registration cancelled and refund issued (${result.refundId})`
        : 'Registration cancelled';
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

          {/* Status */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography variant="subtitle2" color="text.secondary">
              Status
            </Typography>
            <Chip
              label={registration.status}
              color={getStatusColor(registration.status)}
            />
          </Box>

          <Divider />

          {/* Customer Info */}
          <Typography variant="subtitle2" color="text.secondary">
            Customer
          </Typography>
          <Box sx={{ pl: 1 }}>
            <Typography variant="body1" fontWeight={500}>
              {registration.customerName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {registration.customerEmail}
            </Typography>
            {registration.customerPhone && (
              <Typography variant="body2" color="text.secondary">
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
            <Typography variant="subtitle2" color="text.secondary">
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
            <Typography variant="subtitle2" color="text.secondary">
              Quantity
            </Typography>
            <Typography variant="body2">
              {registration.quantity} spot{registration.quantity > 1 ? 's' : ''}
            </Typography>
          </Box>

          <Divider />

          {/* Payment Info */}
          <Typography variant="subtitle2" color="text.secondary">
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
              <Typography variant="caption" color="text.secondary">
                Square: {registration.squarePaymentId}
              </Typography>
            )}
          </Box>

          {/* Notes */}
          {registration.notes && (
            <>
              <Divider />
              <Typography variant="subtitle2" color="text.secondary">
                Notes
              </Typography>
              <Typography variant="body2">{registration.notes}</Typography>
            </>
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
            <Typography variant="subtitle2" color="text.secondary">
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
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={issueRefund}
                          onChange={(e) => setIssueRefund(e.target.checked)}
                        />
                      }
                      label={`Issue refund of ${formatCents(registration.pricePaidCents)}`}
                    />
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
