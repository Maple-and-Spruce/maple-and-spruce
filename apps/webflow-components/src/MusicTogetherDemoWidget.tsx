/**
 * Music Together Demo Classes RSVP Widget — a self-contained, direct-linkable
 * component for embedding in Webflow via Code Components.
 *
 * Music Together runs FREE demo classes so families can try a class before
 * registering. Demos are admin-managed entities (`MusicTogetherDemo`) Stephanie
 * creates in the portal — each with a date, a (often OFFSITE) location, and a
 * family capacity + waitlist. This widget fetches the upcoming visible demos,
 * lets a family pick one and enter their name + email, and reserves a spot
 * (confirmed while under capacity, else waitlisted). Demos are free: there is
 * NO Square, NO payment.
 *
 * No Next.js dependencies — Firebase is initialized explicitly from the `env`
 * prop (see firebase-init.ts). Never imports or mounts Square.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Typography,
  Alert,
  Button,
  TextField,
  Stack,
  FormControl,
  FormLabel,
  RadioGroup,
  Radio,
  FormControlLabel,
  CircularProgress,
  ThemeProvider,
} from '@mui/material';
import { httpsCallable } from 'firebase/functions';
import { theme } from '@maple/react/theme';
import type {
  AddMusicTogetherDemoRsvpRequest,
  AddMusicTogetherDemoRsvpResponse,
  GetPublicMusicTogetherDemosRequest,
  GetPublicMusicTogetherDemosResponse,
  PublicMusicTogetherDemo,
} from '@maple/ts/firebase/api-types';
import { getWidgetFunctions } from './firebase-init';
import { warmup } from './lib/warmup';
import {
  ensureMusicTogetherPixel,
  trackMusicTogetherDemoRsvp,
} from './lib/music-together-analytics';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WIDGET_MAX_WIDTH = 480;

const DEFAULT_HEADING = 'Free Demo Class';
const DEFAULT_INTRO =
  'Come make music with us — reserve a spot at a free demo class.';

/** Full date + time, e.g. "Saturday, August 3, 2026 at 10:00 AM". */
function formatDemoDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The seats line shown under each demo option. */
function spotsLabel(demo: PublicMusicTogetherDemo): string {
  if (demo.isFull) return 'Full — join the waitlist';
  return `${demo.spotsRemaining} ${
    demo.spotsRemaining === 1 ? 'spot' : 'spots'
  } left`;
}

export interface MusicTogetherDemoWidgetProps {
  /**
   * 'dev' | 'prod' | 'emulator' — selects the Firebase project the demos are
   * read from and the RSVP is written to.
   */
  env: string;
  /** Heading shown above the form. */
  heading?: string;
  /** Intro line shown under the heading. */
  intro?: string;
}

