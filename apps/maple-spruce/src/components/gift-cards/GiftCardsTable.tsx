'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  InputAdornment,
  Paper,
  Skeleton,
  Stack,
  Switch,
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
  giftCardSearchKind,
  giftCardStateLabel,
  type GiftCardListItem,
  type GiftCardSummary,
  type RequestState,
  giftCardName,
  giftCardShortLabel,
  errorMessageFor,
} from '@maple/ts/domain';
import type {
  GiftCardCustomer,
  SearchGiftCardsByCustomerResponse,
} from '@maple/ts/firebase/api-types';
import { fonts } from '@maple/react/theme';
import { formatGiftCardDate, formatGiftCardMoney } from './format';

interface GiftCardsTableProps {
  cardsState: RequestState<GiftCardListItem[]>;
  onSelect: (card: GiftCardSummary) => void;
  /**
   * Finds cards by a customer's name, email or phone in Square (#332). Without
   * it the box only searches the last 4 digits.
   */
  onSearchCustomers?: (query: string) => Promise<SearchGiftCardsByCustomerResponse>;
}

/**
 * How a card came about, when our records say (#314, #332): a printed
 * certificate names its batch by the batch id's last characters, which is
 * enough to tell batches apart on the page.
 */
export function giftCardOriginNote(card: GiftCardListItem): string | undefined {
  if (card.source === 'stock') {
    return card.batchId
      ? `Printed certificate (batch ${card.batchId.slice(-6)})`
      : 'Printed certificate';
  }
  if (card.source === 'replacement') return 'Replacement for a lost card';
  if (card.source === 'issued') return 'Given free';
  return undefined;
}

/** A customer as one line: "Robin Ashfield · robin@example.com · (304) 555-0142". */
export function describeGiftCardCustomer(customer: GiftCardCustomer): string {
  const parts = [customer.name, customer.email, customer.phone].filter(
    (p): p is string => Boolean(p)
  );
  return parts.length > 0 ? parts.join(' · ') : 'A customer with no name or contact';
}

const STATE_COLOR = {
  active: 'success',
  pending: 'default',
  blocked: 'error',
  deactivated: 'default',
} as const;

type CustomerSearch = RequestState<SearchGiftCardsByCustomerResponse> & {
  query?: string;
};

