'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
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

interface LoginState {
  email: string;
  password: string;
  error: string | null;
  isSubmitting: boolean;
  resetEmailSent: boolean;
}

export default function LoginPage() {
  const router = useRouter();
  const [state, setState] = useState<LoginState>({
    email: '',
    password: '',
    error: null,
    isSubmitting: false,
    resetEmailSent: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState((prev) => ({ ...prev, error: null, isSubmitting: true }));

    try {
      const auth = getMapleAuth();
      await signInWithEmailAndPassword(auth, state.email, state.password);

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
            Sign In
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
              autoComplete="current-password"
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
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <Box sx={{ textAlign: 'center' }}>
            <Link
              component="button"
              type="button"
              variant="body2"
              onClick={handleForgotPassword}
            >
              Forgot password?
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
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later';
      default:
        return 'An error occurred. Please try again';
    }
  }
  return 'An unexpected error occurred';
}
