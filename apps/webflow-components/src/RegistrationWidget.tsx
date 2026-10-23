/**
 * Registration Widget — self-contained class registration + payment component.
 *
 * Designed for embedding in Webflow via Code Components.
 * Reuses RegistrationCheckoutForm and related components from the existing library.
 * No Next.js dependencies — all routing/navigation is handled inline.
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
  ThemeProvider,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PrintIcon from '@mui/icons-material/Print';
import { httpsCallable } from 'firebase/functions';
import { theme } from '@maple/react/theme';
import { RegistrationCheckoutForm } from '@maple/react/registrations';
import type { RequiredAgreementTemplate } from '@maple/react/registrations';
import type { PublicClass } from '@maple/ts/domain';
import type {
  GetPublicClassRequest,
  GetPublicClassResponse,
  CalculateRegistrationCostRequest,
  CalculateRegistrationCostResponse,
  CreateRegistrationRequest,
  CreateRegistrationResponse,
  CreateRegistrationCheckoutLinkRequest,
  CreateRegistrationCheckoutLinkResponse,
  GetRegistrationStatusRequest,
  GetRegistrationStatusResponse,
  GetRequiredAgreementsForClassRequest,
  GetRequiredAgreementsForClassResponse,
  InlineAgreementSigningData,
  AddToClassWaitlistRequest,
  AddToClassWaitlistResponse,
} from '@maple/ts/firebase/api-types';
import { getWidgetFunctions, routeCallable } from './firebase-init';
import {
  trackAddClassToCart,
  trackPurchaseClass,
  trackViewClass,
} from './lib/class-analytics';
import { readMetaAttribution } from './lib/meta-attribution';
import { readGaAttribution } from './lib/ga-attribution';
import { warmup } from './lib/warmup';
import { scrollToConfirmation } from './lib/scroll-to-confirmation';


/**
 * Format duration in minutes to a human-readable string.
 * Examples: 60 -> "1 hour", 90 -> "1.5 hours", 120 -> "2 hours"
 */
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (Number.isInteger(hours)) {
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return `${hours} hours`;
}

/**
 * Format a skill level enum value for display.
 */
function formatSkillLevel(level: string): string {
  switch (level) {
    case 'all-levels':
      return 'All Levels';
    case 'beginner':
      return 'Beginner';
    case 'intermediate':
      return 'Intermediate';
    case 'advanced':
      return 'Advanced';
    default:
      return level;
  }
}

/**
 * Format an ISO date string to a localized, readable date/time.
 */
function formatClassDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Pad a number to two digits for .ics date formatting.
 */
function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Convert a Date to an .ics-compatible UTC timestamp (YYYYMMDDTHHMMSSZ).
 */