function CardRow({
  card,
  onSelect,
}: {
  card: GiftCardListItem;
  onSelect: (card: GiftCardSummary) => void;
}) {
  const origin = giftCardOriginNote(card);
  return (
    <TableRow
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
      aria-label={giftCardName(card.last4)}
    >
      <TableCell sx={{ fontFamily: fonts.mono }}>{giftCardShortLabel(card.last4)}</TableCell>
      <TableCell>
        {giftCardKindLabel(card.kind)}
        {origin && (
          <Typography variant="caption" color="textSecondary" component="div">
            {origin}
          </Typography>
        )}
      </TableCell>
      <TableCell>
        <Chip
          size="small"
          label={giftCardStateLabel(card.state)}
          color={STATE_COLOR[card.state]}
          variant={card.state === 'active' ? 'filled' : 'outlined'}
        />
      </TableCell>
      <TableCell align="right">{formatGiftCardMoney(card.balanceCents)}</TableCell>
      <TableCell>{formatGiftCardDate(card.createdAt)}</TableCell>
    </TableRow>
  );
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <TableRow key={i}>
          {[0, 1, 2, 3, 4].map((j) => (
            <TableCell key={j}>
              <Skeleton />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/** Who the customer search matched, above its cards. */
function CustomerMatches({ result }: { result: SearchGiftCardsByCustomerResponse }) {
  return (
    <Box component="section" aria-label="Customers found" sx={{ px: 2, pb: 1 }}>
      {result.matches.map((match) => (
        <Typography key={match.customer.id} variant="body2">
          {describeGiftCardCustomer(match.customer)}:{' '}
          {match.giftCardIds.length === 1
            ? '1 card'
            : `${match.giftCardIds.length} cards`}
        </Typography>
      ))}
      <Typography variant="caption" color="textSecondary" component="div">
        Register sales searched since {formatGiftCardDate(result.searchedSince)}. Cards
        linked to the customer in Square are found however old they are.
      </Typography>
    </Box>
  );
}

/**
 * A card with nothing left to do: turned off, or active with $0 on it (spent,
 * refunded, or moved to a replacement). Hidden from the list until asked for,
 * so the list shows the cards that matter. An unsold printed certificate is
 * `pending`, not empty, and stays.
 */
export function isGiftCardUsedUp(card: GiftCardSummary): boolean {
  return card.state === 'deactivated' || (card.state === 'active' && card.balanceCents <= 0);
}

function emptyMessage(
  customerSearch: CustomerSearch,
  digits: string,
  searching: boolean,
  hiddenCount: number
): string {
  if (searching && customerSearch.status === 'success') {
    return customerSearch.data.matches.length === 0
      ? `No Square customer matches "${customerSearch.query ?? ''}".`
      : 'No gift cards found for that customer.';
  }
  if (digits) return `No gift card ends in ${digits}.`;
  if (hiddenCount > 0) return 'No cards with money on them.';
  return 'No gift cards yet. Once one is sold in Square, it shows up here.';
}

/**
 * Every card, newest first, leaving out used-up and turned-off cards unless
 * the switch shows them. The search box takes the last digits of a code
 * (searched on the page), or a customer's name, email or phone (searched in
 * Square, #332).
 */
export function GiftCardsTable({
  cardsState,
  onSelect,
  onSearchCustomers,
}: GiftCardsTableProps) {
  const [search, setSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState<CustomerSearch>({
    status: 'idle',
  });
  const kind = giftCardSearchKind(search);
  const canSearchCustomers =
    onSearchCustomers !== undefined &&
    (kind === 'email' || kind === 'phone' || kind === 'name');
  const digits = kind === 'last4' ? search.replace(/\D/g, '') : '';
  const searching = customerSearch.status !== 'idle';
  const [showUsedUp, setShowUsedUp] = useState(false);

  const usedUpCount = useMemo(
    () => (cardsState.status === 'success' ? cardsState.data.filter(isGiftCardUsedUp).length : 0),
    [cardsState]
  );

  const cards = useMemo(() => {
    if (customerSearch.status === 'success') return customerSearch.data.cards;
    if (cardsState.status !== 'success') return [];
    // A search looks through every card, used up or not.
    if (!digits) {
      return showUsedUp ? cardsState.data : cardsState.data.filter((c) => !isGiftCardUsedUp(c));
    }
    // Digits are typed left to right, so "48" should already find "4821".
    return cardsState.data.filter((c) => c.last4.startsWith(digits));
  }, [cardsState, digits, customerSearch, showUsedUp]);
  const hiddenCount = !digits && !searching && !showUsedUp ? usedUpCount : 0;

  if (cardsState.status === 'error') {
    return (
      <Alert severity="error">
        Couldn&apos;t load gift cards from Square: {cardsState.error}
      </Alert>
    );
  }

  const searchCustomers = async () => {
    if (!onSearchCustomers || !canSearchCustomers) return;
    const query = search.trim();
    setCustomerSearch({ status: 'loading', query });
    try {
      const data = await onSearchCustomers(query);
      setCustomerSearch({ status: 'success', data, query });
    } catch (error) {
      setCustomerSearch({
        status: 'error',
        error: errorMessageFor(error, 'Could not search customers'),
        query,
      });
    }
  };

  const clear = () => {
    setSearch('');
    setCustomerSearch({ status: 'idle' });
  };

  const listLoading = cardsState.status !== 'success';
  const loading = listLoading || customerSearch.status === 'loading';
  let helperText: string | undefined;
  if (canSearchCustomers && !searching) {
    helperText = 'Press Enter to search Square customers.';
  } else if (!onSearchCustomers && kind !== 'last4' && kind !== 'none') {
    helperText = 'Type the last 4 digits of the code.';
  }

  return (
    <Paper variant="outlined">
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ p: 2, pb: 1, alignItems: { sm: 'flex-start' } }}
      >
        <TextField
          size="small"
          label={onSearchCustomers ? 'Last 4 digits, name, email or phone' : 'Last 4 digits'}
          placeholder={onSearchCustomers ? 'e.g. 4821 or a customer' : 'e.g. 4821'}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCustomerSearch({ status: 'idle' });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              searchCustomers();
            }
          }}
          disabled={listLoading}
          helperText={helperText}
          sx={{ minWidth: { sm: 320 } }}
          slotProps={{
            htmlInput: {
              maxLength: onSearchCustomers ? 100 : 4,
              ...(onSearchCustomers ? {} : { inputMode: 'numeric' as const }),
            },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        {canSearchCustomers && (
          <Button
            variant="outlined"
            onClick={searchCustomers}
            disabled={customerSearch.status === 'loading'}
          >
            Search customers
          </Button>
        )}
        {search && (
          <Button onClick={clear} disabled={customerSearch.status === 'loading'}>
            Show all cards
          </Button>
        )}
        {!search && usedUpCount > 0 && (
          <FormControlLabel
            sx={{ ml: { sm: 'auto' } }}
            control={
              <Switch
                size="small"
                checked={showUsedUp}
                onChange={(e) => setShowUsedUp(e.target.checked)}
              />
            }
            label={`Show used up and turned off (${usedUpCount})`}
          />
        )}
      </Stack>

      {customerSearch.status === 'error' && (
        <Alert severity="error" sx={{ mx: 2, mb: 1 }}>
          Couldn&apos;t search Square customers: {customerSearch.error}
        </Alert>
      )}
      {customerSearch.status === 'success' && customerSearch.data.matches.length > 0 && (
        <CustomerMatches result={customerSearch.data} />
      )}

      {customerSearch.status !== 'error' && (
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
              {loading && <SkeletonRows />}
              {!loading &&
                cards.map((card) => <CardRow key={card.id} card={card} onSelect={onSelect} />)}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {!loading && customerSearch.status !== 'error' && cards.length === 0 && (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="textSecondary">
            {emptyMessage(customerSearch, digits, searching, hiddenCount)}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
