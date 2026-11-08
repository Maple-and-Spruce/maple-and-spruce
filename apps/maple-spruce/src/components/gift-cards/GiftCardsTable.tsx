'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  InputAdornment,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import {
  giftCardKindLabel,
  giftCardStateLabel,
  type GiftCardSummary,
  type RequestState,
} from '@maple/ts/domain';
import { fonts } from '@maple/react/theme';
import { formatGiftCardDate, formatGiftCardMoney } from './format';

interface GiftCardsTableProps {
  cardsState: RequestState<GiftCardSummary[]>;
  onSelect: (card: GiftCardSummary) => void;
}

const STATE_COLOR = {
  active: 'success',
  pending: 'default',
  blocked: 'error',
  deactivated: 'default',
} as const;

/** Every card, newest first, searchable by the last digits of its code. */
export function GiftCardsTable({ cardsState, onSelect }: GiftCardsTableProps) {
  const [search, setSearch] = useState('');
  const digits = search.replace(/\D/g, '');

  const cards = useMemo(() => {
    if (cardsState.status !== 'success') return [];
    if (!digits) return cardsState.data;
    // Digits are typed left to right, so "48" should already find "4821".
    return cardsState.data.filter((c) => c.last4.startsWith(digits));
  }, [cardsState, digits]);

  if (cardsState.status === 'error') {
    return (
      <Alert severity="error">
        Couldn&apos;t load gift cards from Square: {cardsState.error}
      </Alert>
    );
  }

  const loading = cardsState.status !== 'success';

  return (
    <Paper variant="outlined">
      <Box sx={{ p: 2, pb: 1 }}>
        <TextField
          size="small"
          label="Last 4 digits"
          placeholder="e.g. 4821"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={loading}
          slotProps={{
            htmlInput: { inputMode: 'numeric', maxLength: 4 },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>
      <TableContainer>
        <Table size="small" aria-label="Gift cards" aria-busy={loading || undefined}>
          <TableHead>
            <TableRow>
              <TableCell>Card</TableCell>
              <TableCell>Kind</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Balance</TableCell>
              <TableCell>Created</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading &&
              [0, 1, 2].map((i) => (
                <TableRow key={i}>
                  {[0, 1, 2, 3, 4].map((j) => (
                    <TableCell key={j}>
                      <Skeleton />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!loading &&
              cards.map((card) => (
                <TableRow
                  key={card.id}
                  hover
                  onClick={() => onSelect(card)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(card);
                    }
                  }}
                  tabIndex={0}
                  sx={{ cursor: 'pointer' }}
                  aria-label={`Gift card ending ${card.last4}`}
                >
                  <TableCell sx={{ fontFamily: fonts.mono }}>
                    •••• {card.last4}
                  </TableCell>
                  <TableCell>{giftCardKindLabel(card.kind)}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={giftCardStateLabel(card.state)}
                      color={STATE_COLOR[card.state]}
                      variant={card.state === 'active' ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    {formatGiftCardMoney(card.balanceCents)}
                  </TableCell>
                  <TableCell>{formatGiftCardDate(card.createdAt)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
      {!loading && cards.length === 0 && (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="textSecondary">
            {digits
              ? `No gift card ends in ${digits}.`
              : 'No gift cards yet. Once one is sold in Square, it shows up here.'}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
