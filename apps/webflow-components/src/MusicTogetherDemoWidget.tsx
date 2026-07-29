/**
 * Music Together Demo Classes RSVP Widget — a self-contained, direct-linkable
 * component for embedding in Webflow via Code Components.
 *
 * Music Together runs FREE demo classes so families can try a class before
 * registering. This widget lists the configured demo time slots, lets a family
 * pick one and enter their name + email, and reserves a spot. Demos are free:
 * there is NO Square, NO payment, and NO section/capacity gate.
 *
 * No Next.js dependencies — Firebase is initialized explicitly from the `env`
 * prop (see firebase-init.ts). Never imports or mounts Square.
 */
import { useState, useMemo } from 'react';
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
  ThemeProvider,
} from '@mui/material';
import { httpsCallable } from 'firebase/functions';
import { theme } from '@maple/react/theme';
import type {
  AddMusicTogetherDemoRsvpRequest,
  AddMusicTogetherDemoRsvpResponse,
} from '@maple/ts/firebase/api-types';
import { getWidgetFunctions } from './firebase-init';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WIDGET_MAX_WIDTH = 480;

const DEFAULT_HEADING = 'Free Demo Class';
const DEFAULT_INTRO =
  'Come make music with us — reserve a spot at a free demo class.';

export interface MusicTogetherDemoWidgetProps {
  /**
   * 'dev' | 'prod' | 'emulator' — selects the Firebase project the RSVP is
   * written to.
   */
  env: string;
  /** Heading shown above the form. */
  heading?: string;
  /** Intro line shown under the heading. */
  intro?: string;
  /** Demo time-slot labels (e.g. "Sat Aug 3 · 10:00 AM"). Empty slots are hidden. */
  demoSlot1?: string;
  demoSlot2?: string;
  demoSlot3?: string;
  demoSlot4?: string;
}

export function MusicTogetherDemoWidget({
  env,
  heading = DEFAULT_HEADING,
  intro = DEFAULT_INTRO,
  demoSlot1,
  demoSlot2,
  demoSlot3,
  demoSlot4,
}: MusicTogetherDemoWidgetProps) {
  const functions = useMemo(() => getWidgetFunctions(env), [env]);

  // Configured, non-empty demo slots in order.
  const slots = useMemo(
    () =>
      [demoSlot1, demoSlot2, demoSlot3, demoSlot4]
        .map((s) => s?.trim())
        .filter((s): s is string => !!s),
    [demoSlot1, demoSlot2, demoSlot3, demoSlot4]
  );

  // Preselect the only slot when exactly one is configured.
  const [demoSlot, setDemoSlot] = useState(slots.length === 1 ? slots[0] : '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'submitting' }
    | { status: 'success'; alreadyRsvpd: boolean; demoSlot: string }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  const emailValid = EMAIL_RE.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!demoSlot) {
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
    setState({ status: 'submitting' });
    try {
      const call = httpsCallable<
        AddMusicTogetherDemoRsvpRequest,
        AddMusicTogetherDemoRsvpResponse
      >(functions, 'addMusicTogetherDemoRsvp');
      const result = await call({
        demoSlot,
        name: name.trim(),
        email: email.trim(),
      });
      setState({
        status: 'success',
        alreadyRsvpd: !result.data.added,
        demoSlot,
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

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ maxWidth: WIDGET_MAX_WIDTH, mx: 'auto', width: '100%' }}>
        <Typography variant="h5" component="h2" gutterBottom>
          {heading}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          {intro}
        </Typography>

        {slots.length === 0 ? (
          <Alert severity="info">
            Demo dates coming soon — check back!
          </Alert>
        ) : state.status === 'success' ? (
          <Alert severity="success">
            {state.alreadyRsvpd
              ? `You're already signed up — we updated your demo to ${state.demoSlot}. See you there!`
              : `You're in! We'll see you at ${state.demoSlot}. Watch your email for details.`}
          </Alert>
        ) : (
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <FormControl>
                <FormLabel sx={{ mb: 1 }}>Choose a demo class</FormLabel>
                <RadioGroup
                  value={demoSlot}
                  onChange={(e) => setDemoSlot(e.target.value)}
                >
                  {slots.map((slot) => (
                    <FormControlLabel
                      key={slot}
                      value={slot}
                      control={<Radio />}
                      label={slot}
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
