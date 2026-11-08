'use client';

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
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import {
  giftCardActivityLabel,
  giftCardKindLabel,
  giftCardPurchaseSource,
  giftCardStateLabel,
  type GiftCardActivityEntry,
  type GiftCardSummary,
  type RequestState,
} from '@maple/ts/domain';
import type { GiftCardPurchaseDetails } from '@maple/ts/firebase/api-types';
import { GiftCardCodeReveal } from './GiftCardCodeReveal';
import {
  formatGiftCardChange,
  formatGiftCardDate,
  formatGiftCardMoney,
} from './format';

export interface GiftCardDetail {
  card: GiftCardSummary;
  activities: GiftCardActivityEntry[];
  /**
   * Set when we know more about the card than Square does: bought on our own
   * buy page (#300), made a class certificate, or given free (#310).
   */
  purchase?: GiftCardPurchaseDetails;
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
  /**
   * Opens the "Make it a class certificate" form (#310). The button only shows
   * for an active card we have no record of yet.
   */
  onMakeClassCertificate?: (card: GiftCardSummary) => void;
}

/**
 * One card: balance, history, and the code for a printed certificate. The
 * code stays hidden until asked for, then is shown and copied in one step.
 */
export function GiftCardDetailDialog({
  card,
  detailState,
  onClose,
  onRevealCode,
  copyToClipboard,
  onMakeClassCertificate,
}: GiftCardDetailDialogProps) {
  const shown = detailState.status === 'success' ? detailState.data.card : card;
  const record =
    detailState.status === 'success' ? detailState.data.purchase : undefined;
  // Only once the record is known to be missing: before the detail loads, we
  // cannot tell a register card from one that already has a record.
  const canMakeCertificate =
    onMakeClassCertificate !== undefined &&
    detailState.status === 'success' &&
    !record &&
    detailState.data.card.state === 'active';

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

        {record && <CardRecord purchase={record} />}

        {canMakeCertificate && (
          <Box
            component="section"
            aria-label="Class certificate"
            sx={{ p: 2, mb: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}
          >
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              Sold at the register as a gift for a class? Record which class
              type it is for. Nothing changes in Square.
            </Typography>
            <Button
              variant="outlined"
              startIcon={<SchoolOutlinedIcon />}
              onClick={() => onMakeClassCertificate(detailState.data.card)}
            >
              Make it a class certificate
            </Button>
          </Box>
        )}

        <GiftCardCodeReveal
          key={shown?.id ?? 'none'}
          giftCardId={shown?.id ?? null}
          onRevealCode={onRevealCode}
          copyToClipboard={copyToClipboard}
        />

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

const RECORD_LABELS = {
  online: 'Bought online',
  register: 'Class certificate',
  issued: 'Given free by the studio',
} as const;

const RECORD_HEADINGS = {
  online: 'Bought online',
  register: 'Made a class certificate',
  issued: 'Given free by the studio',
} as const;

/**
 * What we know about a card beyond Square: who bought it online and for
 * whom, which class type a certificate covers, or why the studio gave it.
 */
function CardRecord({ purchase }: { purchase: GiftCardPurchaseDetails }) {
  const source = giftCardPurchaseSource(purchase);
  const heading = RECORD_HEADINGS[source];
  const label = RECORD_LABELS[source];
  const forWhom = purchase.recipientName
    ? purchase.recipientEmail
      ? `${purchase.recipientName} (${purchase.recipientEmail})`
      : purchase.recipientName
    : purchase.recipientEmail;
  const classType = purchase.classCategoryName ?? purchase.className;
  return (
    <Box
      component="section"
      aria-label={label}
      sx={{ p: 2, mb: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}
    >
      <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
        {heading} {formatGiftCardDate(purchase.createdAt)}
      </Typography>
      <Stack spacing={0.5}>
        {source === 'issued' && (
          <>
            <Typography variant="body2">
              Free {formatGiftCardMoney(purchase.valueCents)} card. Nobody paid
              for it; the studio covers it when it is spent.
            </Typography>
            {purchase.reason && (
              <Typography variant="body2">Why: {purchase.reason}</Typography>
            )}
          </>
        )}
        {purchase.kind === 'class' &&
          (source === 'online' ? (
            <Typography variant="body2">
              Class certificate: {purchase.className ?? 'a class'}
              {purchase.classCategoryName ? ` (${purchase.classCategoryName})` : ''}
            </Typography>
          ) : (
            <Typography variant="body2">
              Class certificate for one {classType ?? ''} class, worth{' '}
              {formatGiftCardMoney(purchase.valueCents)}
              {source === 'register' ? ' (sold at the register)' : ''}
            </Typography>
          ))}
        {source === 'online' && purchase.buyerName && (
          <Typography variant="body2">
            Bought by {purchase.buyerName}
            {purchase.buyerEmail ? ` (${purchase.buyerEmail})` : ''}
          </Typography>
        )}
        {forWhom && <Typography variant="body2">For {forWhom}</Typography>}
        {purchase.fromName && (
          <Typography variant="body2">From {purchase.fromName}</Typography>
        )}
        {source === 'online' && purchase.deliverTo && (
          <Typography variant="body2" color="textSecondary">
            {purchase.deliverTo === 'recipient'
              ? 'Emailed to them'
              : 'Emailed to the buyer to print'}
          </Typography>
        )}
        {purchase.message && (
          <Typography variant="body2" sx={{ fontStyle: 'italic', whiteSpace: 'pre-line' }}>
            &ldquo;{purchase.message}&rdquo;
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
