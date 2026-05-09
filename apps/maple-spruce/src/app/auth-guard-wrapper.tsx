'use client';

import { ReactNode } from 'react';
import { AuthGuard } from '@maple/react/auth';
import { publicRoutes } from '../config/public-routes';

interface AuthGuardWrapperProps {
  children: ReactNode;
}

/**
 * Root-level auth check.
 *
 * Forces sign-in for any route not listed in `publicRoutes`. Role-based
 * gating (Admin vs Employee) lives in `app/(admin)/layout.tsx` so the
 * guard switches don't unmount the app shell on navigation.
 */
export function AuthGuardWrapper({ children }: AuthGuardWrapperProps) {
  return <AuthGuard publicRoutes={publicRoutes}>{children}</AuthGuard>;
}
