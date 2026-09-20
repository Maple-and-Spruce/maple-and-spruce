'use client';

/**
 * PaymentMethodCard (#81) — the card on file the billing job will charge.
 *
 * Katie saves cards in the Square app, in person. So this does not collect a
 * card; it shows which one is attached, and helps her find the right one among
 * those she has already saved.
 *
 * The suggestions are the point. An adult student's card is in their own name,
 * but a child's is in a parent's — sharing neither given name nor surname with
 * the child — so a list of cardholder names is not something Katie can pick from
 * reliably. Every suggestion states **why** it was suggested, and nothing is
 * ever linked without her choosing it: a wrong link charges the wrong family.
 *
 * Presentational; the page owns the data and the mutation.
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import type { CardMatch, SquareCardOnFile, Student } from '@maple/ts/domain';
import {
  isCardExpired,
  isCardExpiringSoon,
  rankCardsForStudent,
} from '@maple/ts/domain';

export interface PaymentMethodCardProps {
  student: Student;
  /** Every enabled card on file in Square. */
  cards: SquareCardOnFile[];
  /** Cards already attached to a student, keyed by card id. */
  linkedTo?: Record<string, { id: string; name: string }>;
  isLoading?: boolean;
  isSaving?: boolean;
  error?: string | null;
  onLink: (squareCardId: string) => void;
  onUnlink: () => void;
}

/** "Visa ••4242", or just the last four when the brand is missing. */
function describeCard(
  brand: string | undefined,
  last4: string | undefined
): string {
  const pretty = brand
    ? brand.charAt(0) + brand.slice(1).toLowerCase().replace(/_/g, ' ')
    : 'Card';
  return last4 ? `${pretty} ••${last4}` : pretty;
}

function expiryNote(card: SquareCardOnFile): string | null {
  if (isCardExpired(card)) return 'This card has expired.';
  if (isCardExpiringSoon(card)) {
    return `Expires ${String(card.expMonth).padStart(2, '0')}/${card.expYear} — worth replacing before a charge fails.`;
  }
  return null;
}

export function PaymentMethodCard({
  student,
  cards,
  linkedTo = {},
  isLoading = false,
  isSaving = false,
  error = null,
  onLink,
  onUnlink,
}: PaymentMethodCardProps) {
  const [showAll, setShowAll] = useState(false);

  // Hope students bill through the EMA portal, so a card on file would never
  // be charged and offering one is just confusing.
  if (student.isHopeScholarship) {
    return null;
  }

  const linkedCard = cards.find((c) => c.cardId === student.squareCardId);
  const suggestions: CardMatch[] = rankCardsForStudent(student, cards).filter(
    (m) => !linkedTo[m.card.cardId] || linkedTo[m.card.cardId].id === student.id
  );
  const unclaimed = cards.filter(
    (c) => !linkedTo[c.cardId] && !isCardExpired(c)
  );

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <CreditCardIcon fontSize="small" color="action" />
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          Payment method
        </Typography>
        {isLoading && <CircularProgress size={18} />}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {student.squareCardId ? (
        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Typography sx={{ fontWeight: 600 }}>
              {describeCard(student.cardBrand, student.cardLast4)}
            </Typography>
            <Chip size="small" color="success" label="On file" />
            <Box sx={{ flexGrow: 1 }} />
            <Button size="small" disabled={isSaving} onClick={onUnlink}>
              Unlink
            </Button>
          </Stack>

          {linkedCard && expiryNote(linkedCard) && (
            <Alert severity="warning">{expiryNote(linkedCard)}</Alert>
          )}

          <Typography variant="body2" color="text.secondary">
            Lessons are charged to this card. Unlinking stops that; the card
            stays saved in Square either way.
          </Typography>
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            No card on file, so nothing is charged automatically. Save the card
            in the Square app, then link it here.
          </Typography>

          {suggestions.length > 0 && !showAll && (
            <Stack spacing={1}>
              {suggestions.map((match) => (
                <Paper
                  key={match.card.cardId}
                  variant="outlined"
                  sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}
                >
                  <Box sx={{ flexGrow: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography sx={{ fontWeight: 600 }}>
                        {describeCard(match.card.cardBrand, match.card.last4)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {match.card.cardholderName}
                      </Typography>
                      {match.strength === 'exact' && (
                        <Chip size="small" color="success" label="Likely" />
                      )}
                    </Stack>
                    {match.reasons.map((reason) => (
                      <Typography
                        key={reason}
                        variant="body2"
                        color="text.secondary"
                      >
                        {reason}
                      </Typography>
                    ))}
                  </Box>
                  <Button
                    variant="contained"
                    size="small"
                    disabled={isSaving}
                    onClick={() => onLink(match.card.cardId)}
                  >
                    Link
                  </Button>
                </Paper>
              ))}
            </Stack>
          )}

          {suggestions.length === 0 && !showAll && !isLoading && (
            <Alert severity="info">
              No card in Square matches this student’s contact details. Check
              the email on the Square customer, or pick from every card.
            </Alert>
          )}

          {showAll && (
            <Stack spacing={1}>
              {unclaimed.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  Every card on file is already linked to a student.
                </Typography>
              )}
              {unclaimed.map((card) => (
                <Paper
                  key={card.cardId}
                  variant="outlined"
                  sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}
                >
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography sx={{ fontWeight: 600 }}>
                      {describeCard(card.cardBrand, card.last4)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {card.cardholderName ?? card.customerEmail ?? 'Unnamed'}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    disabled={isSaving}
                    onClick={() => onLink(card.cardId)}
                  >
                    Link
                  </Button>
                </Paper>
              ))}
            </Stack>
          )}

          <Box>
            <Button size="small" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show suggestions' : 'Show every card on file'}
            </Button>
          </Box>
        </Stack>
      )}
    </Paper>
  );
}
