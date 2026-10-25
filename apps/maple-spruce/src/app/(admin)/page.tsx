'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Card, CardActionArea } from '@mui/material';
import Grid from '@mui/material/Grid';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import BusinessIcon from '@mui/icons-material/Business';
import CampaignIcon from '@mui/icons-material/Campaign';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import LanguageIcon from '@mui/icons-material/Language';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PhoneIcon from '@mui/icons-material/Phone';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import SchoolIcon from '@mui/icons-material/School';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { RequestStateUtil, type RequestState } from '@maple/ts/domain';
import type { StudioDayLesson } from '@maple/ts/firebase/api-types';
import { fonts, text } from '@maple/react/theme';
import { useRoles } from '@maple/react/auth';
import { useInbox, useStudioDay } from '@maple/react/data';
import { RoomStatusCard } from '@maple/react/events';
import { useClasses, useRegistrations } from '../../hooks';
import {
  ClassesThisWeekCard,
  DashboardGrid,
  InboxCard,
  RecentRegistrationsCard,
  TodayCard,
  formatLongDate,
  inboxSummarySuffix,
  todayCounts,
  todaySummaryText,
} from '../../components/dashboard';

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
  { label: 'Hope Scholarship', href: 'https://app.hopescholarshipwv.com/esa/esa_vendor_admin/landing', icon: SchoolIcon, color: '#b71c1c' },
  { label: 'WV MyTaxes', href: 'https://mytaxes.wvtax.gov', icon: ReceiptLongIcon, color: '#0b6e4f' },
  { label: 'Apple Business', href: 'https://business.apple.com/main/home', icon: BusinessIcon, color: '#555555' },
];

/** The current time, ticking each minute so the NOW line and "ended" drift right. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** "Wednesday, October 14", with an optional one-line summary on the right. */
function DashboardHeader({ now, summary }: { now: Date; summary?: string }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        columnGap: 2,
        rowGap: 0.5,
        mb: 2.5,
      }}
    >
      <Typography
        component="h1"
        sx={{
          fontFamily: fonts.heading,
          fontSize: 32,
          lineHeight: 1.2,
          color: text.primary,
        }}
      >
        {formatLongDate(now)}
      </Typography>
      {summary && (
        <Typography color="textSecondary" sx={{ fontSize: 15 }}>
          {summary}
        </Typography>
      )}
    </Box>
  );
}

/**
 * The business dashboard (#235) — admin + clerk only, so its role-gated
 * fetches never fire for roles that would just get 403s. A clerk sees
 * classes and registrations; the studio-wide lesson day and the Inbox are
 * admin-only, and their hooks stay disabled for a clerk. Pending sync
 * conflicts are an Inbox row now, not a card of their own.
 */
function StaffDashboard({ isAdmin, now }: { isAdmin: boolean; now: Date }) {
  const { classesState } = useClasses();
  const { registrationsState } = useRegistrations();
  const { dayState } = useStudioDay(isAdmin);
  const { inboxState, dismiss, dismissError, clearDismissError } =
    useInbox(isAdmin);

  const lessonsState = useMemo<RequestState<StudioDayLesson[]> | null>(
    () => (isAdmin ? RequestStateUtil.map(dayState, (d) => d.lessons) : null),
    [isAdmin, dayState]
  );

  const summary = useMemo(() => {
    if (classesState.status !== 'success') return undefined;
    if (lessonsState && lessonsState.status !== 'success') return undefined;
    const counts = todayCounts(
      lessonsState?.status === 'success' ? lessonsState.data : null,
      classesState.data,
      now,
      // Private hours count only when booked, so the summary needs bookings.
      registrationsState.status === 'success' ? registrationsState.data : []
    );
    const inbox =
      isAdmin && inboxState.status === 'success'
        ? inboxSummarySuffix(inboxState.data.length)
        : '';
    return todaySummaryText(counts.lessons, counts.classes) + inbox;
  }, [classesState, lessonsState, inboxState, isAdmin, now, registrationsState]);

  return (
    <>
      <DashboardHeader now={now} summary={summary} />
      <DashboardGrid>
        <TodayCard
          lessonsState={lessonsState}
          classesState={classesState}
          registrationsState={registrationsState}
          now={now}
        />
        <RecentRegistrationsCard
          registrationsState={registrationsState}
          classesState={classesState}
          now={now}
        />
        {isAdmin && (
          <InboxCard
            inboxState={inboxState}
            now={now}
            onDismiss={dismiss}
            dismissError={dismissError}
            onClearDismissError={clearDismissError}
          />
        )}
        <ClassesThisWeekCard
          classesState={classesState}
          registrationsState={registrationsState}
          now={now}
        />
      </DashboardGrid>

    </>
  );
}

export default function DashboardPage() {
  const { isAdmin, roles } = useRoles();
  const isClerk = roles.includes('clerk');
  const now = useNow();

  // Teachers and other roles keep the Spruce Room status they had before.
  if (!isAdmin && !isClerk) {
    return (
      <>
        <DashboardHeader now={now} />
        <RoomStatusCard
          room="spruce"
          bookHref="/book-room"
          scheduleHref="/room-schedule"
        />
      </>
    );
  }

  return (
    <>
      <StaffDashboard isAdmin={isAdmin} now={now} />

      <Grid container spacing={3} sx={{ mt: 1 }}>
        {/* Quick Links — external business accounts, admin only */}
        {isAdmin && (
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
        )}
      </Grid>
    </>
  );
}
