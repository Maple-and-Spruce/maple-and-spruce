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
  Link,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import {
  giftCardActivityLabel,
  giftCardKindLabel,
  giftCardPurchaseSource,
  giftCardStateLabel,
  isUnsoldPrintedCertificate,
  type GiftCardActivityEntry,
  type GiftCardSummary,
  type RequestState,
  giftCardName,
} from '@maple/ts/domain';
import type {
  GetGiftCardBuyerResponse,
  GiftCardPurchaseDetails,
} from '@maple/ts/firebase/api-types';
import { GiftCardBuyerBox } from './GiftCardBuyerBox';
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
  /**
   * Reads who bought the card at the register from Square (#332). The box
   * only shows for a card that was sold, not bought online or given free.
   */
  onLoadBuyer?: (id: string) => Promise<GetGiftCardBuyerResponse>;
  /**
   * Opens "Replace lost card" (#332). The button only shows for an active
   * card with money on it.
   */
  onReplace?: (card: GiftCardSummary) => void;
}

/**
 * Whether a register sale may name the card's buyer: a card we have no record
 * of (sold in Square), a register class certificate, or a printed certificate.
 * Not one bought online (we know that buyer), given free or a replacement.
 */
function mayHaveRegisterBuyer(purchase: GiftCardPurchaseDetails | undefined): boolean {
  if (!purchase) return true;
  const source = giftCardPurchaseSource(purchase);
  return source === 'register' || source === 'stock';
}

/** The status to show: a printed certificate not loaded yet is "Not sold yet". */
function statusLabel(
  card: GiftCardSummary,
  detailState: RequestState<GiftCardDetail>
): string {
  if (detailState.status === 'success') {
    const { purchase, activities } = detailState.data;
    if (isUnsoldPrintedCertificate(card, purchase, activities)) return 'Not sold yet';
  }
  return giftCardStateLabel(card.state);
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
  onLoadBuyer,
  onReplace,
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
  const loaded = detailState.status === 'success' ? detailState.data : undefined;
  const unsold =
    loaded !== undefined &&
    isUnsoldPrintedCertificate(loaded.card, loaded.purchase, loaded.activities);
  const showBuyer =
    onLoadBuyer !== undefined &&
    loaded !== undefined &&
    loaded.card.state !== 'pending' &&
    !unsold &&
    mayHaveRegisterBuyer(loaded.purchase);
  const canReplace =
    onReplace !== undefined &&
    loaded !== undefined &&
    loaded.card.state === 'active' &&
    loaded.card.balanceCents > 0;

  return (
    <Dialog open={card !== null} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {shown ? giftCardName(shown.last4) : 'Gift card'}
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
              <Typography component="div">{statusLabel(shown, detailState)}</Typography>
            </Box>
            <Box>
              <Typography variant="overline" color="textSecondary">
                Kind
              </Typography>
              <Typography component="div">{giftCardKindLabel(shown.kind)}</Typography>
            </Box>
          </Stack>
        )}

        {record && <CardRecord purchase={record} unsold={unsold} />}

        {showBuyer && (
          <GiftCardBuyerBox
            key={loaded.card.id}
            giftCardId={loaded.card.id}
            onLoadBuyer={onLoadBuyer}
          />
        )}

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

        {canReplace && (
          <Box
            component="section"
            aria-label="Lost card"
            sx={{ p: 2, mb: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}
          >
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              Customer lost it? Move the balance to a new card. This card stops
              working for good.
            </Typography>
            <Button
              variant="outlined"
              color="error"
              startIcon={<SwapHorizIcon />}
              onClick={() => onReplace(loaded.card)}
            >
              Replace lost card
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
  stock: 'Printed certificate',
  replacement: 'Replacement card',
} as const;

const RECORD_HEADINGS = {
  online: 'Bought online',
  register: 'Made a class certificate',
  issued: 'Given free by the studio',
  stock: 'Printed',
  replacement: 'Replacement card made',
} as const;

/** The lines for a card this page made: free, printed, or a replacement. */
function MadeHereSummary({
  purchase,
  source,
  unsold,
}: {
  purchase: GiftCardPurchaseDetails;
  source: ReturnType<typeof giftCardPurchaseSource>;
  unsold: boolean;
}) {
  return (
    <>
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
        {source === 'stock' && (
          <>
            <Typography variant="body2">
              {unsold
                ? `Printed certificate for ${formatGiftCardMoney(purchase.valueCents)}. It has no money on it until it is sold at the register.`
                : `Printed certificate for ${formatGiftCardMoney(purchase.valueCents)}, sold at the register.`}
              {purchase.batchId ? ` Batch ${purchase.batchId.slice(-6)}.` : ''}
            </Typography>
            {purchase.batchId && (
              <Link
                href={`/gift-cards/print/${encodeURIComponent(purchase.batchId)}`}
                variant="body2"
              >
                Open this batch to print it again
              </Link>
            )}
          </>
        )}
        {source === 'replacement' && (
          <Typography variant="body2">
            Holds {formatGiftCardMoney(purchase.valueCents)} moved from a lost card,
            which was turned off.
          </Typography>
        )}
    </>
  );
}

/**
 * What we know about a card beyond Square: who bought it online and for
 * whom, which class type a certificate covers, or why the studio gave it.
 */
function CardRecord({
  purchase,
  unsold,
}: {
  purchase: GiftCardPurchaseDetails;
  /** A printed certificate the register has not loaded yet (#332). */
  unsold: boolean;
}) {
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
        <MadeHereSummary purchase={purchase} source={source} unsold={unsold} />
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
              {source === 'stock' ? ' (printed)' : ''}
              {source === 'replacement' ? ' (moved from a lost card)' : ''}
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
