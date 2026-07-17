'use client';

import { ReactNode } from 'react';
import { RoleGuard, RolesProvider } from '@maple/react/auth';
import { AppShell } from '../../components/layout';

/**
 * Layout for the admin app's authenticated routes.
 *
 * Lives at the route-group level so AppShell — and the roles state — is
 * preserved across navigations within the group. Without this, every
 * navigation remounted AppShell and re-fired the roles check, briefly
 * flashing the loading nav before the response resolved.
 *
 * RolesProvider fetches getMyRoles ONCE; both the nav (role filtering in
 * AppShellWrapper) and the gate (RoleGuard) read from it. Any user with
 * at least one role passes the gate; what they can see/do is scoped by
 * nav filtering here and `requiringRole` server-side.
 */
export default function AdminGroupLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <RolesProvider>
      <AppShell>
        <RoleGuard>{children}</RoleGuard>
      </AppShell>
    </RolesProvider>
  );
}
