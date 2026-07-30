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
import type { CardTokenizeResult } from '@maple/react/registrations';
import {
  MT_MAX_CHILDREN,
  computeMusicTogetherFamilyPrice,
} from '@maple/ts/domain';
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

/** Join a list into prose: ["a"] → "a", ["a","b"] → "a and b", more → "a, b, and c". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
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
  /**
   * Square application ID for MT's account. Its prefix (`sandbox-sq0idb…` vs
   * `sq0idp…`) is what selects the Square SDK environment — independent of
   * `env` below — so you can read prod section data while taking payment
   * through a sandbox Square app for end-to-end testing.
   */
  squareAppId: string;
  /** Square location ID for MT's account (must match squareAppId's environment). */
  squareLocationId: string;
  /**
   * 'dev' | 'prod' | 'emulator' — selects the Firebase project that serves
   * section data + registration. Does NOT drive the Square SDK environment;
   * that follows `squareAppId`'s prefix (see SquareCardForm).
   */
  env: string;
  /** URL of the public Policies & FAQs page (linked from the consent checkbox). */
  policiesUrl: string;
  /**
   * When true, the widget shows an email-capture "coming soon" panel instead of
   * the checkout — captures the family's email into the section waitlist and
   * never touches Square. Use while real checkout is temporarily unavailable
   * (e.g. a Square app-ID cutover). Defaults to false.
   */
  comingSoon?: boolean;
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

/**
 * Coming-soon panel: an email-only capture shown while real checkout is
 * temporarily unavailable. Writes the email into the same section waitlist as
 * WaitlistPanel (via addToMusicTogetherWaitlist, no name/availability) and
 * never initializes Square.
 */
