/**
 * Mock AuthContext for Storybook
 *
 * Provides a fake auth context to test components that use useAuth hook.
 */

import React, { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';

interface AuthContextValue {
  user: User | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface MockAuthProviderProps {
  children: React.ReactNode;
  user?: Partial<User> | null;
  isLoading?: boolean;
}

/**
 * Mock auth provider for Storybook stories
 */
export function MockAuthProvider({
  children,
  user = null,
  isLoading = false,
}: MockAuthProviderProps) {
  const value: AuthContextValue = {
    user: user as User | null,
    isLoggedIn: !!user,
    isLoading,
    signOut: async () => {
      console.log('Mock signOut called');
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Mock useAuth hook for testing
 * Note: This is a separate context from the real app's useAuth
 */
export function useMockAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // Return default values if used outside provider
    return {
      user: null,
      isLoggedIn: false,
      isLoading: false,
      signOut: async () => {},
    };
  }
  return context;
}

/**
 * Sample mock user for stories
 */
export const mockUser: Partial<User> = {
  uid: 'mock-user-123',
  email: 'admin@maple-spruce.com',
  displayName: 'Admin User',
  photoURL: 'https://picsum.photos/seed/user/100/100',
  emailVerified: true,
};