function toIcsDate(date: Date): string {
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

/**
 * Generate a minimal .ics calendar file as a string.
 */
function generateIcsFile(opts: {
  startDate: string;
  endDate: string;
  summary: string;
  location?: string;
  description: string;
}): string {
  const start = toIcsDate(new Date(opts.startDate));
  const end = toIcsDate(new Date(opts.endDate));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Maple & Spruce//Registration//EN',
    'BEGIN:VEVENT',
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${opts.summary}`,
    ...(opts.location ? [`LOCATION:${opts.location}`] : []),
    `DESCRIPTION:${opts.description}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

/**
 * Sold-out fallback shown when `spotsRemaining <= 0`: an informal waitlist
 * signup.
 *
 * "Other upcoming dates" used to live here too, loaded from a
 * `getRelatedPublicClasses` callable. That function sat in the `maple-core`
 * bundle (~6.1s cold, ADR-031) and only ever ran on a full class, so it was
 * effectively always a cold start and the section took seconds to appear.
 * The class template page now renders those cards natively from the Webflow
 * CMS — a Collection List filtered on the class's `category` Reference field
 * — so they are in the HTML at first paint. See legacy #776.
 */
function SoldOutPanel({
  classId,
  functions,
}: {
  classId: string;
  functions: ReturnType<typeof getWidgetFunctions>;
}) {
  const [email, setEmail] = useState('');
  const [waitlistState, setWaitlistState] = useState<
    | { status: 'idle' }
    | { status: 'submitting' }
    | { status: 'success'; alreadyOnList: boolean }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setWaitlistState({
        status: 'error',
        message: 'Please enter your email.',
      });
      return;
    }
    setWaitlistState({ status: 'submitting' });
    try {
      const call = httpsCallable<
        AddToClassWaitlistRequest,
        AddToClassWaitlistResponse
      >(functions, 'addToClassWaitlist');
      const result = await call({ classId, email: trimmed });
      setWaitlistState({
        status: 'success',
        alreadyOnList: !result.data.added,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.';
      setWaitlistState({ status: 'error', message });
    }
  };

  return (
    <Box>
      {/*
        Waitlist signup — the primary action for a full class, so it leads.
        On the class page the Webflow template renders its own "Join Waitlist"
        heading + "this class is full…" subtext (CMS conditional visibility)
        directly above this widget, so the panel deliberately omits a full-state
        banner and repeats none of that copy — just the first-come fine print.
      */}
      <Box>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          Spots are first-come, first-served — we email everyone on the list.
        </Typography>

        {waitlistState.status === 'success' ? (
          <Alert severity="success">
            {waitlistState.alreadyOnList
              ? "You're already on the list — we'll email you if a spot opens."
              : "You're on the list. We'll email you if a spot opens."}
          </Alert>
        ) : (
          <Box component="form" onSubmit={handleWaitlistSubmit}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{
                alignItems: { sm: 'flex-start' }
              }}
            >
              <TextField
                type="email"
                label="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                size="small"
                fullWidth
                required
                disabled={waitlistState.status === 'submitting'}
              />
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={waitlistState.status === 'submitting'}
                sx={{ whiteSpace: 'nowrap' }}
              >
                {waitlistState.status === 'submitting'
                  ? 'Joining…'
                  : 'Join waitlist'}
              </Button>
            </Stack>
            {waitlistState.status === 'error' && (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                {waitlistState.message}
              </Alert>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

interface RegistrationWidgetProps {
  classId: string;
  squareAppId: string;
  squareLocationId: string;
  env: string;
  applePayCheckoutUrl?: string;
  showDigitalWallets?: string;
  /**
   * Where first paint comes from. `live` (the default) waits on
   * `publicSite/getPublicClass` as the widget always has. `cms` renders at
   * once from the three props below, which the class template page binds to
   * the class's CMS fields, then refreshes from the live read in the
   * background. A Designer switch, so it can be flipped back without a deploy.
   */
  dataSource?: string;
  /** CMS `name`. Used only when `dataSource` is `cms`. */
  cmsClassName?: string;
  /** CMS `price-cents`. Negative means unbound. */
  cmsPriceCents?: number;
  /** CMS `spots-remaining`. */
  cmsSpotsRemaining?: number;
}

/** The fields the checkout needs to render, before the full class is known. */
export type CheckoutClass = Pick<
  PublicClass,
  'id' | 'name' | 'priceCents' | 'spotsRemaining'
>;

/**
 * The class from CMS-bound props, or `null` when the widget should fall back
 * to the live read: `cms` mode is off, or the props aren't bound (an unbound
 * name is empty and an unbound price is the negative default). The fallback
 * is what makes a half-finished Designer setup harmless.
 */
export function classFromCmsProps(props: {
  classId: string;
  dataSource?: string;
  cmsClassName?: string;
  cmsPriceCents?: number | null;
  cmsSpotsRemaining?: number | null;
}): CheckoutClass | null {
  if (props.dataSource !== 'cms') return null;
  // An empty CMS number can arrive as null, and Number(null) is 0: a free
  // class, or a full one. Treat it as unbound instead.
  if (props.cmsPriceCents == null || props.cmsSpotsRemaining == null) {
    return null;
  }
  const name = props.cmsClassName?.trim();
  const priceCents = Number(props.cmsPriceCents);
  const spotsRemaining = Number(props.cmsSpotsRemaining);
  if (
    !props.classId ||
    !name ||
    !Number.isFinite(priceCents) ||
    priceCents < 0 ||
    !Number.isFinite(spotsRemaining)
  ) {
    return null;
  }
  return { id: props.classId, name, priceCents, spotsRemaining };
}

/** `?reg=<registrationId>` on a return from Square's hosted checkout. */
function hostedCheckoutReturnId(): string | null {
  return typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('reg')
    : null;
}

function hasHostedCheckoutReturn(): boolean {
  return hostedCheckoutReturnId() !== null;
}

interface ConfirmedState {
  status: 'confirmed';
  confirmationNumber: string;
  customerName: string;
  customerEmail: string;
  className: string;
  pricePaidCents: number;
  quantity: number;
  /**
   * Schedule details, from the full class. Absent only if the live read
   * never succeeded in `cms` mode; the confirmation then omits the date and
   * the calendar button rather than showing a wrong one.
   */
  classDate?: string;
  classEndDate?: string;
  classDurationMinutes?: number;
  skillLevel?: string;
  location?: string;
  agreementsSigned?: boolean;
}

type WidgetState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      /** What the checkout renders from: CMS props at first, then live. */
      checkoutClass: CheckoutClass;
      /** The full class, once the live read lands. */
      publicClass?: PublicClass;
      /** `undefined` while still loading; Pay stays disabled until known. */
      requiredAgreements?: RequiredAgreementTemplate[];
    }
  // Buyer returned from Square's hosted checkout (?reg=<id>); we're polling for
  // the webhook to confirm. `timedOut` = still pending after the poll window.
  | { status: 'confirming'; customerEmail?: string; timedOut: boolean }
  | ConfirmedState;

/**
 * Build the `confirmed` widget state from a class + payment details. Shared by
 * the inline-payment success path and the hosted-checkout return path.
 */
function buildConfirmedState(
  checkoutClass: CheckoutClass,
  pc: PublicClass | undefined,
  details: {
    confirmationNumber: string;
    customerName: string;
    customerEmail: string;
    pricePaidCents: number;
    quantity: number;
    agreementsSigned?: boolean;
  }
): ConfirmedState {
  const base: ConfirmedState = {
    status: 'confirmed',
    confirmationNumber: details.confirmationNumber,
    customerName: details.customerName,
    customerEmail: details.customerEmail,
    className: checkoutClass.name,
    pricePaidCents: details.pricePaidCents,
    quantity: details.quantity,
    agreementsSigned: details.agreementsSigned,
  };
  const firstSessionIso = pc?.sessions?.[0]?.dateTime;
  if (!pc || !firstSessionIso) return base;

  const startDate = new Date(firstSessionIso);
  const endDate = new Date(startDate.getTime() + pc.durationMinutes * 60 * 1000);
  return {
    ...base,
    classDate: firstSessionIso,
    classEndDate: endDate.toISOString(),
    classDurationMinutes: pc.durationMinutes,
    skillLevel: pc.skillLevel,
    location: pc.location,
  };
}

/** The checkout fields of a full class. */
function toCheckoutClass(pc: PublicClass): CheckoutClass {
  return {
    id: pc.id,
    name: pc.name,
    priceCents: pc.priceCents,
    spotsRemaining: pc.spotsRemaining,
  };
}

export function RegistrationWidget({
  classId,
  squareAppId,
  squareLocationId,
  env,
  applePayCheckoutUrl,
  showDigitalWallets,
  dataSource,
  cmsClassName,
  cmsPriceCents,
  cmsSpotsRemaining,
}: RegistrationWidgetProps) {
  const digitalWalletsEnabled = showDigitalWallets === 'show';
  const cmsClass = useMemo(
    () =>
      classFromCmsProps({
        classId,
        dataSource,
        cmsClassName,
        cmsPriceCents,
        cmsSpotsRemaining,
      }),
    [classId, dataSource, cmsClassName, cmsPriceCents, cmsSpotsRemaining]
  );
  // With CMS props there is nothing to wait for: the first render is the form.
  const [state, setState] = useState<WidgetState>(() =>
    cmsClass && !hasHostedCheckoutReturn()
      ? { status: 'ready', checkoutClass: cmsClass }
      : { status: 'loading' }
  );

  const functions = useMemo(() => getWidgetFunctions(env), [env]);

  // Fetch class details on mount
  useEffect(() => {
    if (!classId) {
      setState({ status: 'error', message: 'No class ID provided.' });
      return;
    }

    // Pre-warm the checkout callables the user will hit shortly (Pay
    // submit). The page-mount fetches can't benefit from warmup — they fire
    // too early — but these typically run 5–60s later, by which point the
    // warmup ping has spun their container up. The discount recalc needs no
    // ping: it is on `publicSite`, which the mount fetch has already woken.
    warmup(functions, 'createRegistration', 'createRegistrationCheckoutLink');

    // Poll getRegistrationStatus for a returning hosted-checkout buyer. Returns
    // true if it took over the UI (confirmed or a "confirming payment" state),
    // false if there's nothing to show (lookup failed / not confirmed) and the
    // normal registration form should render.
    const showHostedCheckoutReturn = async (
      registrationId: string,
      publicClass: PublicClass
    ): Promise<boolean> => {
      const getRegistrationStatus = routeCallable<
        GetRegistrationStatusRequest,
        GetRegistrationStatusResponse
      >(functions, 'publicSite', 'getRegistrationStatus');

      const MAX_POLLS = 6;
      const POLL_MS = 3000;
      for (let attempt = 0; attempt <= MAX_POLLS; attempt++) {
        let res: GetRegistrationStatusResponse;
        try {
          res = (await getRegistrationStatus({ registrationId })).data;
        } catch {
          return false; // lookup failed — fall back to the form
        }

        if (res.status === 'confirmed' && res.confirmation) {
          setState(
            buildConfirmedState(toCheckoutClass(publicClass), publicClass, {
              confirmationNumber: res.confirmation.confirmationNumber ?? '',
              customerName: res.confirmation.customerName,
              customerEmail: res.confirmation.customerEmail,
              pricePaidCents: res.confirmation.pricePaidCents,
              quantity: res.confirmation.quantity,
            })
          );
          return true;
        }
        if (res.status !== 'pending') {
          // not-found / cancelled / refunded — nothing to confirm.
          return false;
        }

        // Still pending — the webhook hasn't landed yet. Show a confirming
        // state and poll again.
        setState({ status: 'confirming', timedOut: false });
        if (attempt < MAX_POLLS) {
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      }

      // Payment almost certainly succeeded (Square only redirects here after
      // payment) but the webhook is lagging — reassure rather than dead-end.
      setState({ status: 'confirming', timedOut: true });
      return true;
    };

    const getPublicClass = routeCallable<
      GetPublicClassRequest,
      GetPublicClassResponse
    >(functions, 'publicSite', 'getPublicClass');

    const getRequiredAgreements = routeCallable<
      GetRequiredAgreementsForClassRequest,
      GetRequiredAgreementsForClassResponse
    >(functions, 'publicSite', 'getRequiredAgreementsForClass');

    // A failed agreements lookup has always meant "none required"; the
    // server does its own check at registration.
    const fetchAgreements = () =>
      getRequiredAgreements({ classId })
        .then((r) => r.data.agreements)
        .catch(
          () => [] as GetRequiredAgreementsForClassResponse['agreements']
        );

    const trackView = (c: CheckoutClass) =>
      trackViewClass(typeof window !== 'undefined' ? window : null, {
        classId: c.id,
        className: c.name,
        priceCents: c.priceCents,
      });

    let cancelled = false;

    // CMS first paint: the form is already on screen (initial state). Fill in
    // the agreements and the live class in the background. The live read
    // replaces the CMS numbers, so a lagging or failed sync can't leave a
    // stale spot count up for long. Server-side capacity checks are what
    // prevent overbooking either way.
    const refreshInBackground = (fallback: CheckoutClass) => {
      trackView(fallback);
      fetchAgreements().then((agreements) => {
        if (cancelled) return;
        setState((prev) =>
          prev.status === 'ready'
            ? { ...prev, requiredAgreements: agreements }
            : prev
        );
      });
      getPublicClass({ id: classId })
        .then((r) => {
          if (cancelled) return;
          const publicClass = r.data.class;
          setState((prev) =>
            prev.status === 'ready'
              ? {
                  ...prev,
                  publicClass,
                  checkoutClass: toCheckoutClass(publicClass),
                }
              : prev
          );
        })
        .catch((err) => {
          // Keep the CMS copy; checkout re-validates on the server.
          console.warn('Live class refresh failed; showing CMS data:', err);
        });
    };

    const fetchClass = async () => {
      setState({ status: 'loading' });
      try {
        // Fetch class and required agreements in parallel
        const [classResult, requiredAgreements] = await Promise.all([
          getPublicClass({ id: classId }),
          fetchAgreements(),
        ]);
        if (cancelled) return;

        const publicClass = classResult.data.class;

        // Hosted-checkout return: Square sends the buyer back with ?reg=<id>
        // after paying. Verify the payment landed (the webhook is the source of
        // truth — never trust the param) and show a real confirmation instead
        // of a blank form, so a buyer who paid doesn't pay again.
        const regId = hostedCheckoutReturnId();
        if (regId) {
          const shown = await showHostedCheckoutReturn(regId, publicClass);
          if (shown) return; // confirmed or confirming — don't render the form
        }

        setState({
          status: 'ready',
          checkoutClass: toCheckoutClass(publicClass),
          publicClass,
          requiredAgreements,
        });
        trackView(publicClass);
      } catch (err) {
        console.error('Failed to fetch class:', err);
        setState({
          status: 'error',
          message: 'Unable to load class details. Please try again.',
        });
      }
    };

    // A hosted-checkout return always takes the live path: the buyer has to
    // see a verified confirmation, not a form.
    if (cmsClass && !hostedCheckoutReturnId()) {
      refreshInBackground(cmsClass);
    } else {
      fetchClass();
    }

    return () => {
      cancelled = true;
    };
  }, [classId, functions, cmsClass]);

  const handleCalculateCost = useCallback(
    async (
      calcClassId: string,
      quantity: number,
      discountCode?: string
    ): Promise<CalculateRegistrationCostResponse> => {
      const calculateCost = routeCallable<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >(functions, 'publicSite', 'calculateRegistrationCost');

      const result = await calculateCost({
        classId: calcClassId,
        quantity,
        discountCode,
      });
      return result.data;
    },
    [functions]
  );

  const handleSubmit = useCallback(
    async (data: {
      classId: string;
      customerEmail: string;
      customerName: string;
      customerPhone?: string;
      quantity: number;
      discountCode?: string;
      notes?: string;
      paymentNonce: string;
      agreements?: InlineAgreementSigningData[];
    }): Promise<CreateRegistrationResponse> => {
      const createRegistration = httpsCallable<
        CreateRegistrationRequest,
        CreateRegistrationResponse
      >(functions, 'createRegistration');

      if (state.status === 'ready') {
        trackAddClassToCart(
          typeof window !== 'undefined' ? window : null,
          {
            classId: state.checkoutClass.id,
            className: state.checkoutClass.name,
            priceCents: state.checkoutClass.priceCents,
            quantity: data.quantity,
          }
        );
      }

      // Snapshot _fbp/_fbc and the GA4 ids at submit time so the server-side
      // Meta CAPI and GA4 `purchase` events can credit this sale to the ad
      // click / session it came from.
      const result = await createRegistration({
        ...data,
        metaAttribution: readMetaAttribution(
          typeof window !== 'undefined' ? window : null
        ),
        gaAttribution: readGaAttribution(
          typeof window !== 'undefined' ? window : null
        ),
      });
      return result.data;
    },
    [functions, state]
  );

  /**
   * Hosted-checkout fallback: when the embedded card form can't initialize
   * (e.g. Safari ITP), reserve the spot and get a Square-hosted checkout URL to
   * redirect to. `returnUrl` is this page so Square sends the buyer back here
   * after paying (the server appends ?reg=<id>).
   */
  const handleHostedCheckout = useCallback(
    async (data: {
      classId: string;
      customerEmail: string;
      customerName: string;
      customerPhone?: string;
      quantity: number;
      additionalAttendees?: CreateRegistrationRequest['additionalAttendees'];
      discountCode?: string;
      notes?: string;
      agreements?: InlineAgreementSigningData[];
    }): Promise<{ checkoutUrl: string }> => {
      const createLink = httpsCallable<
        CreateRegistrationCheckoutLinkRequest,
        CreateRegistrationCheckoutLinkResponse
      >(functions, 'createRegistrationCheckoutLink');

      const result = await createLink({
        ...data,
        returnUrl:
          typeof window !== 'undefined' ? window.location.href : undefined,
        // Square's hosted page redirects off-site, so no browser Pixel
        // `Purchase` ever fires on this path — the server event carrying these
        // cookies is the ONLY conversion signal Meta gets.
        metaAttribution: readMetaAttribution(
          typeof window !== 'undefined' ? window : null
        ),
        // Same for GA4: the server-side `purchase` is the only one this path
        // produces, and these ids are what credit it to the buyer's session.
        gaAttribution: readGaAttribution(
          typeof window !== 'undefined' ? window : null
        ),
      });
      return { checkoutUrl: result.data.checkoutUrl };
    },
    [functions]
  );

  // Bring the confirmation into view once payment completes. On a phone the
  // pay button sits far below the top of the widget, and when the buyer comes
  // back from the Apple Pay tab they were left staring at the page footer.
  const confirmationRef = useRef<HTMLDivElement>(null);
  const isConfirmed = state.status === 'confirmed';
  useEffect(() => {
    if (!isConfirmed) return;
    scrollToConfirmation(confirmationRef.current);
  }, [isConfirmed]);

  const handleSuccess = useCallback(
    (details: {
      confirmationNumber: string;
      customerName: string;
      customerEmail: string;
      pricePaidCents: number;
      quantity: number;
      agreementsSigned?: boolean;
    }) => {
      if (state.status !== 'ready') return;

      const pc = state.checkoutClass;

      trackPurchaseClass(
        typeof window !== 'undefined' ? window : null,
        {
          classId: pc.id,
          className: pc.name,
          pricePaidCents: details.pricePaidCents,
          quantity: details.quantity,
          confirmationNumber: details.confirmationNumber,
        }
      );

      setState(buildConfirmedState(pc, state.publicClass, details));
    },
    [state]
  );

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ width: '100%' }}>
        {state.status === 'loading' && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              py: 8,
            }}
          >
            <CircularProgress />
          </Box>
        )}

        {state.status === 'error' && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {state.message}
          </Alert>
        )}

        {state.status === 'confirming' && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            {!state.timedOut && <CircularProgress sx={{ mb: 2 }} />}
            <Typography variant="h6" sx={{ mb: 1 }}>
              {state.timedOut
                ? 'Payment received — you’re all set!'
                : 'Confirming your payment…'}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {state.timedOut
                ? 'We’re finalizing your registration. A confirmation email is on its way — no need to pay again.'
                : 'Just a moment while we confirm your registration.'}
            </Typography>
          </Box>
        )}

        {state.status === 'ready' && (
          <>
            {/* Registration Form */}
            {state.checkoutClass.spotsRemaining <= 0 ? (
              <SoldOutPanel
                classId={state.checkoutClass.id}
                functions={functions}
              />
            ) : !squareAppId ? (
              <Alert severity="warning">
                Registration is not currently available. Please contact us at
                katie@mapleandsprucefolkarts.com to register.
              </Alert>
            ) : (
              <Box>
                <RegistrationCheckoutForm
                  publicClass={state.checkoutClass}
                  squareApplicationId={squareAppId}
                  squareLocationId={squareLocationId}
                  applePayCheckoutUrl={digitalWalletsEnabled ? applePayCheckoutUrl : undefined}
                  showDigitalWallets={digitalWalletsEnabled}
                  requiredAgreements={state.requiredAgreements}
                  agreementsLoading={state.requiredAgreements === undefined}
                  onCalculateCost={handleCalculateCost}
                  onSubmit={handleSubmit}
                  onHostedCheckout={handleHostedCheckout}
                  onSuccess={handleSuccess}
                />
              </Box>
            )}
          </>
        )}

        {state.status === 'confirmed' && (
          <Box
            ref={confirmationRef}
            className="registration-confirmation"
            sx={{ p: 4, textAlign: 'center' }}
          >
            {/* Success header */}
            <CheckCircleOutlineIcon
              color="success"
              sx={{ fontSize: 48, mb: 1 }}
            />
            <Typography variant="h5" gutterBottom sx={{
              fontWeight: 600
            }}>
              You're Registered!
            </Typography>

            <Divider sx={{ my: 2 }} />

            {/* Class details */}
            <Box sx={{ textAlign: 'left', mb: 2 }}>
              <Typography variant="h6" sx={{
                fontWeight: 600
              }}>
                {state.className}
              </Typography>
              {state.classDate && (
                <Typography variant="body1" color="textSecondary">
                  {formatClassDateTime(state.classDate)}
                </Typography>
              )}
              {state.classDurationMinutes !== undefined && state.skillLevel && (
                <Typography variant="body2" color="textSecondary">
                  {formatDuration(state.classDurationMinutes)} &middot;{' '}
                  {formatSkillLevel(state.skillLevel)}
                </Typography>
              )}
              <Typography
                variant="body1"
                sx={{
                  fontWeight: 500,
                  mt: 1
                }}>
                ${(state.pricePaidCents / 100).toFixed(2)} paid
              </Typography>
            </Box>

            {/* Waiver signed indicator */}
            {state.agreementsSigned && (
              <Alert
                severity="success"
                icon={<CheckCircleOutlineIcon />}
                sx={{ mb: 2, textAlign: 'left' }}
              >
                Waiver signed — no further action needed.
              </Alert>
            )}

            {/* Confirmation number — de-emphasized */}
            <Typography
              variant="body2"
              color="textSecondary"
              sx={{ mb: 2 }}
            >
              Confirmation:{' '}
              <Typography
                component="span"
                variant="body2"
                sx={{
                  fontFamily: 'monospace'
                }}
              >
                {state.confirmationNumber}
              </Typography>
            </Typography>

            <Divider sx={{ my: 2 }} />

            {/* Action buttons */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                gap: 2,
                mb: 3,
              }}
            >
              {state.classDate && state.classEndDate && (
              <Button
                variant="outlined"
                color="primary"
                startIcon={<CalendarTodayIcon />}
                onClick={() => {
                  if (!state.classDate || !state.classEndDate) return;
                  const icsContent = generateIcsFile({
                    startDate: state.classDate,
                    endDate: state.classEndDate,
                    summary: state.className,
                    location:
                      state.location ?? 'Maple & Spruce Folk Arts',
                    description: `Class at Maple & Spruce Folk Arts. Confirmation: ${state.confirmationNumber}`,
                  });
                  const blob = new Blob([icsContent], {
                    type: 'text/calendar;charset=utf-8',
                  });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = 'class.ics';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                }}
              >
                Add to Calendar
              </Button>
              )}
              <Button
                variant="outlined"
                color="primary"
                startIcon={<PrintIcon />}
                onClick={() => window.print()}
              >
                Print
              </Button>
            </Box>

            {/* Email confirmation notice */}
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              A confirmation email has been sent to{' '}
              <Typography
                component="span"
                variant="body2"
                sx={{
                  fontWeight: 500
                }}
              >
                {state.customerEmail}
              </Typography>
            </Typography>

            {/* Contact info */}
            <Typography variant="body2" color="textSecondary">
              Questions? Contact us at{' '}
              <Typography
                component="a"
                href="mailto:katie@mapleandsprucefolkarts.com"
                variant="body2"
                color="primary"
                sx={{
                  fontWeight: 500,
                  textDecoration: 'none'
                }}>
                katie@mapleandsprucefolkarts.com
              </Typography>
            </Typography>
          </Box>
        )}
      </Box>
    </ThemeProvider>
  );
}
