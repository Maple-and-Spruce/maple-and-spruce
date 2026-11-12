'use client';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Paper,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

/** The few things worth knowing every time, one line each. */
const ESSENTIALS: React.ReactNode[] = [
  <>Square keeps every card: its balance, code and history. This page reads them live.</>,
  <>
    The code is as good as cash. Don&apos;t text or post it. Showing a code here is
    logged.
  </>,
  <>
    Cards never expire, and work only at Maple &amp; Spruce, not Music Together.
  </>,
  <>
    Money on cards is owed to customers, not income, until it is spent. Selling a card
    has no sales tax.
  </>,
];

interface HowTo {
  title: string;
  steps: React.ReactNode[];
}

/** Step by step, folded away until needed. */
const HOW_TOS: HowTo[] = [
  {
    title: 'Sell a printed certificate',
    steps: [
      <>
        Printed certificates have no money on them until sold. Print them with{' '}
        <strong>Print gift certificates</strong> at the top.
      </>,
      <>
        On the iPad: <strong>Gift Cards</strong>, then <strong>Check Balance</strong>.
        Scan the barcode or type the MAPLE code.
      </>,
      <>Load the amount on the certificate, add the customer to the sale, and charge.</>,
    ],
  },
  {
    title: 'Sell an eGift card at the register',
    steps: [
      <>
        On the iPad: <strong>Gift Cards</strong>, then <strong>eGift Card</strong>. Square
        emails it.
      </>,
      <>
        A gift for a class? Open the card here and click{' '}
        <strong>Make it a class certificate</strong>.
      </>,
    ],
  },
  {
    title: 'Give a card for free',
    steps: [
      <>
        Click <strong>Issue a gift card</strong> at the top. Choose an amount or a class
        type, and say why.
      </>,
      <>It counts as given free, not sold. The studio covers it when it is spent.</>,
    ],
  },
  {
    title: 'Replace a lost card',
    steps: [
      <>Find the card by the customer&apos;s name, email or phone, and open it.</>,
      <>
        Click <strong>Replace lost card</strong>. The money moves to a new card and the
        lost one stops working.
      </>,
      <>
        Click <strong>Show and copy code</strong> on the new card for a fresh
        certificate.
      </>,
    ],
  },
  {
    title: 'Refund or turn off a card',
    steps: [
      <>
        Bought on the website: open it and click <strong>Refund</strong>. What is
        left goes back to the card that paid, and the gift card is left at $0.
      </>,
      <>
        Any other card: <strong>Turn off card</strong> takes the money off and stops it
        working. Refund it at the register or in Square.
      </>,
    ],
  },
];

/**
 * How gift cards work, at the top of the Gift Cards page: a few one-line
 * essentials, with the step-by-step for each task folded away until needed.
 * The full guide is docs/guides/gift-cards.md.
 */
export function GiftCardsHowItWorks() {
  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="gift-cards-how-it-works"
      sx={{ p: 2, mb: 3 }}
    >
      <Typography id="gift-cards-how-it-works" variant="h6" component="h2">
        How gift cards work
      </Typography>
      <Box component="ul" sx={{ mt: 1, mb: 1.5, pl: 2.5 }}>
        {ESSENTIALS.map((line, i) => (
          <Typography key={i} component="li" variant="body2" color="textSecondary">
            {line}
          </Typography>
        ))}
      </Box>
      <Box>
        {HOW_TOS.map((howTo) => (
          <Accordion
            key={howTo.title}
            disableGutters
            elevation={0}
            square
            sx={{ '&::before': { display: 'none' }, borderTop: 1, borderColor: 'divider' }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2" component="h3">
                {howTo.title}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
                {howTo.steps.map((step, i) => (
                  <Typography key={i} component="li" variant="body2" color="textSecondary">
                    {step}
                  </Typography>
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
    </Paper>
  );
}
