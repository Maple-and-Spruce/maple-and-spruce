/**
 * Music Together Interest Widget — cross-section demand form for embedding in
 * Webflow via Code Components.
 *
 * Unlike the per-section waitlist (shown inside the registration widget when a
 * section is full), this is a standalone, cross-section interest list. A family
 * checks off any current section time(s) they'd take if a spot opened, and
 * answers three preference questions. It works even when nothing is full — the
 * point is to gauge demand and guide adding sections.
 *
 * No Next.js dependencies — Firebase is initialized explicitly from the `env`
 * prop (see firebase-init.ts). No payment involved (read + a single write).
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Button,
  TextField,
  Stack,
  Checkbox,
  FormGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  ThemeProvider,
} from '@mui/material';
import { httpsCallable } from 'firebase/functions';
import { theme } from '@maple/react/theme';
import type {
  GetPublicMusicTogetherSectionsRequest,
  GetPublicMusicTogetherSectionsResponse,
  PublicMusicTogetherSectionOption,
  AddMusicTogetherInterestRequest,
  AddMusicTogetherInterestResponse,
} from '@maple/ts/firebase/api-types';
import { getWidgetFunctions } from './firebase-init';
import { warmup } from './lib/warmup';
import { readMetaAttribution } from './lib/meta-attribution';
import {
  ensureMusicTogetherPixel,
  trackMusicTogetherInterest,
} from './lib/music-together-analytics';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WIDGET_MAX_WIDTH = 560;

/** Human-friendly label for a section option in the checkbox list. */
function sectionLabel(section: PublicMusicTogetherSectionOption): string {
  if (!section.firstSessionAt) return section.name;
  const when = new Date(section.firstSessionAt).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return `${section.name} — starts ${when}`;
}

export interface MusicTogetherInterestWidgetProps {
  /**
   * 'dev' | 'prod' | 'emulator' — selects the Firebase project that serves the
   * section list + records the interest entry.
   */
  env: string;
  /** Optional heading shown above the form. */
  heading?: string;
  /** Optional supporting sentence under the heading. */
  intro?: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; sections: PublicMusicTogetherSectionOption[] }
  | { status: 'error'; message: string };

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; alreadyOnList: boolean }
  | { status: 'error'; message: string };

