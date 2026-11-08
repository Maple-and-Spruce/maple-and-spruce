'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  giftCardActivityLabel,
  giftCardKindLabel,
  giftCardStateLabel,
  type GiftCardActivityEntry,
  type GiftCardSummary,
  type RequestState,
} from '@maple/ts/domain';
import { fonts } from '@maple/react/theme';
import {
  formatGiftCardChange,
  formatGiftCardCode,
  formatGiftCardDate,
  formatGiftCardMoney,
} from './format';

export interface GiftCardDetail {
  card: GiftCardSummary;
  activities: GiftCardActivityEntry[];
}

interface GiftCardDetailDialogProps {
  /** The card picked from the table, shown while its history loads. */
  card: GiftCardSummary | null;
  detailState: RequestState<GiftCardDetail>;
  onClose: () => void;
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
 * One card: balance, history, and the code for a printed certificate. The
 * code stays hidden until asked for, then is shown and copied in one step.
 */
export function GiftCardDetailDialog({
  card,
  detailState,
  onClose,
  onRevealCode,
  copyToClipboard = browserCopy,
}: GiftCardDetailDialogProps) {
  const [codeState, setCodeState] = useState<CodeState>({ status: 'hidden' });

  // A different card starts hidden again.
  useEffect(() => {
    setCodeState({ status: 'hidden' });
  }, [card?.id]);

  const shown = detailState.status === 'success' ? detailState.data.card : card;

  const reveal = async () => {
    if (!shown) return;
    setCodeState({ status: 'loading' });
    let code: string;
    try {
      code = await onRevealCode(shown.id);
    } catch (error) {
      setCodeState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Could not get the code',
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
    <Dialog open={card !== null} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        Gift card {shown ? `ending ${shown.last4}` : ''}
      </DialogTitle>
      <DialogContent dividers>
        {shown && (
          <Stack direction="row" spacing={4} sx={{ mb: 2 }}>
            <Box>
              <Typography variant="overline" color="textSecondary">
                Balance
              </Typography>
              <Typography variant="h5" component="div">
                {formatGiftCardMoney(shown.balanceCents)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="overline" color="textSecondary">
                Status
              </Typography>
              <Typography component="div">
                {giftCardStateLabel(shown.state)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="overline" color="textSecondary">
                Kind
              </Typography>
              <Typography component="div">{giftCardKindLabel(shown.kind)}</Typography>
            </Box>
          </Stack>
        )}

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
                <Typography variant="body2" role="status" color={codeState.copied ? 'success' : 'textSecondary'}>
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
              disabled={!shown || codeState.status === 'loading'}
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

        <Divider sx={{ mb: 1 }} />
        <Typography variant="subtitle2" component="h3">
          History
        </Typography>
        <History detailState={detailState} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function History({ detailState }: { detailState: RequestState<GiftCardDetail> }) {
  if (detailState.status === 'error') {
    return (
      <Alert severity="error" sx={{ mt: 1 }}>
        Couldn&apos;t load this card&apos;s history from Square: {detailState.error}
      </Alert>
    );
  }
  if (detailState.status !== 'success') {
    return (
      <Box aria-busy="true" aria-label="Loading history" sx={{ mt: 1 }}>
        <Skeleton height={40} />
        <Skeleton height={40} />
      </Box>
    );
  }
  const { activities } = detailState.data;
  if (activities.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
        Nothing has happened on this card yet.
      </Typography>
    );
  }
  return (
    <List dense aria-label="Card history">
      {activities.map((a) => (
        <ListItem
          key={a.id}
          disableGutters
          secondaryAction={
            a.amountCents !== null ? (
              <Typography
                variant="body2"
                color={a.amountCents < 0 ? 'textPrimary' : 'success'}
              >
                {formatGiftCardChange(a.amountCents)}
              </Typography>
            ) : undefined
          }
        >
          <ListItemText
            primary={giftCardActivityLabel(a.type)}
            secondary={
              a.balanceAfterCents !== null
                ? `${formatGiftCardDate(a.createdAt)} · balance after ${formatGiftCardMoney(a.balanceAfterCents)}`
                : formatGiftCardDate(a.createdAt)
            }
          />
        </ListItem>
      ))}
    </List>
  );
}