function ComingSoonPanel({
  section,
  functions,
}: {
  section: PublicMusicTogetherSection;
  functions: ReturnType<typeof getWidgetFunctions>;
}) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'submitting' }
    | { status: 'success'; alreadyOnList: boolean; email: string }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  const emailValid = EMAIL_RE.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid) {
      setState({
        status: 'error',
        message: 'Please enter a valid email.',
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
        email: email.trim(),
      });
      setState({
        status: 'success',
        alreadyOnList: !result.data.added,
        email: email.trim(),
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

  if (state.status === 'success') {
    return (
      <Alert severity="success">
        {state.alreadyOnList
          ? "You're already on our list — we'll be in touch when registration opens."
          : `Thanks! We'll email you at ${state.email} when registration opens.`}
      </Alert>
    );
  }

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Typography variant="h6" component="p" gutterBottom>
        Coming soon!
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Give us your email and we&apos;ll notify you the moment registration
        opens.
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
        {state.status === 'error' && (
          <Alert severity="error">{state.message}</Alert>
        )}
        <Button
          type="submit"
          variant="contained"
          disabled={state.status === 'submitting'}
        >
          {state.status === 'submitting' ? 'Submitting…' : 'Notify me'}
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
  comingSoon = false,
}: MusicTogetherRegistrationWidgetProps) {
  const functions = useMemo(() => getWidgetFunctions(env), [env]);
  const [state, setState] = useState<WidgetState>({ status: 'loading' });

  // Family form state
  const [adultFirstName, setAdultFirstName] = useState('');
  const [adultLastName, setAdultLastName] = useState('');
  const [children, setChildren] = useState<FamilyChild[]>([
    { name: '', dob: '' },
  ]);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [accommodations, setAccommodations] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>('full');
  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [cardOnFileAuth, setCardOnFileAuth] = useState(false);

  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const tokenizeRef = useRef<(() => Promise<CardTokenizeResult>) | null>(null);

  // Load the section on mount
  useEffect(() => {
    if (!sectionId) {
      setState({ status: 'error', message: 'No section ID provided.' });
      return;
    }
    // Warm the create function — the family will submit shortly after filling
    // out the form, by which point the container is up.
    // Warm both downstream mutations: the checkout create, and the waitlist
    // capture (fired both when a section is full and in coming-soon mode).
    warmup(functions, 'createMusicTogetherRegistration', 'addToMusicTogetherWaitlist');

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
  const offersInstallments = (section?.installmentPlan?.length ?? 0) >= 2;

  // Trimmed / cleaned form values
  const adultFullName = `${adultFirstName.trim()} ${adultLastName.trim()}`.trim();
  // parentNames is kept for the roster/licensee views; derive it from the
  // enrolling adult's first + last name.
  const cleanParents = adultFullName ? [adultFullName] : [];
  const cleanChildren = children
    .map((c) => ({ name: c.name.trim(), dob: c.dob }))
    .filter((c) => c.name && c.dob);
  const emailValid = EMAIL_RE.test(email.trim());

  // Per-child sibling pricing: first child full price, 50% off the 2nd & 3rd.
  // Price the children the family will actually submit (`cleanChildren`), so
  // the displayed total always matches what the server will charge. Clamp to
  // 1..MT_MAX_CHILDREN so a baseline (one-child) price shows before any child
  // row is complete.
  const pricedChildCount = Math.min(
    Math.max(cleanChildren.length, 1),
    MT_MAX_CHILDREN
  );
  const familyPrice = useMemo(
    () =>
      section
        ? computeMusicTogetherFamilyPrice(section, pricedChildCount)
        : null,
    [section, pricedChildCount]
  );
  const firstInstallment = familyPrice?.installments[0];
  const secondInstallment = familyPrice?.installments[1];

  // Amount charged at registration: discounted full price, or the discounted
  // first installment.
  const amountNowCents =
    familyPrice == null
      ? 0
      : paymentPlan === 'installments' && firstInstallment
        ? firstInstallment.amountCents
        : familyPrice.fullCents;

  const formValid =
    adultFirstName.trim().length > 0 &&
    adultLastName.trim().length > 0 &&
    cleanChildren.length > 0 &&
    cleanChildren.length <= MT_MAX_CHILDREN &&
    emailValid &&
    phone.trim().length > 0 &&
    address.trim().length > 0 &&
    policiesAccepted &&
    privacyConsent &&
    (paymentPlan === 'full' || cardOnFileAuth);

  const payDisabled = busy || !cardReady || !formValid;

  // Name exactly what's still missing so the disabled button isn't a mystery —
  // the empty date-of-birth field is the easiest one to miss.
  const missingFields: string[] = [];
  if (adultFirstName.trim().length === 0)
    missingFields.push("the adult's first name");
  if (adultLastName.trim().length === 0)
    missingFields.push("the adult's last name");
  if (cleanChildren.length === 0) {
    const hasChildName = children.some((c) => c.name.trim().length > 0);
    const hasChildDob = children.some((c) => c.dob);
    if (!hasChildName) missingFields.push("your child's first name");
    else if (!hasChildDob) missingFields.push("your child's date of birth");
    else missingFields.push("your child's first name and date of birth");
  }
  if (!emailValid) missingFields.push('a valid email address');
  if (phone.trim().length === 0) missingFields.push('your phone number');
  if (address.trim().length === 0) missingFields.push('your mailing address');
  if (!policiesAccepted)
    missingFields.push('agreement to the Policies & FAQs');
  if (!privacyConsent) missingFields.push('agreement to the privacy notice');
  if (paymentPlan === 'installments' && !cardOnFileAuth)
    missingFields.push('authorization for the second installment');

  const canAddChild = children.length < MT_MAX_CHILDREN;
  const addChild = () =>
    setChildren((c) => (c.length < MT_MAX_CHILDREN ? [...c, { name: '', dob: '' }] : c));
  const removeChild = (i: number) =>
    setChildren((c) => (c.length > 1 ? c.filter((_, idx) => idx !== i) : c));
  const setChild = (i: number, patch: Partial<FamilyChild>) =>
    setChildren((c) => c.map((ch, idx) => (idx === i ? { ...ch, ...patch } : ch)));

  const handlePay = useCallback(async () => {
    if (!tokenizeRef.current || section == null) return;
    setPayError(null);
    setBusy(true);
    try {
      const { nonce, verificationToken } = await tokenizeRef.current();
      const call = httpsCallable<
        CreateMusicTogetherRegistrationRequest,
        CreateMusicTogetherRegistrationResponse
      >(functions, 'createMusicTogetherRegistration');
      const result = await call({
        sectionId: section.id,
        adultFirstName: adultFirstName.trim(),
        adultLastName: adultLastName.trim(),
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
        accommodations: accommodations.trim() || undefined,
        paymentPlan,
        policiesAccepted,
        privacyConsent,
        cardOnFileAuth: paymentPlan === 'installments' ? cardOnFileAuth : undefined,
        paymentNonce: nonce,
        // STORE-intent verification token — only produced (and only required)
        // for the installment plan, which vaults the card on file.
        cardVerificationToken:
          paymentPlan === 'installments' ? verificationToken : undefined,
        notes: notes.trim() || undefined,
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
    adultFirstName,
    adultLastName,
    cleanParents,
    cleanChildren,
    email,
    phone,
    address,
    accommodations,
    notes,
    paymentPlan,
    policiesAccepted,
    privacyConsent,
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

        {/*
          Coming-soon mode: an email-only capture that replaces the entire
          checkout path (waitlist / opens-soon / registration form). Takes
          precedence over every section branch below and never initializes
          Square. The section header stays visible so families see the class.
        */}
        {section && comingSoon && (
          <Stack spacing={3}>
            <Box>
              <Typography variant="h5" component="h2" gutterBottom>
                {section.name}
              </Typography>
              {section.sessions[0] && (
                <Typography variant="body2" color="text.secondary">
                  First class:{' '}
                  {formatSessionDateTime(section.sessions[0].dateTime)}
                </Typography>
              )}
            </Box>
            <ComingSoonPanel section={section} functions={functions} />
          </Stack>
        )}

        {section && !comingSoon && section.spotsRemaining <= 0 && (
          <WaitlistPanel section={section} functions={functions} />
        )}

        {section &&
          !comingSoon &&
          section.spotsRemaining > 0 &&
          !section.enrollmentOpen && (
            <Alert severity="info">
              Registration for <strong>{section.name}</strong> isn&apos;t open
              yet
              {section.enrollmentOpensAt
                ? ` — it opens ${formatSessionDateTime(
                    section.enrollmentOpensAt
                  )}.`
                : '.'}{' '}
              Check back soon.
            </Alert>
          )}

        {section &&
          !comingSoon &&
          section.spotsRemaining > 0 &&
          section.enrollmentOpen && (
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

                {/* Enrolling adult */}
                <Box>
                  <Typography variant="subtitle1" gutterBottom>
                    Adult / caregiver
                  </Typography>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.5}
                  >
                    <TextField
                      label="First name"
                      value={adultFirstName}
                      onChange={(e) => setAdultFirstName(e.target.value)}
                      required
                      fullWidth
                      autoComplete="given-name"
                    />
                    <TextField
                      label="Last name"
                      value={adultLastName}
                      onChange={(e) => setAdultLastName(e.target.value)}
                      required
                      fullWidth
                      autoComplete="family-name"
                    />
                  </Stack>
                </Box>

                {/* Children */}
                <Box>
                  <Typography variant="subtitle1" gutterBottom>
                    Child / children
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Music Together is for children birth through age 5. Up to{' '}
                    {MT_MAX_CHILDREN} siblings per family.
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
                          label="Child's first name"
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
                    {canAddChild && (
                      <Button
                        startIcon={<AddIcon />}
                        onClick={addChild}
                        size="small"
                        sx={{ alignSelf: 'flex-start' }}
                      >
                        Add another child
                      </Button>
                    )}
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
                      label="Full mailing address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      required
                      fullWidth
                      multiline
                      minRows={2}
                      helperText="Street address, city, state, and ZIP — where we should send your Music Together songbook and materials."
                    />
                  </Stack>
                </Box>

                {/* Accommodations + notes */}
                <Box>
                  <Typography variant="subtitle1" gutterBottom>
                    Anything we should know?
                  </Typography>
                  <Stack spacing={2}>
                    <TextField
                      label="Accommodations (optional)"
                      value={accommodations}
                      onChange={(e) => setAccommodations(e.target.value)}
                      fullWidth
                      multiline
                      minRows={2}
                      helperText="Special needs, allergies, or anything that helps us make class comfortable for your family."
                    />
                    <TextField
                      label="Notes (optional)"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      fullWidth
                      multiline
                      minRows={2}
                      helperText="Anything else you'd like us to know."
                    />
                  </Stack>
                </Box>

                {/* Payment plan */}
                <FormControl>
                  <FormLabel sx={{ mb: 1 }}>Tuition</FormLabel>
                  {pricedChildCount > 1 && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 1 }}
                    >
                      Tuition for {pricedChildCount} children: first child full
                      price, 50% off each additional child.
                    </Typography>
                  )}
                  <RadioGroup
                    value={paymentPlan}
                    onChange={(e) => setPaymentPlan(e.target.value as PaymentPlan)}
                  >
                    <FormControlLabel
                      value="full"
                      control={<Radio />}
                      label={`Pay in full — ${formatMoney(
                        familyPrice?.fullCents ?? section.priceFullCents
                      )}`}
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

                {/* Privacy notice consent */}
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={privacyConsent}
                      onChange={(e) => setPrivacyConsent(e.target.checked)}
                    />
                  }
                  label={
                    <Typography variant="body2">
                      I understand that my name, mailing address, and email may
                      be shared with Music Together Worldwide as a licensed
                      center, and that my children&apos;s information is never
                      shared outside Maple &amp; Spruce. See the{' '}
                      <Link href={policiesUrl} target="_blank" rel="noopener">
                        privacy notice
                      </Link>
                      .
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
                          I authorize Music Together with Maple &amp; Spruce to
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
                    // No `env` — the Square SDK environment is derived from the
                    // App ID prefix (sandbox- vs production), decoupled from the
                    // data `env`. Lets us pair prod section data with a sandbox
                    // Square app for testing.
                    totalCents={amountNowCents}
                    maxWidth={WIDGET_MAX_WIDTH}
                    // Installments vault a card on file — real Square needs a
                    // STORE-intent verifyBuyer token to do that. Pay-in-full is
                    // a one-time charge and skips it.
                    verifyBuyerForStore={paymentPlan === 'installments'}
                    billingContact={{
                      givenName: adultFirstName.trim(),
                      familyName: adultLastName.trim(),
                      email: email.trim(),
                    }}
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
                  {!formValid && missingFields.length > 0 && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mt: 1 }}
                    >
                      Still needed: {joinList(missingFields)}.
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
