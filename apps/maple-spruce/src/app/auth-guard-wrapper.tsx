'use client';

import { ReactNode } from 'react';
import { AuthGuard } from '../components/auth';
import { publicRoutes } from '../config/public-routes';

interface AuthGuardWrapperProps {
  children: ReactNode;
}

/**
 * Client component wrapper for AuthGuard.
 * Required because AuthGuard uses hooks that need client-side rendering.
 */
export function AuthGuardWrapper({ children }: AuthGuardWrapperProps) {
  return <AuthGuard publicRoutes={publicRoutes}>{children}</AuthGuard>;
}