export function MusicTogetherDemoWidget({
  env,
  heading = DEFAULT_HEADING,
  intro = DEFAULT_INTRO,
}: MusicTogetherDemoWidgetProps) {
  const functions = useMemo(() => getWidgetFunctions(env), [env]);

  const [demosState, setDemosState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; demos: PublicMusicTogetherDemo[] }
    | { status: 'error' }
  >({ status: 'loading' });

  const [demoId, setDemoId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'submitting' }
    | {
        status: 'success';
        added: boolean;
        rsvpStatus: 'confirmed' | 'waitlisted';
        demo: PublicMusicTogetherDemo;
      }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  // Load the upcoming visible demos on mount. Also warm the downstream RSVP
  // callable now, so it's hot by the time the family submits (seconds later).
  useEffect(() => {
    warmup(functions, 'addMusicTogetherDemoRsvp');
    // Init the MT pixel + its PageView. The site-wide GTM tag only loads the
    // Maple & Spruce pixel, so this is what gives the MT ad account a landing
    // signal and a retargetable audience for this page.
    ensureMusicTogetherPixel(typeof window !== 'undefined' ? window : null);
    let cancelled = false;
    const load = async () => {
      setDemosState({ status: 'loading' });
      try {
        const call = httpsCallable<
          GetPublicMusicTogetherDemosRequest,
          GetPublicMusicTogetherDemosResponse
        >(functions, 'getPublicMusicTogetherDemos');
        const result = await call({});
        if (cancelled) return;
        const demos = result.data.demos;
        setDemosState({ status: 'ready', demos });
        // Preselect the only demo when exactly one is available.
        if (demos.length === 1) setDemoId(demos[0].id);
      } catch (err) {
        console.error('Failed to load demos:', err);
        if (!cancelled) setDemosState({ status: 'error' });
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [functions]);

  const emailValid = EMAIL_RE.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!demoId) {
      setState({ status: 'error', message: 'Please choose a demo class time.' });
      return;
    }
    if (!name.trim() || !emailValid) {
      setState({
        status: 'error',
        message: 'Please enter your name and a valid email.',
      });
      return;
    }
    const demo =
      demosState.status === 'ready'
        ? demosState.demos.find((d) => d.id === demoId)
        : undefined;
    if (!demo) {
      setState({ status: 'error', message: 'Please choose a demo class time.' });
      return;
    }
    setState({ status: 'submitting' });
    try {
      const call = httpsCallable<
        AddMusicTogetherDemoRsvpRequest,
        AddMusicTogetherDemoRsvpResponse
      >(functions, 'addMusicTogetherDemoRsvp');
      const result = await call({
        demoId,
        name: name.trim(),
        email: email.trim(),
      });
      setState({
        status: 'success',
        added: result.data.added,
        rsvpStatus: result.data.status,
        demo,
      });
      // Meta `Schedule` on the Music Together pixel. Deliberately a different
      // event from the interest list's `Lead`: booking a specific demo time is
      // a stronger signal, and the two campaigns bid toward it separately.
      trackMusicTogetherDemoRsvp(typeof window !== 'undefined' ? window : null, {
        demoId,
        demoDateTime: demo.dateTime,
        rsvpStatus: result.data.status,
      });
    } catch (err) {
      setState({
        status: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Something went wrong. Please try again.',
      });
    }
  };

  const demos = demosState.status === 'ready' ? demosState.demos : [];

  const successMessage = (
    s: Extract<typeof state, { status: 'success' }>
  ): string => {
    if (s.rsvpStatus === 'waitlisted') {
      return "That demo is full — you're on the waitlist and we'll email you if a spot opens.";
    }
    return `You're in! We'll see you ${formatDemoDateTime(
      s.demo.dateTime
    )} at ${s.demo.location}. Watch your email for details.`;
  };

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ maxWidth: WIDGET_MAX_WIDTH, mx: 'auto', width: '100%' }}>
        <Typography variant="h5" component="h2" gutterBottom>
          {heading}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          {intro}
        </Typography>

        {demosState.status === 'loading' ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress />
          </Box>
        ) : demosState.status === 'error' ? (
          <Alert severity="error">
            Unable to load demo classes right now. Please refresh and try again.
          </Alert>
        ) : demos.length === 0 ? (
          <Alert severity="info">Demo dates coming soon — check back!</Alert>
        ) : state.status === 'success' ? (
          <Alert severity={state.rsvpStatus === 'waitlisted' ? 'info' : 'success'}>
            {successMessage(state)}
          </Alert>
        ) : (
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <FormControl>
                <FormLabel sx={{ mb: 1 }}>Choose a demo class</FormLabel>
                <RadioGroup
                  value={demoId}
                  onChange={(e) => setDemoId(e.target.value)}
                >
                  {demos.map((demo) => (
                    <FormControlLabel
                      key={demo.id}
                      value={demo.id}
                      control={<Radio />}
                      label={
                        <Box sx={{ py: 0.5 }}>
                          <Typography variant="body1">
                            {formatDemoDateTime(demo.dateTime)}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {demo.location}
                          </Typography>
                          <Typography
                            variant="caption"
                            color={demo.isFull ? 'warning.main' : 'text.secondary'}
                          >
                            {spotsLabel(demo)}
                          </Typography>
                        </Box>
                      }
                    />
                  ))}
                </RadioGroup>
              </FormControl>
              <TextField
                label="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                fullWidth
              />
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
              />
              {state.status === 'error' && (
                <Alert severity="error">{state.message}</Alert>
              )}
              <Button
                type="submit"
                variant="contained"
                disabled={state.status === 'submitting'}
              >
                {state.status === 'submitting'
                  ? 'Reserving…'
                  : 'Reserve my spot'}
              </Button>
            </Stack>
          </Box>
        )}
      </Box>
    </ThemeProvider>
  );
}
