/**
 * Music Together Registration Widget — self-contained family enrollment +
 * payment component for embedding in Webflow via Code Components.
 *
 * Loads a single MT section by `sectionId`, collects the family's details
 * (parent name(s), child name(s) + DOB, contact, mailing address), lets the
 * family pick pay-in-full or the two-installment plan, takes the Square card
 * nonce, and calls `createMusicTogetherRegistration`. When the section is at
 * capacity it swaps to a waitlist form instead.
 *
 * No Next.js dependencies — Firebase is initialized explicitly from the `env`
 * prop (see firebase-init.ts). Payment routes to MT's own Square account,
 * configured via the widget's Square App ID / Location ID props.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Divider,
  TextField,
  Stack,
  Link,
  Checkbox,
  FormControlLabel,
  FormControl,
  FormLabel,
  RadioGroup,
  Radio,
  IconButton,
  ThemeProvider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { httpsCallable } from 'firebase/functions';
import { theme, fonts } from '@maple/react/theme';
import { SquareCardForm } from '@maple/react/registrations';
import type {
  GetPublicMusicTogetherSectionRequest,
  GetPublicMusicTogetherSectionResponse,
  PublicMusicTogetherSection,
  CreateMusicTogetherRegistrationRequest,
  CreateMusicTogetherRegistrationResponse,
  AddToMusicTogetherWaitlistRequest,
  AddToMusicTogetherWaitlistResponse,
} from '@maple/ts/firebase/api-types';
import { getWidgetFunctions } from './firebase-init';
import { warmup } from './lib/warmup';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WIDGET_MAX_WIDTH = 560;

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Full date + time, e.g. "Thursday, September 10, 2026 at 10:00 AM". */
function formatSessionDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Short date only, e.g. "October 8, 2026" — used for the installment due date. */
function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

type PaymentPlan = 'full' | 'installments';

interface FamilyChild {
  name: string;
  /** ISO date (yyyy-mm-dd) from the native date input, or '' when unset. */
  dob: string;
}

type WidgetState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; section: PublicMusicTogetherSection }
  | {
      status: 'confirmed';
      section: PublicMusicTogetherSection;
      amountChargedCents: number;
      scheduledChargeCount: number;
      cardLast4?: string;
      email: string;
    };

export interface MusicTogetherRegistrationWidgetProps {
  /** The MT section (class time) this widget registers for. */
  sectionId: string;
  /** Square application ID for MT's account (sandbox or production). */
  squareAppId: string;
  /** Square location ID for MT's account. */
  squareLocationId: string;
  /** 'dev' | 'prod' | 'emulator' — selects Firebase project + Square SDK. */
  env: string;
  /** URL of the public Policies & FAQs page (linked from the consent checkbox). */
  policiesUrl: string;
}

/**
 * Waitlist form shown when a section is full. Captures name + email and the
 * "what days/times work for you?" answer that feeds the section-expansion call.
 */
function WaitlistPanel({
  section,
  functions,
}: {
  section: PublicMusicTogetherSection;
  functions: ReturnType<typeof getWidgetFunctions>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [availability, setAvailability] = useState('');
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'submitting' }
    | { status: 'success'; alreadyOnList: boolean }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  const emailValid = EMAIL_RE.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        AddToMusicTogetherWaitlistRequest,
        AddToMusicTogetherWaitlistResponse
      >(functions, 'addToMusicTogetherWaitlist');
      const result = await call({
        sectionId: section.id,
        name: name.trim(),
        email: email.trim(),
        availability: availability.trim() || undefined,
      });
      setState({ status: 'success', alreadyOnList: !result.data.added });
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

  if (state.status === 'success') {
    return (
      <Alert severity="success">
        {state.alreadyOnList
          ? "You're already on the waitlist for this class — we'll email you if a spot opens."
          : "You're on the waitlist. We'll email you if a spot opens up, and your answer helps us decide whether to add another class time."}
      </Alert>
    );
  }

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Alert severity="info" sx={{ mb: 2 }}>
        <strong>{section.name}</strong> is full ({section.capacityFamilies}{' '}
        families). Join the waitlist and we&apos;ll be in touch if a spot opens.
      </Alert>
      <Stack spacing={2}>
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
        <TextField
          label="What days and times work for you?"
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
          placeholder="e.g. weekday mornings, Saturday late morning"
          fullWidth
          multiline
          minRows={2}
        />
        {state.status === 'error' && (
          <Alert severity="error">{state.message}</Alert>
        )}
        <Button
          type="submit"
          variant="contained"
          disabled={state.status === 'submitting'}
        >
          {state.status === 'submitting' ? 'Joining…' : 'Join the waitlist'}
        </Button>
      </Stack>
    </Box>
  );
}

