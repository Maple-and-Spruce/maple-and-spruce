'use client';

import { ReactNode } from 'react';
import { RolesProvider } from '@maple/react/auth';
import { AppShell, PathRoleGuard } from '../../components/layout';

/**
 * Layout for the admin app's authenticated routes.
 *
 * Lives at the route-group level so AppShell — and the roles state — is
 * preserved across navigations within the group. Without this, every
 * navigation remounted AppShell and re-fired the roles check, briefly
 * flashing the loading nav before the response resolved.
 *
 * RolesProvider fetches getMyRoles ONCE; both the nav (role filtering in
 * AppShellWrapper) and the gate (PathRoleGuard) read from it. The guard
 * resolves the current route to its allowed roles via the same map that
 * filters the nav; real enforcement is `requiringRole` server-side.
 */
export default function AdminGroupLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <RolesProvider>
      <AppShell>
        <PathRoleGuard>{children}</PathRoleGuard>
      </AppShell>
    </RolesProvider>
  );
}
