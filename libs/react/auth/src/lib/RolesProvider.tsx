'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { RequestState, UserRole } from '@maple/ts/domain';
import { useMyRoles } from './useMyRoles';

export interface RolesContextValue {
  rolesState: RequestState<UserRole[]>;
  /** Resolved roles; empty while loading or when the user has none. */
  roles: UserRole[];
  isAdmin: boolean;
  /** True once the user holds at least one role. */
  hasAnyRole: boolean;
  isCheckingRoles: boolean;
}

const EMPTY: RolesContextValue = {
  rolesState: { status: 'idle' },
  roles: [],
  isAdmin: false,
  hasAnyRole: false,
  isCheckingRoles: true,
};

const RolesContext = createContext<RolesContextValue>(EMPTY);

/**
 * Fetches the current user's roles ONCE and shares them via context, so
 * the guard and the nav don't each fire their own getMyRoles call.
 * Mount above AppShell in the (admin) route-group layout.
 */
export function RolesProvider({ children }: { children: ReactNode }) {
  const value = useMyRoles();
  return (
    <RolesContext.Provider value={value}>{children}</RolesContext.Provider>
  );
}

/**
 * Fixed-value provider for Storybook and tests — no network, no Firebase.
 */
export function StaticRolesProvider({
  roles,
  isChecking = false,
  children,
}: {
  roles: UserRole[];
  isChecking?: boolean;
  children: ReactNode;
}) {
  const value: RolesContextValue = {
    rolesState: isChecking
      ? { status: 'loading' }
      : { status: 'success', data: roles },
    roles: isChecking ? [] : roles,
    isAdmin: !isChecking && roles.includes('admin'),
    hasAnyRole: !isChecking && roles.length > 0,
    isCheckingRoles: isChecking,
  };
  return (
    <RolesContext.Provider value={value}>{children}</RolesContext.Provider>
  );
}

/**
 * Read the current user's roles from RolesProvider.
 *
 * Outside a provider this returns a safe "still checking" value rather
 * than throwing — components render their loading state, never a crash.
 */
export function useRoles(): RolesContextValue {
  return useContext(RolesContext);
}
