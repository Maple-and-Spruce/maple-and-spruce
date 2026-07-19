'use client';

import { useCallback } from 'react';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import StorefrontIcon from '@mui/icons-material/Storefront';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useEtsyConnection } from '@maple/react/data';
import { LessonRatesConfigCard } from '../../../components/lessons';
import { PosLessonConfigCard } from '../../../components/pos';
import { BusinessVenmoConfigCard } from '../../../components/my-day';

export default function SettingsPage(): React.ReactNode {
  const {
    connectionState,
    authUrlState,
    refreshShopIdState,
    generateAuthUrl,
    refreshShopId,
  } = useEtsyConnection();

  const handleConnectEtsy = useCallback(async () => {
    const result = await generateAuthUrl();
    if (result?.url) {
      window.location.href = result.url;
    }
  }, [generateAuthUrl]);

  const isConnected =
    connectionState.status === 'success' && connectionState.data.connected;
  const isTokenValid =
    connectionState.status === 'success' && connectionState.data.tokenValid;
  const storedShopId =
    connectionState.status === 'success'
      ? connectionState.data.shopId
      : undefined;
  const shopIdMissing = isConnected && !storedShopId;
  const isRefreshingShopId = refreshShopIdState.status === 'loading';
  const refreshError =
    refreshShopIdState.status === 'success' && !refreshShopIdState.data.success
      ? refreshShopIdState.data.error
      : refreshShopIdState.status === 'error'
        ? refreshShopIdState.error
        : undefined;

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <StorefrontIcon color="primary" />
              <Typography variant="h6">Etsy Connection</Typography>
              {connectionState.status === 'success' && (
                <Chip
                  label={
                    isConnected
                      ? isTokenValid
                        ? 'Connected'
                        : 'Token Expired'
                      : 'Not Connected'
                  }
                  color={
                    isConnected
                      ? isTokenValid
                        ? 'success'
                        : 'warning'
                      : 'default'
                  }
                  size="small"
                />
              )}
            </Stack>

            {connectionState.status === 'loading' && (
              <CircularProgress size={24} />
            )}

            {connectionState.status === 'error' && (
              <Alert severity="error">{connectionState.error}</Alert>
            )}

            {connectionState.status === 'success' && isConnected && (
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  Shop ID: {storedShopId ?? 'Unknown'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  User ID: {connectionState.data.userId ?? 'Unknown'}
                </Typography>
                {!isTokenValid && (
                  <Alert severity="warning">
                    Access token has expired. Click below to re-authorize.
                  </Alert>
                )}
                {shopIdMissing && (
                  <Alert
                    severity="warning"
                    action={
                      <Button
                        color="inherit"
                        size="small"
                        onClick={refreshShopId}
                        disabled={isRefreshingShopId}
                        startIcon={
                          isRefreshingShopId ? (
                            <CircularProgress size={16} />
                          ) : (
                            <RefreshIcon />
                          )
                        }
                      >
                        Refresh
                      </Button>
                    }
                  >
                    Shop ID is missing. Etsy listings can't be fetched until
                    it's resolved.
                  </Alert>
                )}
                {refreshError && (
                  <Alert severity="error">
                    Couldn't resolve shop ID: {refreshError}
                  </Alert>
                )}
              </Stack>
            )}

            {connectionState.status === 'success' && !isConnected && (
              <Typography variant="body2" color="text.secondary">
                Connect your Etsy shop to sync product listings.
              </Typography>
            )}

            <Button
              variant="contained"
              onClick={handleConnectEtsy}
              disabled={authUrlState.status === 'loading'}
              startIcon={
                authUrlState.status === 'loading' ? (
                  <CircularProgress size={20} />
                ) : (
                  <StorefrontIcon />
                )
              }
            >
              {isConnected ? 'Re-authorize Etsy' : 'Connect Etsy'}
            </Button>

            {authUrlState.status === 'error' && (
              <Alert severity="error">{authUrlState.error}</Alert>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Box sx={{ mt: 3 }}>
        <PosLessonConfigCard />
      </Box>

      <Box sx={{ mt: 3 }}>
        <LessonRatesConfigCard />
      </Box>

      <Box sx={{ mt: 3 }}>
        <BusinessVenmoConfigCard />
      </Box>
    </>
  );
}
