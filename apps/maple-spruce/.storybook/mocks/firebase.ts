/**
 * Firebase mocks for Storybook
 *
 * These mocks allow components that depend on Firebase to render
 * in Storybook without actual Firebase connections.
 */

import type { User } from 'firebase/auth';

/**
 * Mock Firebase user for auth-dependent components
 */
export const mockFirebaseUser: Partial<User> = {
  uid: 'mock-user-123',
  email: 'admin@maple-spruce.com',
  displayName: 'Admin User',
  photoURL: 'https://picsum.photos/seed/user/100/100',
  emailVerified: true,
};

/**
 * Mock useAuth hook response for authenticated state
 */
export const mockAuthAuthenticated = {
  user: mockFirebaseUser as User,
  loading: false,
  error: null,
};

/**
 * Mock useAuth hook response for loading state
 */
export const mockAuthLoading = {
  user: null,
  loading: true,
  error: null,
};

/**
 * Mock useAuth hook response for unauthenticated state
 */
export const mockAuthUnauthenticated = {
  user: null,
  loading: false,
  error: null,
};

/**
 * Mock httpsCallable that returns success
 */
export function createMockCallable<TRequest, TResponse>(
  response: TResponse
): (data: TRequest) => Promise<{ data: TResponse }> {
  return async () => ({ data: response });
}

/**
 * Mock httpsCallable that returns an error
 */
export function createMockCallableError(
  errorMessage: string
): () => Promise<never> {
  return async () => {
    throw new Error(errorMessage);
  };
}

/**
 * Mock image upload response
 */
export const mockImageUploadSuccess = {
  success: true,
  url: 'https://storage.googleapis.com/mock-bucket/images/mock-image.jpg',
};

/**
 * Mock image upload error response
 */
export const mockImageUploadError = {
  success: false,
  error: 'Upload failed: File too large',
};

/**
 * Mock signOut function
 */
export const mockSignOut = async (): Promise<void> => {
  console.log('Mock sign out called');
};

/**
 * Full mock useAuth hook return value for authenticated user
 */
export const mockUseAuthAuthenticated = {
  user: mockFirebaseUser as User,
  loading: false,
  error: null,
  signOut: mockSignOut,
};

/**
 * Full mock useAuth hook return value for unauthenticated user
 */
export const mockUseAuthUnauthenticated = {
  user: null,
  loading: false,
  error: null,
  signOut: mockSignOut,
};

/**
 * Full mock useAuth hook return value for loading state
 */
export const mockUseAuthLoading = {
  user: null,
  loading: true,
  error: null,
  signOut: mockSignOut,
};
