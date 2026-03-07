'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AuthGuard, AdminGuard, isPublicRoute } from '@maple/react/auth';
import { publicRoutes } from '../config/public-routes';

interface AuthGuardWrapperProps {
  children: ReactNode;
}

/**
 * Client component wrapper for AuthGuard and AdminGuard.
 *
 * Public routes bypass both guards.
 * Non-public routes require authentication (AuthGuard) and admin access (AdminGuard).
 */
export function AuthGuardWrapper({ children }: AuthGuardWrapperProps) {
  const pathname = usePathname();
  const isPublic = isPublicRoute(publicRoutes, pathname);

  return (
    <AuthGuard publicRoutes={publicRoutes}>
      {isPublic ? children : <AdminGuard>{children}</AdminGuard>}
    </AuthGuard>
  );
}
