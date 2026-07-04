'use client';

import { ReactNode, useMemo } from 'react';
import HomeIcon from '@mui/icons-material/Home';
import InventoryIcon from '@mui/icons-material/Inventory';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import PeopleIcon from '@mui/icons-material/People';
import CategoryIcon from '@mui/icons-material/Category';
import SyncProblemIcon from '@mui/icons-material/SyncProblem';
import SchoolIcon from '@mui/icons-material/School';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import PaymentsIcon from '@mui/icons-material/Payments';
import EventIcon from '@mui/icons-material/Event';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import EventNoteIcon from '@mui/icons-material/EventNote';
import TuneIcon from '@mui/icons-material/Tune';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import SettingsIcon from '@mui/icons-material/Settings';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import GavelIcon from '@mui/icons-material/Gavel';
import CardMembershipIcon from '@mui/icons-material/CardMembership';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import { AppShell, type NavGroup } from '@maple/react/layout';
import { useSyncConflictSummary } from '@maple/react/data';

interface AppShellWrapperProps {
  children: ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
}

/**
 * App-specific wrapper around the library's AppShell component.
 * Provides the grouped navigation configuration for the admin app.
 *
 * Only admins reach this layout (via AdminGuard in (admin)/layout.tsx),
 * so the nav is the same for everyone who sees it.
 */
export function AppShellWrapper({
  children,
  maxWidth = 'lg',
}: AppShellWrapperProps): ReactNode {
  const { summaryState } = useSyncConflictSummary();

  const pendingConflicts = useMemo(() => {
    if (summaryState.status !== 'success') return 0;
    return summaryState.data.pending;
  }, [summaryState]);

  const navGroups: NavGroup[] = useMemo(
    () => [
      {
        label: 'Store',
        items: [
          { label: 'Home', href: '/', icon: <HomeIcon /> },
          {
            label: 'Inventory',
            href: '/inventory',
            icon: <InventoryIcon />,
          },
          {
            label: 'Sales',
            href: '/sales',
            icon: <PointOfSaleIcon />,
          },
          {
            label: 'Categories',
            href: '/categories',
            icon: <CategoryIcon />,
          },
          { label: 'Artists', href: '/artists', icon: <PeopleIcon /> },
          {
            label: 'Artist Payouts',
            href: '/payouts/artist-payouts',
            icon: <AccountBalanceWalletIcon />,
          },
          {
            label: 'Sync',
            href: '/sync-conflicts',
            icon: <SyncProblemIcon />,
            badge: pendingConflicts,
            badgeColor: 'warning',
          },
        ],
      },
      {
        label: 'Classes',
        items: [
          { label: 'Classes', href: '/classes', icon: <EventIcon /> },
          {
            label: 'Class Categories',
            href: '/class-categories',
            icon: <CategoryIcon />,
          },
          {
            label: 'Instructors',
            href: '/instructors',
            icon: <SchoolIcon />,
          },
          {
            label: 'Discounts',
            href: '/discounts',
            icon: <LocalOfferIcon />,
          },
          {
            label: 'Registrations',
            href: '/registrations',
            icon: <HowToRegIcon />,
          },
          {
            label: 'Agreements',
            href: '/agreements',
            icon: <GavelIcon />,
          },
          {
            label: 'Craft Club',
            href: '/craft-club',
            icon: <CardMembershipIcon />,
          },
        ],
      },
      {
        label: 'Music Lessons',
        items: [
          {
            label: 'Students',
            href: '/students',
            icon: <MusicNoteIcon />,
          },
          {
            label: 'Teacher Payouts',
            href: '/payouts',
            icon: <PaymentsIcon />,
          },
        ],
      },
      {
        label: 'Music Together',
        items: [
          {
            label: 'Sections',
            href: '/music-together',
            icon: <ChildCareIcon />,
          },
        ],
      },
      {
        label: 'Calendar',
        items: [
          {
            label: 'Events',
            href: '/events',
            icon: <CalendarMonthIcon />,
          },
          {
            label: 'Spruce Room Schedule',
            href: '/room-schedule',
            icon: <EventNoteIcon />,
          },
          {
            label: 'Book the Spruce Room',
            href: '/book-room',
            icon: <MeetingRoomIcon />,
          },
          {
            label: 'Embed Settings',
            href: '/calendar-embed',
            icon: <TuneIcon />,
          },
        ],
      },
      {
        label: 'Admin',
        items: [
          {
            label: 'Users',
            href: '/users',
            icon: <ManageAccountsIcon />,
          },
          {
            label: 'Settings',
            href: '/settings',
            icon: <SettingsIcon />,
          },
        ],
      },
    ],
    [pendingConflicts]
  );

  return (
    <AppShell navGroups={navGroups} maxWidth={maxWidth}>
      {children}
    </AppShell>
  );
}
