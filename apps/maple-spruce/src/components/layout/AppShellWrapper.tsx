'use client';

import { ReactNode, useMemo } from 'react';
import HomeIcon from '@mui/icons-material/Home';
import InventoryIcon from '@mui/icons-material/Inventory';
import PeopleIcon from '@mui/icons-material/People';
import CategoryIcon from '@mui/icons-material/Category';
import SyncProblemIcon from '@mui/icons-material/SyncProblem';
import { AppShell, type NavItem } from '@maple/react/layout';
import { useSyncConflictSummary } from '@maple/react/data';

interface AppShellWrapperProps {
  children: ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
}

/**
 * App-specific wrapper around the library's AppShell component.
 * Provides the navigation configuration for Maple & Spruce.
 */
export function AppShellWrapper({
  children,
  maxWidth = 'lg',
}: AppShellWrapperProps) {
  // Fetch sync conflict summary for badge count
  const { summaryState } = useSyncConflictSummary();

  const pendingConflicts = useMemo(() => {
    if (summaryState.status !== 'success') return 0;
    return summaryState.data.pending;
  }, [summaryState]);

  const navItems: NavItem[] = useMemo(
    () => [
      { label: 'Home', href: '/', icon: <HomeIcon /> },
      { label: 'Inventory', href: '/inventory', icon: <InventoryIcon /> },
      { label: 'Categories', href: '/categories', icon: <CategoryIcon /> },
      { label: 'Artists', href: '/artists', icon: <PeopleIcon /> },
      {
        label: 'Sync',
        href: '/sync-conflicts',
        icon: <SyncProblemIcon />,
        badge: pendingConflicts,
        badgeColor: 'warning',
      },
    ],
    [pendingConflicts]
  );

  return (
    <AppShell navItems={navItems} maxWidth={maxWidth}>
      {children}
    </AppShell>
  );
}
