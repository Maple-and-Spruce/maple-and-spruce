'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Collapse,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface Section {
  title: string;
  body: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    title: 'Square keeps every gift card',
    body: (
      <>
        Each card&apos;s balance, code and history live in Square. This page
        reads them from Square each time it opens. Selling at the register,
        adding money and refunds happen in Square. This page makes two kinds
        of card itself: free ones and printed certificates (see below).
      </>
    ),
  },
  {
    title: 'Where people buy them',
    body: (
      <>
        <strong>Online</strong> on the gift card page of our own website,
        which emails the code to the buyer or the person it&apos;s for.{' '}
        <strong>In the shop</strong>, a printed certificate from the stack (see
        below), or an eGift card at the register: Gift Cards, then eGift Card.
        Square asks for an email address and sends the card there.
      </>
    ),
  },
  {
    title: 'Where they can be spent',
    body: (
      <>
        At the register, by scanning the barcode or typing the code, on
        anything in the shop, and online when booking a class. Only Maple
        &amp; Spruce: Music Together is a separate Square account and cannot
        take these cards.
      </>
    ),
  },
  {
    title: 'Printed certificates',
    body: (
      <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
        <li>
          Click <strong>Print gift certificates</strong> at the top. Choose the
          design, a dollar amount or a class type, and how many.
        </li>
        <li>
          Each one is made and loaded in Square straight away, so it can be
          spent as soon as it is printed. Print them, then keep the stack
          somewhere safe, like cash.
        </li>
        <li>
          To sell one, ring up the <strong>Gift certificate</strong> item at the
          register, type the amount on the certificate, and leave tax off. That
          is all: nothing to do on this page.
        </li>
        <li>
          Until one is spent, it counts under &quot;Printed certificates not yet
          used&quot;, not as owed to a customer.
        </li>
      </Box>
    ),
  },
  {
    title: 'An eGift card sold at the register',
    body: (
      <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
        <li>
          Find the card below. The newest is at the top, or search by its last
          4 digits.
        </li>
        <li>
          If it is a gift for a class, open it and click{' '}
          <strong>Make it a class certificate</strong>, then choose the class
          type. That records which class it is for, worth what was put on it.
          Nothing changes in Square.
        </li>
        <li>To write it on a card, open it and click Show and copy code.</li>
      </Box>
    ),
  },
  {
    title: 'Giving a card for free',
    body: (
      <>
        For a raffle prize, a thank-you or a make-good, click{' '}
        <strong>Issue a gift card</strong> at the top. Choose an amount, or a
        class type and its value, and say why. Square makes the card with the
        money on it, but nobody pays for it: when it is spent, the studio
        covers it. It counts under &quot;Given free this month&quot;, not as
        sold. Each free card is logged with who gave it and why.
      </>
    ),
  },
  {
    title: 'Treat the code like cash',
    body: (
      <>
        Anyone with the code can spend the balance. Don&apos;t text or post it,
        and keep printed certificates out of sight until they are sold. Each
        time codes are shown here, for one card or a printed batch, it is
        logged with who asked.
      </>
    ),
  },
  {
    title: 'What "Owed to customers" means',
    body: (
      <>
        Money people have paid for gift cards and not spent yet. It is not
        income until it is spent: selling a gift card or a printed certificate
        is not a sale, has no sales tax and pays no artist. When a card pays
        for a piece, that sale pays the artist their usual split.
      </>
    ),
  },
  {
    title: 'They never expire',
    body: <>A balance stays on the card until it is spent.</>,
  },
];

/**
 * A plain-language explanation of how gift cards work, at the top of the
 * Gift Cards page. Open by default: this page is used rarely, and the steps
 * matter most when you've forgotten them.
 */
export function GiftCardsHowItWorks({
  defaultOpen = true,
}: {
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="gift-cards-how-it-works"
      sx={{ p: 2, mb: 3 }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Typography id="gift-cards-how-it-works" variant="h6" component="h2">
          How gift cards work
        </Typography>
        <Button
          size="small"
          onClick={() => setOpen((v) => !v)}
          endIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          aria-expanded={open}
        >
          {open ? 'Hide' : 'Show'}
        </Button>
      </Box>
      <Collapse in={open}>
        <Box
          sx={{
            mt: 2,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
            gap: 2.5,
          }}
        >
          {SECTIONS.map((section) => (
            <Stack key={section.title} spacing={0.5}>
              <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
                {section.title}
              </Typography>
              <Typography variant="body2" component="div" color="textSecondary">
                {section.body}
              </Typography>
            </Stack>
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
}