export function MusicTogetherInterestWidget({
  env,
  heading = 'Join the Music Together interest list',
  intro = 'Not sure which class time works, or nothing open right now? Tell us what you’re interested in and we’ll be in touch as spots and new sections open up.',
}: MusicTogetherInterestWidgetProps) {
  const functions = useMemo(() => getWidgetFunctions(env), [env]);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [checkedSections, setCheckedSections] = useState<Set<string>>(
    new Set()
  );
  const [preferenceNote, setPreferenceNote] = useState('');
  const [alternateTimesNote, setAlternateTimesNote] = useState('');
  const [notes, setNotes] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: 'idle',
  });

  useEffect(() => {
    // Warm the downstream submit callable now; the family triggers it seconds later.
    warmup(functions, 'addMusicTogetherInterest');
    // Init the MT pixel + its PageView. The site-wide GTM tag only loads the
    // Maple & Spruce pixel, so this is what gives the MT ad account a landing
    // signal and a retargetable audience for this page.
    ensureMusicTogetherPixel(typeof window !== 'undefined' ? window : null);
    let cancelled = false;
    (async () => {
      try {
        const call = httpsCallable<
          GetPublicMusicTogetherSectionsRequest,
          GetPublicMusicTogetherSectionsResponse
        >(functions, 'getPublicMusicTogetherSections');
        const result = await call({});
        if (!cancelled) {
          setLoadState({ status: 'ready', sections: result.data.sections });
        }
      } catch (err) {
        if (!cancelled) {
          setLoadState({
            status: 'error',
            message:
              err instanceof Error
                ? err.message
                : 'Could not load class times. Please try again.',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [functions]);

  const toggleSection = useCallback((id: string) => {
    setCheckedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const emailValid = EMAIL_RE.test(email.trim());
  const hasInterestSignal =
    checkedSections.size > 0 || !!alternateTimesNote.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !emailValid) {
      setSubmitState({
        status: 'error',
        message: 'Please enter your name and a valid email.',
      });
      return;
    }
    if (!hasInterestSignal) {
      setSubmitState({
        status: 'error',
        message:
          'Please check at least one class time, or tell us what other days/times would work.',
      });
      return;
    }
    setSubmitState({ status: 'submitting' });
    try {
      const call = httpsCallable<
        AddMusicTogetherInterestRequest,
        AddMusicTogetherInterestResponse
      >(functions, 'addMusicTogetherInterest');
      const result = await call({
        name: name.trim(),
        email: email.trim(),
        interestedSectionIds: [...checkedSections],
        preferenceNote: preferenceNote.trim() || undefined,
        alternateTimesNote: alternateTimesNote.trim() || undefined,
        notes: notes.trim() || undefined,
        // Snapshot _fbp/_fbc for the server-side `Lead`. See the demo widget.
        metaAttribution: readMetaAttribution(
          typeof window !== 'undefined' ? window : null
        ),
      });
      const alreadyOnList = !result.data.added;
      setSubmitState({ status: 'success', alreadyOnList });
      // Meta `Lead` on the Music Together pixel — the conversion the MT
      // interest-list campaign optimizes toward.
      // `eventId` is server-owned and deduplicates this against the CAPI
      // `Lead` the callable already sent. It is stable per family, so a
      // re-submit reuses it rather than booking a second conversion.
      trackMusicTogetherInterest(typeof window !== 'undefined' ? window : null, {
        interestedSectionIds: [...checkedSections],
        alreadyOnList,
        eventId: result.data.eventId,
      });
    } catch (err) {
      setSubmitState({
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
        {loadState.status === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {loadState.status === 'error' && (
          <Alert severity="error">{loadState.message}</Alert>
        )}

        {loadState.status === 'ready' && submitState.status === 'success' && (
          <Alert severity="success">
            {submitState.alreadyOnList
              ? "You're already on our interest list — we've updated your preferences. We'll be in touch as spots and new sections open up."
              : "You're on the interest list. We'll be in touch as spots and new sections open up — your answers help us decide what class times to add."}
          </Alert>
        )}

        {loadState.status === 'ready' && submitState.status !== 'success' && (
          <Box component="form" onSubmit={handleSubmit}>
            <Typography variant="h5" component="h2" sx={{ mb: 1 }}>
              {heading}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {intro}
            </Typography>
            <Stack spacing={2.5}>
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

              <FormControl component="fieldset" variant="standard">
                <FormLabel component="legend">
                  Which section(s) would you join if a spot opened?
                </FormLabel>
                {loadState.sections.length === 0 ? (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                  >
                    No class times are posted yet — tell us below what days and
                    times would work for you.
                  </Typography>
                ) : (
                  <FormGroup sx={{ mt: 1 }}>
                    {loadState.sections.map((section) => (
                      <FormControlLabel
                        key={section.id}
                        control={
                          <Checkbox
                            checked={checkedSections.has(section.id)}
                            onChange={() => toggleSection(section.id)}
                          />
                        }
                        label={sectionLabel(section)}
                      />
                    ))}
                  </FormGroup>
                )}
              </FormControl>

              <TextField
                label="If you checked multiple, which one(s) are you most interested in?"
                value={preferenceNote}
                onChange={(e) => setPreferenceNote(e.target.value)}
                fullWidth
                multiline
                minRows={2}
              />
              <TextField
                label="What other days/times would work best if we add another section?"
                value={alternateTimesNote}
                onChange={(e) => setAlternateTimesNote(e.target.value)}
                placeholder="e.g. weekday mornings, Saturday late morning"
                fullWidth
                multiline
                minRows={2}
              />
              <TextField
                label="Additional notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                fullWidth
                multiline
                minRows={2}
              />

              {submitState.status === 'error' && (
                <Alert severity="error">{submitState.message}</Alert>
              )}
              <Button
                type="submit"
                variant="contained"
                disabled={submitState.status === 'submitting'}
              >
                {submitState.status === 'submitting'
                  ? 'Submitting…'
                  : 'Join the interest list'}
              </Button>
            </Stack>
          </Box>
        )}
      </Box>
    </ThemeProvider>
  );
}
