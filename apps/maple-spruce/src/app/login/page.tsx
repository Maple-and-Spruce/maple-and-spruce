'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { getMapleAuth } from '@maple/ts/firebase/firebase-config';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Link,
  Alert,
  CircularProgress,
} from '@mui/material';

type LoginMode = 'sign-in' | 'sign-up';

interface LoginState {
  email: string;
  password: string;
  mode: LoginMode;
  error: string | null;
  isSubmitting: boolean;
  resetEmailSent: boolean;
}

export default function LoginPage() {
  const router = useRouter();
  const [state, setState] = useState<LoginState>({
    email: '',
    password: '',
    mode: 'sign-in',
    error: null,
    isSubmitting: false,
    resetEmailSent: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState((prev) => ({ ...prev, error: null, isSubmitting: true }));

    try {
      const auth = getMapleAuth();

      if (state.mode === 'sign-in') {
        await signInWithEmailAndPassword(auth, state.email, state.password);
      } else {
        await createUserWithEmailAndPassword(auth, state.email, state.password);
      }

      // Redirect to home on success
      router.push('/');
    } catch (error) {
      const message = getErrorMessage(error);
      setState((prev) => ({ ...prev, error: message, isSubmitting: false }));
    }
  };

  const handleForgotPassword = async () => {
    if (!state.email) {
      setState((prev) => ({
        ...prev,
        error: 'Please enter your email address first',
      }));
      return;
    }

    setState((prev) => ({ ...prev, error: null, isSubmitting: true }));

    try {
      const auth = getMapleAuth();
      await sendPasswordResetEmail(auth, state.email);
      setState((prev) => ({
        ...prev,
        resetEmailSent: true,
        isSubmitting: false,
      }));
    } catch (error) {
      const message = getErrorMessage(error);
      setState((prev) => ({ ...prev, error: message, isSubmitting: false }));
    }
  };

  const toggleMode = () => {
    setState((prev) => ({
      ...prev,
      mode: prev.mode === 'sign-in' ? 'sign-up' : 'sign-in',
      error: null,
      resetEmailSent: false,
    }));
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Card sx={{ maxWidth: 400, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" component="h1" gutterBottom align="center">
            {state.mode === 'sign-in' ? 'Sign In' : 'Create Account'}
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            align="center"
            sx={{ mb: 3 }}
          >
            Maple & Spruce Admin
          </Typography>

          {state.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {state.error}
            </Alert>
          )}

          {state.resetEmailSent && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Password reset email sent! Check your inbox.
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={state.email}
              onChange={(e) =>
                setState((prev) => ({ ...prev, email: e.target.value }))
              }
              margin="normal"
              required
              autoComplete="email"
              autoFocus
            />

            <TextField
              fullWidth
              label="Password"
              type="password"
              value={state.password}
              onChange={(e) =>
                setState((prev) => ({ ...prev, password: e.target.value }))
              }
              margin="normal"
              required
              autoComplete={
                state.mode === 'sign-in' ? 'current-password' : 'new-password'
              }
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={state.isSubmitting}
              sx={{ mt: 3, mb: 2 }}
            >
              {state.isSubmitting ? (
                <CircularProgress size={24} color="inherit" />
              ) : state.mode === 'sign-in' ? (
                'Sign In'
              ) : (
                'Create Account'
              )}
            </Button>
          </form>

          <Box sx={{ textAlign: 'center' }}>
            {state.mode === 'sign-in' && (
              <Link
                component="button"
                type="button"
                variant="body2"
                onClick={handleForgotPassword}
                sx={{ display: 'block', mb: 1 }}
              >
                Forgot password?
              </Link>
            )}

            <Link
              component="button"
              type="button"
              variant="body2"
              onClick={toggleMode}
            >
              {state.mode === 'sign-in'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </Link>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

/**
 * Convert Firebase auth errors to user-friendly messages
 */
function getErrorMessage(error: unknown): string {
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
      case 'auth/email-already-in-use':
        return 'An account already exists with this email';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later';
      default:
        return 'An error occurred. Please try again';
    }
  }
  return 'An unexpected error occurred';
}
