'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, Skeleton, Stack, Typography } from '@mui/material';
import type { RequestState } from '@maple/ts/domain';
import type {
  GetGiftCardBuyerResponse,
  GiftCardCustomer,
} from '@maple/ts/firebase/api-types';
import { formatGiftCardDate } from './format';

interface GiftCardBuyerBoxProps {
  giftCardId: string;
  /** Reads the buyer live from Square. Nothing about them is stored. */
  onLoadBuyer: (id: string) => Promise<GetGiftCardBuyerResponse>;
}

/** "Robin Ashfield · robin@example.com · (304) 555-0142", only the parts Square has. */
function contactLine(customer: GiftCardCustomer): string {
  const parts = [customer.name, customer.email, customer.phone].filter(
    (p): p is string => Boolean(p)
  );
  return parts.length > 0 ? parts.join(' · ') : 'a customer with no name or contact';
}

const BOX_SX = { p: 2, mb: 2, border: 1, borderColor: 'divider', borderRadius: 1 } as const;

/**
 * Who bought a card at the register (#332): the customer Katie added to the
 * sale, read from Square each time the card is opened. Give it a `key` of the
 * card id so another card loads its own buyer.
 */
export function GiftCardBuyerBox({ giftCardId, onLoadBuyer }: GiftCardBuyerBoxProps) {
  const [buyerState, setBuyerState] = useState<RequestState<GetGiftCardBuyerResponse>>({
    status: 'idle',
  });

  useEffect(() => {
    let current = true;
    setBuyerState({ status: 'loading' });
    onLoadBuyer(giftCardId).then(
      (data) => {
        if (current) setBuyerState({ status: 'success', data });
      },
      (error: unknown) => {
        if (current) {
          setBuyerState({
            status: 'error',
            error: error instanceof Error ? error.message : 'Could not read the sale',
          });
        }
      }
    );
    return () => {
      current = false;
    };
  }, [giftCardId, onLoadBuyer]);

  if (buyerState.status === 'error') {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Couldn&apos;t read who bought this card from Square: {buyerState.error}
      </Alert>
    );
  }

  if (buyerState.status !== 'success') {
    return (
      <Box sx={BOX_SX} aria-busy="true" aria-label="Loading who bought this card">
        <Skeleton width="80%" />
      </Box>
    );
  }

  const { sale, linkedCustomers } = buyerState.data;
  return (
    <Box component="section" aria-label="Buyer" sx={BOX_SX}>
      <Stack spacing={0.5}>
        {sale?.customer ? (
          <Typography variant="body2">
            Sold at the register on {formatGiftCardDate(sale.soldAt)} to{' '}
            {contactLine(sale.customer)}
          </Typography>
        ) : (
          <Typography variant="body2">
            {sale ? `Sold at the register on ${formatGiftCardDate(sale.soldAt)}. ` : ''}
            No customer was added at the register.
          </Typography>
        )}
        {linkedCustomers.map((customer) => (
          <Typography key={customer.id} variant="body2" color="textSecondary">
            Linked in Square: {contactLine(customer)}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}
