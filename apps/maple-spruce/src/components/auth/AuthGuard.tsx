'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { getMapleAuth } from '@maple/ts/firebase/firebase-config';
import { Box, CircularProgress } from '@mui/material';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

/**
 * Check if a pathname matches any of the public routes.
 * Supports route params like /public/:id
 */
export function isPublicRoute(
  publicRoutes: Array<string>,
  pathname: string
): boolean {
  return publicRoutes.some((route) => {
    const pattern = route.replace(/:[^/]+/g, '[^/]+').replace(/\//g, '\\/');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(pathname);
  });
}

/**
 * Hook to monitor Firebase auth state and redirect unauthenticated users.
 */
export function useAuthStatus(publicRoutes: Array<string>) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const auth = getMapleAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthStatus('authenticated');
      } else {
        setAuthStatus('unauthenticated');
        if (!isPublicRoute(publicRoutes, pathname)) {
          router.push('/login');
        }
      }
    });

    return () => unsubscribe();
  }, [router, pathname, publicRoutes]);

  return { authStatus };
}

interface AuthGuardProps {
  publicRoutes: Array<string>;
  children: ReactNode;
}

/**
 * Guards routes and redirects unauthenticated users to login.
 * Allows access to routes in the publicRoutes array.
 */
export function AuthGuard({ publicRoutes, children }: AuthGuardProps) {
  const pathname = usePathname();
  const { authStatus } = useAuthStatus(publicRoutes);

  // Always allow public routes
  if (isPublicRoute(publicRoutes, pathname)) {
    return <>{children}</>;
  }

  // Show loading spinner while checking auth
  if (authStatus === 'loading') {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress color="primary" />
      </Box>
    );
  }

  // Redirect happens in useAuthStatus, but show loading while redirecting
  if (authStatus === 'unauthenticated') {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress color="primary" />
      </Box>
    );
  }

  // User is authenticated, render children
  return <>{children}</>;
}
