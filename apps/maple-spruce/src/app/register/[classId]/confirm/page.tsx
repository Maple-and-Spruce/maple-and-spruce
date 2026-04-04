'use client';

import { useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Container,
  Paper,
  Button,
  Divider,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

export default function RegistrationConfirmPage() {
  const searchParams = useSearchParams();
  const confirmationNumber = searchParams.get('confirmation') ?? '';
  const customerName = searchParams.get('name') ?? '';
  const className = searchParams.get('className') ?? '';
  const amountCents = Number(searchParams.get('amount') ?? '0');
  const quantity = Number(searchParams.get('qty') ?? '1');

  const amountFormatted =
    amountCents > 0
      ? `$${(amountCents / 100).toFixed(2)}`
      : 'Free';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <CheckCircleOutlineIcon
            color="success"
            sx={{ fontSize: 64, mb: 2 }}
          />

          <Typography variant="h4" component="h1" gutterBottom>
            You&apos;re Registered!
          </Typography>

          {customerName && (
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Thanks, {customerName}! Your spot is reserved.
            </Typography>
          )}

          {className && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                {className}
              </Typography>
              <Typography variant="body1" color="text.secondary">
                {quantity > 1 ? `${quantity} spots` : '1 spot'} &middot;{' '}
                {amountFormatted}
              </Typography>
            </Box>
          )}

          <Divider sx={{ my: 2 }} />

          {confirmationNumber && (
            <Box
              sx={{
                p: 2,
                bgcolor: 'grey.50',
                borderRadius: 1,
                mb: 3,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                Confirmation Number
              </Typography>
              <Typography
                variant="body1"
                fontFamily="monospace"
                fontWeight={600}
              >
                {confirmationNumber}
              </Typography>
            </Box>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Questions? Contact us at{' '}
            <Typography
              component="a"
              href="mailto:katie@mapleandsprucefolkarts.com"
              variant="body2"
              color="primary"
              fontWeight={500}
              sx={{ textDecoration: 'none' }}
            >
              katie@mapleandsprucefolkarts.com
            </Typography>
          </Typography>

          <Button variant="contained" href="/register" size="large">
            Browse More Classes
          </Button>
        </Paper>
      </Container>
    </Box>
  );
}
