/**
 * Convert Firebase auth errors to user-friendly messages.
 *
 * There is no public sign-up: email sign-up is disabled on the Firebase
 * project and staff accounts are created in the Console. So the sign-up
 * errors (`auth/email-already-in-use`, `auth/weak-password`) are unreachable
 * and deliberately absent.
 */
export function getAuthErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;
    switch (code) {
      case 'auth/invalid-email':
        return 'Invalid email address';
      case 'auth/user-disabled':
        return 'This account has been disabled';
      case 'auth/user-not-found':
        return 'No account found with this email';
      case 'auth/wrong-password':
        return 'Incorrect password';
      case 'auth/invalid-credential':
        return 'Invalid email or password';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later';
      // What Firebase returns if anything attempts an operation the project
      // has disabled, such as creating an account.
      case 'auth/admin-restricted-operation':
        return 'Accounts are created by an administrator. Please contact the studio for access';
      default:
        return 'An error occurred. Please try again';
    }
  }
  return 'An unexpected error occurred';
}