export function MusicTogetherRegistrationWidget({
  sectionId,
  squareAppId,
  squareLocationId,
  env,
  policiesUrl,
}: MusicTogetherRegistrationWidgetProps) {
  const functions = useMemo(() => getWidgetFunctions(env), [env]);
  const [state, setState] = useState<WidgetState>({ status: 'loading' });

  // Family form state
  const [parentNames, setParentNames] = useState<string[]>(['']);
  const [children, setChildren] = useState<FamilyChild[]>([
    { name: '', dob: '' },
  ]);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>('full');
  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [cardOnFileAuth, setCardOnFileAuth] = useState(false);

  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const tokenizeRef = useRef<(() => Promise<string>) | null>(null);

  // Load the section on mount
  useEffect(() => {
    if (!sectionId) {
      setState({ status: 'error', message: 'No section ID provided.' });
      return;
    }
    // Warm the create function — the family will submit shortly after filling
    // out the form, by which point the container is up.
    warmup(functions, 'createMusicTogetherRegistration');

    const load = async () => {
      setState({ status: 'loading' });
      try {
        const call = httpsCallable<
          GetPublicMusicTogetherSectionRequest,
          GetPublicMusicTogetherSectionResponse
        >(functions, 'getPublicMusicTogetherSection');
        const result = await call({ sectionId });
        setState({ status: 'ready', section: result.data.section });
      } catch (err) {
        console.error('Failed to load section:', err);
        setState({
          status: 'error',
          message:
            'Unable to load this class right now. Please refresh and try again.',
        });
      }
    };
    load();
  }, [sectionId, functions]);

  const section = state.status === 'ready' ? state.section : null;

  // Two-installment plan is offered only when the section defines 2+ installments.
  const installments = section?.installmentPlan ?? [];
  const offersInstallments = installments.length >= 2;
  const firstInstallment = installments[0];
  const secondInstallment = installments[1];

  // Amount charged at registration: full price, or the first installment.
  const amountNowCents =
    section == null
      ? 0
      : paymentPlan === 'installments' && firstInstallment
        ? firstInstallment.amountCents
        : section.priceFullCents;

  // Trimmed / cleaned form values
  const cleanParents = parentNames.map((n) => n.trim()).filter(Boolean);
  const cleanChildren = children
    .map((c) => ({ name: c.name.trim(), dob: c.dob }))
    .filter((c) => c.name && c.dob);
  const emailValid = EMAIL_RE.test(email.trim());

  const formValid =
    cleanParents.length > 0 &&
    cleanChildren.length > 0 &&
    emailValid &&
    phone.trim().length > 0 &&
    address.trim().length > 0 &&
    policiesAccepted &&
    (paymentPlan === 'full' || cardOnFileAuth);

  const payDisabled = busy || !cardReady || !formValid;

  const addParent = () => setParentNames((p) => [...p, '']);
  const removeParent = (i: number) =>
    setParentNames((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));
  const setParent = (i: number, value: string) =>
    setParentNames((p) => p.map((n, idx) => (idx === i ? value : n)));

  const addChild = () =>
    setChildren((c) => [...c, { name: '', dob: '' }]);
  const removeChild = (i: number) =>
    setChildren((c) => (c.length > 1 ? c.filter((_, idx) => idx !== i) : c));
  const setChild = (i: number, patch: Partial<FamilyChild>) =>
    setChildren((c) => c.map((ch, idx) => (idx === i ? { ...ch, ...patch } : ch)));

  const handlePay = useCallback(async () => {
    if (!tokenizeRef.current || section == null) return;
    setPayError(null);
    setBusy(true);
    try {
      const nonce = await tokenizeRef.current();
      const call = httpsCallable<
        CreateMusicTogetherRegistrationRequest,
        CreateMusicTogetherRegistrationResponse
      >(functions, 'createMusicTogetherRegistration');
      const result = await call({
        sectionId: section.id,
        parentNames: cleanParents,
        children: cleanChildren.map((c) => ({
          name: c.name,
          // Native date input is yyyy-mm-dd (local); send as an ISO date the
          // server parses. Anchor to midday UTC so it doesn't slip a day.
          dob: new Date(`${c.dob}T12:00:00Z`).toISOString(),
        })),
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
        paymentPlan,
        policiesAccepted,
        cardOnFileAuth: paymentPlan === 'installments' ? cardOnFileAuth : undefined,
        paymentNonce: nonce,
      });
      setState({
        status: 'confirmed',
        section,
        amountChargedCents: result.data.amountChargedCents,
        scheduledChargeCount: result.data.scheduledChargeCount,
        cardLast4: result.data.cardLast4,
        email: email.trim(),
      });
    } catch (err) {
      setPayError(
        err instanceof Error
          ? err.message
          : 'We could not complete your registration. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }, [
    functions,
    section,
    cleanParents,
    cleanChildren,
    email,
    phone,
    address,
    paymentPlan,
    policiesAccepted,
    cardOnFileAuth,
  ]);

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ maxWidth: WIDGET_MAX_WIDTH, mx: 'auto', width: '100%' }}>
        {state.status === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {state.status === 'error' && (
          <Alert severity="error">{state.message}</Alert>
        )}

        {section && section.spotsRemaining <= 0 && (
          <WaitlistPanel section={section} functions={functions} />
        )}

        {section && section.spotsRemaining > 0 && (
          <Stack spacing={3}>
            {/* Section summary */}
            <Box>
              <Typography variant="h5" component="h2" gutterBottom>
                Register — {section.name}
              </Typography>
              {section.sessions[0] && (
                <Typography variant="body2" color="text.secondary">
                  First class: {formatSessionDateTime(section.sessions[0].dateTime)}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                {section.spotsRemaining} of {section.capacityFamilies} family
                spots remaining
              </Typography>
            </Box>

            {!squareAppId ? (
              <Alert severity="warning">
                Registration isn&apos;t available right now. Please email{' '}
                <Link href="mailto:musictogether@mapleandsprucefolkarts.com">
                  musictogether@mapleandsprucefolkarts.com
                </Link>{' '}
                to register.
              </Alert>
            ) : (
              <>
                {payError && <Alert severity="error">{payError}</Alert>}

                {/* Parents / caregivers */}
                <Box>
                  <Typography variant="subtitle1" gutterBottom>
                    Parent / caregiver name(s)
                  </Typography>
                  <Stack spacing={1.5}>
                    {parentNames.map((name, i) => (
                      <Stack key={i} direction="row" spacing={1} alignItems="center">
                        <TextField
                          label={i === 0 ? 'Name' : `Name ${i + 1}`}
                          value={name}
                          onChange={(e) => setParent(i, e.target.value)}
                          required={i === 0}
                          fullWidth
                        />
                        {parentNames.length > 1 && (
                          <IconButton
                            aria-label="Remove caregiver"
                            onClick={() => removeParent(i)}
                            size="small"
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Stack>
                    ))}
                    <Button
                      startIcon={<AddIcon />}
                      onClick={addParent}
                      size="small"
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      Add another caregiver
                    </Button>
                  </Stack>
                </Box>

                {/* Children */}
                <Box>
                  <Typography variant="subtitle1" gutterBottom>
                    Child / children
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Music Together is for children birth through age 5.
                  </Typography>
                  <Stack spacing={2}>
                    {children.map((child, i) => (
                      <Stack
                        key={i}
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1.5}
                        alignItems={{ sm: 'center' }}
                      >
                        <TextField
                          label="Child's name"
                          value={child.name}
                          onChange={(e) => setChild(i, { name: e.target.value })}
                          required={i === 0}
                          fullWidth
                        />
                        <TextField
                          label="Date of birth"
                          type="date"
                          value={child.dob}
                          onChange={(e) => setChild(i, { dob: e.target.value })}
                          required={i === 0}
                          fullWidth
                          InputLabelProps={{ shrink: true }}
                        />
                        {children.length > 1 && (
                          <IconButton
                            aria-label="Remove child"
                            onClick={() => removeChild(i)}
                            size="small"
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Stack>
                    ))}
                    <Button
                      startIcon={<AddIcon />}
                      onClick={addChild}
                      size="small"
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      Add another child
                    </Button>
                  </Stack>
                </Box>

                {/* Contact + address */}
                <Box>
                  <Typography variant="subtitle1" gutterBottom>
                    Contact
                  </Typography>
                  <Stack spacing={2}>
                    <TextField
                      label="Email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      fullWidth
                    />
                    <TextField
                      label="Phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      fullWidth
                    />
                    <TextField
                      label="Mailing address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      required
                      fullWidth
                      multiline
                      minRows={2}
                      helperText="Where we should send your Music Together songbook and materials."
                    />
                  </Stack>
                </Box>

                {/* Payment plan */}
                <FormControl>
                  <FormLabel sx={{ mb: 1 }}>Tuition</FormLabel>
                  <RadioGroup
                    value={paymentPlan}
                    onChange={(e) => setPaymentPlan(e.target.value as PaymentPlan)}
                  >
                    <FormControlLabel
                      value="full"
                      control={<Radio />}
                      label={`Pay in full — ${formatMoney(section.priceFullCents)}`}
                    />
                    {offersInstallments && firstInstallment && secondInstallment && (
                      <FormControlLabel
                        value="installments"
                        control={<Radio />}
                        label={`Two installments — ${formatMoney(
                          firstInstallment.amountCents
                        )} now, ${formatMoney(secondInstallment.amountCents)} on ${formatDueDate(
                          secondInstallment.dueAt
                        )}`}
                      />
                    )}
                  </RadioGroup>
                </FormControl>

                {/* Policies consent */}
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={policiesAccepted}
                      onChange={(e) => setPoliciesAccepted(e.target.checked)}
                    />
                  }
                  label={
                    <Typography variant="body2">
                      I have read and agree to the{' '}
                      <Link href={policiesUrl} target="_blank" rel="noopener">
                        Policies &amp; FAQs
                      </Link>
                      , including the cancellation and refund policy.
                    </Typography>
                  }
                />

                {/* Card-on-file authorization (installments only) */}
                {paymentPlan === 'installments' &&
                  secondInstallment && (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={cardOnFileAuth}
                          onChange={(e) => setCardOnFileAuth(e.target.checked)}
                        />
                      }
                      label={
                        <Typography variant="body2">
                          I authorize Music Together at Maple &amp; Spruce to
                          securely store my card and automatically charge the
                          second installment of{' '}
                          <strong>{formatMoney(secondInstallment.amountCents)}</strong>{' '}
                          on <strong>{formatDueDate(secondInstallment.dueAt)}</strong>.
                        </Typography>
                      }
                    />
                  )}

                <Divider />

                {/* Payment */}
                <Box>
                  <Typography variant="subtitle1" gutterBottom>
                    Payment — {formatMoney(amountNowCents)} today
                  </Typography>
                  <SquareCardForm
                    applicationId={squareAppId}
                    locationId={squareLocationId}
                    env={env}
                    totalCents={amountNowCents}
                    maxWidth={WIDGET_MAX_WIDTH}
                    onReady={() => setCardReady(true)}
                    onTokenizeRef={(fn) => {
                      tokenizeRef.current = fn;
                    }}
                    afterCardContent={
                      // Native button with inline brand styling — in Shadow DOM
                      // this is portaled to the light DOM where MUI's emotion
                      // theme can't reach it. Mirrors the Craft Club widget.
                      <button
                        type="button"
                        onClick={handlePay}
                        disabled={payDisabled}
                        style={{
                          width: '100%',
                          padding: '14px 24px',
                          fontSize: '16px',
                          fontWeight: 600,
                          fontFamily: fonts.button,
                          color: '#D5D6C8',
                          backgroundColor: payDisabled ? '#8a7b6e' : '#4A3728',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: payDisabled ? 'not-allowed' : 'pointer',
                          opacity: payDisabled ? 0.7 : 1,
                          transition: 'background-color 0.2s, opacity 0.2s',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {busy
                          ? 'Registering…'
                          : `Register — ${formatMoney(amountNowCents)}`}
                      </button>
                    }
                  />
                  {!formValid && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mt: 1 }}
                    >
                      Complete the form above and accept the policies to register.
                    </Typography>
                  )}
                </Box>
              </>
            )}
          </Stack>
        )}

        {state.status === 'confirmed' && (
          <Stack spacing={2} alignItems="center" sx={{ py: 2, textAlign: 'center' }}>
            <CheckCircleOutlineIcon color="success" sx={{ fontSize: 48 }} />
            <Typography variant="h5">You&apos;re registered!</Typography>
            <Typography variant="body1" color="text.secondary">
              {state.section.name}
            </Typography>
            {state.section.sessions[0] && (
              <Typography variant="body2" color="text.secondary">
                First class:{' '}
                {formatSessionDateTime(state.section.sessions[0].dateTime)}
              </Typography>
            )}
            <Typography variant="body1" fontWeight={500}>
              {formatMoney(state.amountChargedCents)} paid today
            </Typography>
            {state.scheduledChargeCount > 0 && (
              <Alert severity="info" sx={{ textAlign: 'left' }}>
                Your card ending{' '}
                {state.cardLast4 ? `in ${state.cardLast4}` : 'on file'} will be
                automatically charged for your remaining installment
                {state.scheduledChargeCount === 1 ? '' : 's'}. No action needed.
              </Alert>
            )}
            <Typography variant="body2" color="text.secondary">
              A confirmation email has been sent to{' '}
              <strong>{state.email}</strong>.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Questions? Email{' '}
              <Link href="mailto:musictogether@mapleandsprucefolkarts.com">
                musictogether@mapleandsprucefolkarts.com
              </Link>{' '}
              or call (304) 314-4506.
            </Typography>
          </Stack>
        )}
      </Box>
    </ThemeProvider>
  );
}
