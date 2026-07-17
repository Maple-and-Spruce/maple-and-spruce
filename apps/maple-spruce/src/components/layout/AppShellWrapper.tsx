'use client';

import { ReactNode, useMemo } from 'react';
import { AppShell, type NavGroup } from '@maple/react/layout';
import { useSyncConflictSummary } from '@maple/react/data';
import { useRoles } from '@maple/react/auth';
import { buildNavGroups } from './nav-groups';

interface AppShellWrapperProps {
  children: ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
}

/**
 * App-specific wrapper around the library's AppShell component.
 * Provides the grouped navigation configuration for the admin app,
 * filtered to the current user's roles (from RolesProvider — see
 * `nav-groups.tsx` for the role map). This filtering is UX only;
 * enforcement is server-side in each function's `requiringRole` check.
 */
export function AppShellWrapper({
  children,
  maxWidth = 'lg',
}: AppShellWrapperProps): ReactNode {
  const { summaryState } = useSyncConflictSummary();
  const { roles } = useRoles();

  const pendingConflicts = useMemo(() => {
    if (summaryState.status !== 'success') return 0;
    return summaryState.data.pending;
  }, [summaryState]);

  const navGroups: NavGroup[] = useMemo(
    () => buildNavGroups(roles, pendingConflicts),
    [roles, pendingConflicts]
  );

  return (
    <AppShell navGroups={navGroups} maxWidth={maxWidth}>
      {children}
    </AppShell>
  );
}
