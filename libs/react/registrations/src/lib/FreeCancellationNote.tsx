import type { ReactElement } from 'react';
import { Box, Link, Typography } from '@mui/material';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import {
  cancelPageUrl,
  formatFreeCancellationDeadline,
} from '@maple/ts/domain';

export interface FreeCancellationNoteProps {
  /**
   * The free cancellation deadline, or undefined once it has passed (or the
   * class starts inside the two weeks). Undefined renders nothing: after the
   * date we say nothing about cancelling.
   */
  deadline: Date | undefined;
  /**
   * `checkout`: one line beside the payment. `confirmation`: the line plus
   * how to ask (the cancel page and Katie's email).
   */
  variant: 'checkout' | 'confirmation';
  /** Fills in the cancel page link on the confirmation screen. */
  confirmationNumber?: string;
}

/**
 * "Free cancellation until Sat, Nov 21 at 10:00 AM", like Airbnb shows at
 * checkout. See `free-cancellation.ts` in the domain library for the rule.
 */
export function FreeCancellationNote({
  deadline,
  variant,
  confirmationNumber,
}: FreeCancellationNoteProps): ReactElement | null {
  if (!deadline) return null;
  const when = formatFreeCancellationDeadline(deadline);

  return (
    <Box
      data-testid="free-cancellation-note"
      sx={{
        display: 'flex',
        gap: 1.5,
        alignItems: 'flex-start',
        textAlign: 'left',
        p: 1.5,
        mb: 2,
        borderRadius: 1,
        bgcolor: 'rgba(107, 123, 94, 0.08)',
      }}
    >
      <EventAvailableOutlinedIcon color="primary" sx={{ mt: '2px' }} />
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Free cancellation until {when}
        </Typography>
        {variant === 'checkout' ? (
          <Typography variant="body2" color="textSecondary">
            Cancel before then for a full refund.
          </Typography>
        ) : (
          <Typography variant="body2" color="textSecondary">
            Plans change? Before then,{' '}
            <Link href={cancelPageUrl(confirmationNumber)} color="primary">
              request a cancellation
            </Link>{' '}
            or email{' '}
            <Link href="mailto:katie@mapleandsprucefolkarts.com" color="primary">
              katie@mapleandsprucefolkarts.com
            </Link>{' '}
            for a full refund.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
