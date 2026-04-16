'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Skeleton,
  Alert,
  Chip,
  Stack,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import CampaignIcon from '@mui/icons-material/Campaign';
import EventIcon from '@mui/icons-material/Event';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import InventoryIcon from '@mui/icons-material/Inventory';
import LanguageIcon from '@mui/icons-material/Language';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PhoneIcon from '@mui/icons-material/Phone';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import StorefrontIcon from '@mui/icons-material/Storefront';
import SyncProblemIcon from '@mui/icons-material/SyncProblem';
import { formatClassPrice } from '@maple/ts/domain';
import { useSyncConflictSummary } from '@maple/react/data';
import { AppShell } from '../components/layout';
import { useClasses, useRegistrations, useProducts } from '../hooks';

const quickLinks = [
  { label: 'Wave', href: 'https://my.waveapps.com', icon: AccountBalanceIcon, color: '#1c6dd0' },
  { label: 'Tally', href: 'https://tally.so', icon: ListAltIcon, color: '#6c5ce7' },
  { label: 'MailerLite', href: 'https://app.mailerlite.com', icon: CampaignIcon, color: '#09c269' },
  { label: 'Google Drive', href: 'https://drive.google.com', icon: FolderSharedIcon, color: '#f4b400' },
  { label: 'Square', href: 'https://squareup.com/dashboard', icon: ShoppingCartIcon, color: '#006aff' },
  { label: 'Facebook Ads', href: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns', icon: CampaignIcon, color: '#1877f2' },
  { label: 'Webflow', href: 'https://webflow.com/dashboard', icon: LanguageIcon, color: '#4353ff' },
  { label: 'Firebase', href: 'https://console.firebase.google.com', icon: AdminPanelSettingsIcon, color: '#f5820d' },
  { label: 'Vercel', href: 'https://vercel.com/dashboard', icon: RocketLaunchIcon, color: '#000000' },
  { label: 'Google Voice', href: 'https://voice.google.com', icon: PhoneIcon, color: '#34a853' },
];

/** Format a date as "Mon, Mar 23" */
function formatShortDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Format time as "2:00 PM" */
function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function DashboardPage() {
  const { classesState } = useClasses();
  const { registrationsState } = useRegistrations();
  const { productsState } = useProducts();
  const { summaryState } = useSyncConflictSummary();

  // Upcoming published classes in the next 7 days
  const upcomingClasses = useMemo(() => {
    if (classesState.status !== 'success') return [];
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return classesState.data
      .filter((c) => {
        const firstDt = c.sessions?.[0]?.dateTime;
        if (!firstDt) return false;
        const dt = firstDt instanceof Date ? firstDt : new Date(firstDt);
        return c.status === 'published' && dt >= now && dt <= weekFromNow;
      })
      .sort((a, b) => {
        const aFirst = a.sessions?.[0]?.dateTime;
        const bFirst = b.sessions?.[0]?.dateTime;
        return (
          (aFirst instanceof Date ? aFirst : new Date(aFirst)).getTime() -
          (bFirst instanceof Date ? bFirst : new Date(bFirst)).getTime()
        );
      });
  }, [classesState]);

  // Registration counts per class
  const registrationsByClass = useMemo(() => {
    if (registrationsState.status !== 'success') return new Map<string, number>();
    const map = new Map<string, number>();
    for (const reg of registrationsState.data) {
      if (reg.status === 'confirmed' || reg.status === 'pending') {
        map.set(reg.classId, (map.get(reg.classId) ?? 0) + reg.quantity);
      }
    }
    return map;
  }, [registrationsState]);

  // Recent registrations (last 7 days)
  const recentRegistrations = useMemo(() => {
    if (registrationsState.status !== 'success') return [];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return registrationsState.data
      .filter(
        (r) =>
          new Date(r.createdAt) >= weekAgo &&
          (r.status === 'confirmed' || r.status === 'pending')
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 5);
  }, [registrationsState]);

  // Class name lookup
  const classNameMap = useMemo(() => {
    if (classesState.status !== 'success') return new Map<string, string>();
    const map = new Map<string, string>();
    for (const c of classesState.data) {
      map.set(c.id, c.name);
    }
    return map;
  }, [classesState]);

  // Low stock products (quantity <= 2, active only)
  const lowStockProducts = useMemo(() => {
    if (productsState.status !== 'success') return [];
    return productsState.data
      .filter((p) => p.status === 'active' && p.squareCache.quantity <= 2)
      .sort((a, b) => a.squareCache.quantity - b.squareCache.quantity)
      .slice(0, 5);
  }, [productsState]);

  // Sync conflicts count
  const pendingConflicts = useMemo(() => {
    if (summaryState.status !== 'success') return 0;
    return summaryState.data.pending;
  }, [summaryState]);

  const isLoading =
    classesState.status === 'loading' ||
    classesState.status === 'idle' ||
    registrationsState.status === 'loading' ||
    registrationsState.status === 'idle';

  return (
    <AppShell>
      <Typography variant="h4" component="h1" gutterBottom>
        Dashboard
      </Typography>

      <Grid container spacing={3}>
        {/* Upcoming Classes */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="h6" gutterBottom>
            <EventIcon
              fontSize="small"
              sx={{ verticalAlign: 'middle', mr: 0.5 }}
            />
            Upcoming Classes (7 days)
          </Typography>

          {isLoading ? (
            <Stack spacing={1}>
              <Skeleton variant="rounded" height={72} />
              <Skeleton variant="rounded" height={72} />
            </Stack>
          ) : classesState.status === 'error' ? (
            <Alert severity="error">{classesState.error}</Alert>
          ) : upcomingClasses.length === 0 ? (
            <Card variant="outlined">
              <CardContent>
                <Typography color="text.secondary">
                  No classes scheduled this week
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Stack spacing={1}>
              {upcomingClasses.map((c) => {
                const regCount = registrationsByClass.get(c.id) ?? 0;
                const spotsLeft = c.capacity - regCount;
                return (
                  <Card key={c.id} variant="outlined">
                    <CardActionArea
                      component={Link}
                      href="/classes"
                      sx={{ px: 2, py: 1.5 }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Box>
                          <Typography variant="subtitle2">
                            {c.name}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {c.sessions?.[0] && formatShortDate(
                              c.sessions[0].dateTime instanceof Date
                                ? c.sessions[0].dateTime
                                : new Date(c.sessions[0].dateTime)
                            )} at{' '}
                            {c.sessions?.[0] && formatTime(
                              c.sessions[0].dateTime instanceof Date
                                ? c.sessions[0].dateTime
                                : new Date(c.sessions[0].dateTime)
                            )}{c.sessions.length > 1 ? ` (+${c.sessions.length - 1})` : ''} &middot;{' '}
                            {formatClassPrice(c.priceCents)}
                          </Typography>
                        </Box>
                        <Chip
                          label={`${regCount}/${c.capacity}`}
                          size="small"
                          color={
                            spotsLeft === 0
                              ? 'error'
                              : spotsLeft <= 3
                                ? 'warning'
                                : 'default'
                          }
                          variant={spotsLeft === 0 ? 'filled' : 'outlined'}
                        />
                      </Box>
                    </CardActionArea>
                  </Card>
                );
              })}
            </Stack>
          )}
        </Grid>

        {/* Recent Registrations */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="h6" gutterBottom>
            <HowToRegIcon
              fontSize="small"
              sx={{ verticalAlign: 'middle', mr: 0.5 }}
            />
            Recent Registrations
          </Typography>

          {registrationsState.status === 'loading' ||
          registrationsState.status === 'idle' ? (
            <Stack spacing={1}>
              <Skeleton variant="rounded" height={56} />
              <Skeleton variant="rounded" height={56} />
            </Stack>
          ) : registrationsState.status === 'error' ? (
            <Alert severity="error">{registrationsState.error}</Alert>
          ) : recentRegistrations.length === 0 ? (
            <Card variant="outlined">
              <CardContent>
                <Typography color="text.secondary">
                  No registrations this week
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Stack spacing={1}>
              {recentRegistrations.map((r) => (
                <Card key={r.id} variant="outlined">
                  <CardActionArea
                    component={Link}
                    href="/registrations"
                    sx={{ px: 2, py: 1.5 }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Box>
                        <Typography variant="subtitle2">
                          {r.customerName}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {classNameMap.get(r.classId) ?? 'Unknown class'}{' '}
                          &middot; {formatShortDate(r.createdAt)}
                        </Typography>
                      </Box>
                      <Chip
                        label={r.status}
                        size="small"
                        color={
                          r.status === 'confirmed' ? 'success' : 'warning'
                        }
                        variant="outlined"
                      />
                    </Box>
                  </CardActionArea>
                </Card>
              ))}
            </Stack>
          )}
        </Grid>

        {/* Low Stock */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="h6" gutterBottom>
            <InventoryIcon
              fontSize="small"
              sx={{ verticalAlign: 'middle', mr: 0.5 }}
            />
            Low Stock
          </Typography>

          {productsState.status === 'loading' ||
          productsState.status === 'idle' ? (
            <Stack spacing={1}>
              <Skeleton variant="rounded" height={56} />
              <Skeleton variant="rounded" height={56} />
            </Stack>
          ) : productsState.status === 'error' ? (
            <Alert severity="error">{productsState.error}</Alert>
          ) : lowStockProducts.length === 0 ? (
            <Card variant="outlined">
              <CardContent>
                <Typography color="text.secondary">
                  All products well-stocked
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Stack spacing={1}>
              {lowStockProducts.map((p) => (
                <Card key={p.id} variant="outlined">
                  <CardActionArea
                    component={Link}
                    href="/inventory"
                    sx={{ px: 2, py: 1.5 }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Typography variant="subtitle2">
                        {p.squareCache.name}
                      </Typography>
                      <Chip
                        label={
                          p.squareCache.quantity === 0
                            ? 'Out of stock'
                            : `${p.squareCache.quantity} left`
                        }
                        size="small"
                        color={
                          p.squareCache.quantity === 0 ? 'error' : 'warning'
                        }
                        variant={
                          p.squareCache.quantity === 0 ? 'filled' : 'outlined'
                        }
                      />
                    </Box>
                  </CardActionArea>
                </Card>
              ))}
            </Stack>
          )}
        </Grid>

        {/* Sync Conflicts */}
        {pendingConflicts > 0 && (
          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined">
              <CardActionArea
                component={Link}
                href="/sync-conflicts"
                sx={{ px: 2, py: 2 }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                  }}
                >
                  <SyncProblemIcon color="warning" />
                  <Box>
                    <Typography variant="subtitle2">
                      {pendingConflicts} sync conflict
                      {pendingConflicts !== 1 ? 's' : ''} pending
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Review and resolve inventory discrepancies
                    </Typography>
                  </Box>
                </Box>
              </CardActionArea>
            </Card>
          </Grid>
        )}

        {/* Quick Links */}
        <Grid size={12}>
          <Typography variant="h6" gutterBottom sx={{ mt: 1 }}>
            <StorefrontIcon
              fontSize="small"
              sx={{ verticalAlign: 'middle', mr: 0.5 }}
            />
            Quick Links
          </Typography>
          <Grid container spacing={1.5}>
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Grid key={link.label} size={{ xs: 6, sm: 4, md: 3, lg: 2.4 }}>
                  <Card variant="outlined">
                    <CardActionArea
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        py: 2,
                        px: 1,
                      }}
                    >
                      <Icon sx={{ fontSize: 36, color: link.color, mb: 0.5 }} />
                      <Typography variant="body2" noWrap>
                        {link.label}
                      </Typography>
                    </CardActionArea>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Grid>
      </Grid>
    </AppShell>
  );
}
