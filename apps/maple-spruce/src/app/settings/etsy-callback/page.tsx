'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useEtsyConnection } from '@maple/react/data';

export default function EtsyCallbackPage(): React.ReactNode {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { callbackState, handleCallback } = useEtsyConnection();
  const hasRun = useRef(false);

  const code = searchParams.get('code');
  const state = searchParams.get('state');

  useEffect(() => {
    if (code && state && !hasRun.current) {
      hasRun.current = true;
      handleCallback(code, state);
    }
  }, [code, state, handleCallback]);

  if (!code || !state) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">
            Missing authorization parameters. Please try connecting Etsy again
            from the Settings page.
          </Alert>
          <Button sx={{ mt: 2 }} onClick={() => router.push('/settings')}>
            Back to Settings
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Connecting Etsy
      </Typography>

      <Card>
        <CardContent>
          <Stack spacing={2} alignItems="center">
            {callbackState.status === 'loading' && (
              <>
                <CircularProgress />
                <Typography>Exchanging authorization code...</Typography>
              </>
            )}

            {callbackState.status === 'success' && (
              <>
                <CheckCircleIcon color="success" sx={{ fontSize: 48 }} />
                <Typography variant="h6">Etsy Connected</Typography>
                {callbackState.data.shopId && (
                  <Typography variant="body2" color="text.secondary">
                    Shop ID: {callbackState.data.shopId}
                  </Typography>
                )}
                <Button
                  variant="contained"
                  onClick={() => router.push('/settings')}
                >
                  Back to Settings
                </Button>
              </>
            )}

            {callbackState.status === 'error' && (
              <>
                <Alert severity="error">{callbackState.error}</Alert>
                <Button
                  variant="outlined"
                  onClick={() => router.push('/settings')}
                >
                  Back to Settings
                </Button>
              </>
            )}

            {callbackState.status === 'idle' && (
              <>
                <CircularProgress />
                <Typography>Preparing...</Typography>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>
    </>
  );
}
