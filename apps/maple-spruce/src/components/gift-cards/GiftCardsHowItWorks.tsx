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
        reads them from Square each time it opens. Nothing here changes a card:
        selling, adding money and refunds all happen in Square.
      </>
    ),
  },
  {
    title: 'Where people buy them',
    body: (
      <>
        <strong>Online</strong> on Square&apos;s eGift card page, which emails
        the card to the buyer or the person it&apos;s for.{' '}
        <strong>In the shop</strong> at the register: Gift Cards, then eGift
        Card. Square asks for an email address and sends the card there.
      </>
    ),
  },
  {
    title: 'Where they can be spent',
    body: (
      <>
        At the register, by scanning or typing the code, on anything in the
        shop. Only Maple &amp; Spruce: Music Together is a separate Square
        account and cannot take these cards. Paying for classes online with a
        gift card is not switched on yet.
      </>
    ),
  },
  {
    title: 'Making a printed certificate',
    body: (
      <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
        <li>
          Sell an eGift card at the register. When Square asks for an email,
          enter the buyer&apos;s or the shop&apos;s.
        </li>
        <li>
          Find the card below. The newest is at the top, or search by its last
          4 digits.
        </li>
        <li>Open it and click Show and copy code.</li>
        <li>Paste the code into the Canva certificate and print it.</li>
      </Box>
    ),
  },
  {
    title: 'Treat the code like cash',
    body: (
      <>
        Anyone with the code can spend the balance, so only show it when you are
        making a certificate, and don&apos;t text or post it. Each time a code
        is shown here, it is logged with who asked.
      </>
    ),
  },
  {
    title: 'What "Owed to customers" means',
    body: (
      <>
        Money people have paid for gift cards and not spent yet. It is not
        income until it is spent: selling a gift card is not a sale, has no
        sales tax and pays no artist. When a card pays for a piece, that sale
        pays the artist their usual split.
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
