'use client';

import { useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import type {
  GiftCardSummary,
  GiftCardTotals,
  RequestState,
} from '@maple/ts/domain';
import {
  GiftCardDetailDialog,
  GiftCardsHowItWorks,
  GiftCardsTable,
  GiftCardTotalsCards,
  type GiftCardDetail,
} from '../../../components/gift-cards';
import { useGiftCards } from '../../../hooks';

/**
 * Gift Cards (#297): balances, history and codes, read live from Square.
 * Read-only; selling and loading cards happen in Square.
 */
export default function GiftCardsPage() {
  const { giftCardsState, fetchGiftCards, fetchGiftCard, revealGiftCardCode } =
    useGiftCards();
  const [selected, setSelected] = useState<GiftCardSummary | null>(null);
  const [detailState, setDetailState] = useState<RequestState<GiftCardDetail>>({
    status: 'idle',
  });

  const totalsState = useMemo<RequestState<GiftCardTotals>>(
    () =>
      giftCardsState.status === 'success'
        ? { status: 'success', data: giftCardsState.data.totals }
        : giftCardsState,
    [giftCardsState]
  );
  const cardsState = useMemo<RequestState<GiftCardSummary[]>>(
    () =>
      giftCardsState.status === 'success'
        ? { status: 'success', data: giftCardsState.data.cards }
        : giftCardsState,
    [giftCardsState]
  );

  const openCard = async (card: GiftCardSummary) => {
    setSelected(card);
    setDetailState({ status: 'loading' });
    try {
      setDetailState({ status: 'success', data: await fetchGiftCard(card.id) });
    } catch (error) {
      setDetailState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to load card',
      });
    }
  };

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            Gift Cards
          </Typography>
          <Typography color="textSecondary">
            Every Maple &amp; Spruce gift card, read from Square.
          </Typography>
        </Box>
        <Button
          startIcon={<RefreshIcon />}
          onClick={fetchGiftCards}
          disabled={giftCardsState.status === 'loading'}
        >
          Refresh
        </Button>
      </Box>

      <GiftCardsHowItWorks />
      <GiftCardTotalsCards totalsState={totalsState} />
      <GiftCardsTable cardsState={cardsState} onSelect={openCard} />

      <GiftCardDetailDialog
        card={selected}
        detailState={detailState}
        onClose={() => {
          setSelected(null);
          setDetailState({ status: 'idle' });
        }}
        onRevealCode={revealGiftCardCode}
      />
    </>
  );
}
