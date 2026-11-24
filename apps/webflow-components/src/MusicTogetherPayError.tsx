/**
 * What the Music Together signup shows when paying failed, and the note that
 * follows a deliberate "Register again".
 *
 * Most failures are just a message. One is a question: the server refused
 * because this email already has this child signed up for the section, which
 * is usually an impatient second press of pay but can be meant. So that one
 * offers Register again. The other repeat refusal, a payment by this email
 * that is still going through, offers nothing: paying again then could charge
 * twice.
 */
import { Alert, Box } from '@mui/material';
import { fonts } from '@maple/react/theme';
import { isMtAlreadyEnrolledMessage } from '@maple/ts/domain';

interface MusicTogetherPayErrorProps {
  message: string;
  /** The family chose to sign up again anyway. */
  onRegisterAgain: () => void;
}

export function MusicTogetherPayError({
  message,
  onRegisterAgain,
}: MusicTogetherPayErrorProps) {
  return (
    <Alert severity="error" role="alert">
      {message}
      {isMtAlreadyEnrolledMessage(message) && (
        <Box sx={{ mt: 1 }}>
          <button
            type="button"
            onClick={onRegisterAgain}
            style={{
              padding: 0,
              border: 'none',
              background: 'none',
              color: 'inherit',
              font: 'inherit',
              fontWeight: 600,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            Register again
          </button>{' '}
          (this is a new signup, and it is paid for separately)
        </Box>
      )}
    </Alert>
  );
}

/**
 * Shown by the pay button after Register again, so the family knows what
 * pressing it will do. Inline styles: inside Webflow the pay button is
 * portaled out of the shadow root, where MUI's styles do not reach.
 */
export function MusicTogetherRegisterAgainNote() {
  return (
    <div
      role="status"
      style={{
        marginBottom: 12,
        padding: '12px 14px',
        borderRadius: 8,
        backgroundColor: '#FFF4E5',
        color: '#663C00',
        fontFamily: fonts.body,
        fontSize: 15,
        lineHeight: 1.45,
      }}
    >
      You are signing up again for a child already registered in this section
      with this email. Paying now makes a second registration and a second
      charge.
    </div>
  );
}
