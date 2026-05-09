'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AdminGuard, EmployeeGuard } from '@maple/react/auth';
import { AppShell } from '../../components/layout';

/**
 * Routes inside the (admin) group that an Employee can also reach.
 * Anything else in this group requires Admin.
 */
const EMPLOYEE_ALLOWED_PREFIXES = ['/timesheet'];

function isEmployeeAccessibleRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return EMPLOYEE_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Layout for the admin app's authenticated routes.
 *
 * Lives at the route-group level so the AppShell — and the
 * `useUserRole()` state inside it — is preserved across navigations
 * within the group. Without this, every navigation remounted AppShell
 * and re-fired `checkAdminStatus`, briefly showing the employee-only
 * nav before the response resolved.
 *
 * The guard switch (AdminGuard vs EmployeeGuard) sits below AppShell so
 * the shell stays mounted even when the active guard changes (e.g. an
 * employee navigating /timesheet → /users where the AdminGuard then
 * shows the no-access screen).
 */
export default function AdminGroupLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isEmployeeRoute = isEmployeeAccessibleRoute(pathname);

  return (
    <AppShell>
      {isEmployeeRoute ? (
        <EmployeeGuard>{children}</EmployeeGuard>
      ) : (
        <AdminGuard>{children}</AdminGuard>
      )}
    </AppShell>
  );
}
