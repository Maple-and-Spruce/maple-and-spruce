'use client';

import { ReactNode } from 'react';
import { AdminGuard } from '@maple/react/auth';
import { AppShell } from '../../components/layout';

/**
 * Layout for the admin app's authenticated routes.
 *
 * Lives at the route-group level so AppShell — and its `useAdminStatus`
 * state — is preserved across navigations within the group. Without this,
 * every navigation remounted AppShell and re-fired `checkAdminStatus`,
 * briefly flashing the loading nav before the response resolved.
 */
export default function AdminGroupLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AppShell>
      <AdminGuard>{children}</AdminGuard>
    </AppShell>
  );
}
