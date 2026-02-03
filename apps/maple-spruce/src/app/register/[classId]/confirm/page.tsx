'use client';

import { useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Container,
  Paper,
  Button,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

export default function RegistrationConfirmPage() {
  const searchParams = useSearchParams();
  const confirmationNumber = searchParams.get('confirmation') ?? '';

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
            Registration Confirmed!
          </Typography>

          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            You're all set. A confirmation email has been sent to your email
            address.
          </Typography>

          {confirmationNumber && (
            <Box
              sx={{
                p: 2,
                bgcolor: 'grey.50',
                borderRadius: 1,
                mb: 3,
              }}
            >
              <Typography variant="subtitle2" color="text.secondary">
                Confirmation Number
              </Typography>
              <Typography
                variant="h5"
                fontFamily="monospace"
                fontWeight={600}
              >
                {confirmationNumber}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
                sx={{ mt: 0.5 }}
              >
                Please save this number for your records
              </Typography>
            </Box>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            If you have any questions, please contact us at{' '}
            <Typography
              component="span"
              variant="body2"
              color="primary"
              fontWeight={500}
            >
              info@mapleandspruce.com
            </Typography>
          </Typography>

          <Button
            variant="contained"
            href="/register"
            size="large"
          >
            Browse More Classes
          </Button>
        </Paper>
      </Container>
    </Box>
  );
}
