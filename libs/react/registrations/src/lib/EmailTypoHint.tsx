import type { ReactElement } from 'react';
import { Link, Typography } from '@mui/material';
import { suggestEmailCorrection } from '@maple/ts/validation';

export interface EmailTypoHintProps {
  /** What is in the email field right now. */
  email: string;
  /** Called with the corrected address when the person takes the suggestion. */
  onAccept: (corrected: string) => void;
}

/**
 * A "Did you mean (the corrected address)?" line under an email field.
 *
 * Renders nothing unless the domain is a known misspelling of a big mail
 * provider (see `suggestEmailCorrection`). It is a suggestion only: the form
 * still submits with the address as typed.
 */
export function EmailTypoHint({
  email,
  onAccept,
}: EmailTypoHintProps): ReactElement | null {
  const suggestion = suggestEmailCorrection(email);
  if (!suggestion) return null;

  return (
    <Typography
      variant="caption"
      color="warning"
      role="status"
      data-testid="email-typo-hint"
      sx={{ display: 'block', mt: 0.5 }}
    >
      Did you mean{' '}
      <Link
        component="button"
        type="button"
        variant="caption"
        onClick={() => onAccept(suggestion)}
        sx={{ fontWeight: 600, verticalAlign: 'baseline' }}
      >
        {suggestion}
      </Link>
      ?
    </Typography>
  );
}
