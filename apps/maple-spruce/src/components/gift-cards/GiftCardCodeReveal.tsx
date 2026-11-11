'use client';

import { useState } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { fonts } from '@maple/react/theme';
import { formatGiftCardCode } from './format';
import { errorMessageFor } from '@maple/ts/domain';

export interface GiftCardCodeRevealProps {
  /** The card whose code to show. Null while there is no card yet. */
  giftCardId: string | null;
  /** Fetches the full code. The server logs each call. */
  onRevealCode: (id: string) => Promise<string>;
  /** Defaults to the browser clipboard; stories pass a spy. */
  copyToClipboard?: (text: string) => Promise<void>;
}

type CodeState =
  | { status: 'hidden' }
  | { status: 'loading' }
  | { status: 'shown'; code: string; copied: boolean }
  | { status: 'error'; error: string };

const browserCopy = (text: string) => navigator.clipboard.writeText(text);

/**
 * The code for a printed certificate. It stays hidden until asked for, then
 * is shown and copied in one step. Give it a `key` of the card id so another
 * card starts hidden again.
 */
export function GiftCardCodeReveal({
  giftCardId,
  onRevealCode,
  copyToClipboard = browserCopy,
}: GiftCardCodeRevealProps) {
  const [codeState, setCodeState] = useState<CodeState>({ status: 'hidden' });

  const reveal = async () => {
    if (!giftCardId) return;
    setCodeState({ status: 'loading' });
    let code: string;
    try {
      code = await onRevealCode(giftCardId);
    } catch (error) {
      setCodeState({
        status: 'error',
        error: errorMessageFor(error, 'Could not get the code'),
      });
      return;
    }
    let copied = false;
    try {
      await copyToClipboard(code);
      copied = true;
    } catch {
      // The code is on screen to copy by hand.
    }
    setCodeState({ status: 'shown', code, copied });
  };

  const copyAgain = async () => {
    if (codeState.status !== 'shown') return;
    try {
      await copyToClipboard(codeState.code);
      setCodeState({ ...codeState, copied: true });
    } catch {
      setCodeState({ ...codeState, copied: false });
    }
  };

  return (
    <Box
      component="section"
      aria-label="Card code"
      sx={{ p: 2, mb: 2, bgcolor: 'action.hover', borderRadius: 1 }}
    >
      <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
        Code for a printed certificate
      </Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 1.5 }}>
        Anyone with this code can spend the balance. Show it only to paste
        into the certificate. Each time it is shown, that is logged.
      </Typography>

      {codeState.status === 'shown' ? (
        <Stack spacing={1}>
          <Typography
            data-testid="gift-card-code"
            sx={{ fontFamily: fonts.mono, fontSize: '1.25rem', letterSpacing: 1 }}
          >
            {formatGiftCardCode(codeState.code)}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentCopyIcon />}
              onClick={copyAgain}
            >
              Copy again
            </Button>
            <Typography
              variant="body2"
              role="status"
              color={codeState.copied ? 'success' : 'textSecondary'}
            >
              {codeState.copied
                ? 'Copied. Paste it into the certificate.'
                : 'Copying did not work here. Select the code and copy it by hand.'}
            </Typography>
          </Box>
        </Stack>
      ) : (
        <Button
          variant="contained"
          startIcon={<ContentCopyIcon />}
          onClick={reveal}
          disabled={!giftCardId || codeState.status === 'loading'}
        >
          {codeState.status === 'loading' ? 'Getting code…' : 'Show and copy code'}
        </Button>
      )}
      {codeState.status === 'error' && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          Couldn&apos;t get the code from Square: {codeState.error}
        </Alert>
      )}
    </Box>
  );
}
