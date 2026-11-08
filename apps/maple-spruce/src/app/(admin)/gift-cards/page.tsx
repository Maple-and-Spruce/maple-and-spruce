'use client';

import { useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
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
  IssueGiftCardDialog,
  MarkClassCertificateDialog,
  type GiftCardDetail,
} from '../../../components/gift-cards';
import { useClassCategories, useGiftCards } from '../../../hooks';

/**
 * Gift Cards (#297): balances, history and codes, read live from Square.
 * Selling and loading cards happen in Square. Two things happen here (#310):
 * giving a free card, and marking a register card as a class certificate.
 */
export default function GiftCardsPage() {
  const {
    giftCardsState,
    fetchGiftCards,
    fetchGiftCard,
    revealGiftCardCode,
    markClassCertificate,
    issueGiftCard,
  } = useGiftCards();
  const { categoriesState } = useClassCategories();
  const [selected, setSelected] = useState<GiftCardSummary | null>(null);
  const [detailState, setDetailState] = useState<RequestState<GiftCardDetail>>({
    status: 'idle',
  });
  const [issueOpen, setIssueOpen] = useState(false);
  const [certificateCard, setCertificateCard] = useState<GiftCardSummary | null>(null);

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
          flexWrap: 'wrap',
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
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            startIcon={<RefreshIcon />}
            onClick={fetchGiftCards}
            disabled={giftCardsState.status === 'loading'}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<CardGiftcardIcon />}
            onClick={() => setIssueOpen(true)}
          >
            Issue a gift card
          </Button>
        </Box>
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
        onMakeClassCertificate={setCertificateCard}
      />

      <MarkClassCertificateDialog
        card={certificateCard}
        categoriesState={categoriesState}
        onClose={() => setCertificateCard(null)}
        onSubmit={markClassCertificate}
        onDone={() => {
          const card = certificateCard;
          setCertificateCard(null);
          fetchGiftCards();
          if (card && selected?.id === card.id) openCard(card);
        }}
      />

      <IssueGiftCardDialog
        open={issueOpen}
        categoriesState={categoriesState}
        onClose={() => setIssueOpen(false)}
        onIssue={issueGiftCard}
        onIssued={() => fetchGiftCards()}
        onRevealCode={revealGiftCardCode}
      />
    </>
  );
}
