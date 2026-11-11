/**
 * Gift Card Widget: buy a Maple & Spruce gift card on the website (#300).
 *
 * Designed for embedding in Webflow via Code Components (see
 * `gift-card.webflow.tsx`). On mount it loads what Katie sells
 * (`publicSite/getGiftCardOptions`, #309): the one-tap amounts, the lowest and
 * highest "Other amount", and the class types switched on as gift
 * certificates. The buyer picks an amount or a class type, fills in who it is
 * for and who it is from, and pays by card. A class link
 * (`?giftClass=<classId>`, or the `classId` prop) preselects that class's
 * type when the type is on.
 * `giftCards/purchaseGiftCard` charges the card, makes the Square gift card
 * and emails the code; this widget only ever sees the last 4 digits.
 *
 * Reuses the registration checkout's `SquareCardForm` for the card field and
 * tokenize flow. No Next.js dependencies: Firebase is initialized from `env`
 * (see firebase-init.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Skeleton,
  Stack,
  TextField,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import { theme, fonts } from '@maple/react/theme';
import { SquareCardForm } from '@maple/react/registrations';
import type { CardTokenizeResult } from '@maple/react/registrations';
import {
  GIFT_CARD_MESSAGE_MAX_LENGTH,
  formatGiftCardDollars,
  errorMessageFor,
} from '@maple/ts/domain';
import type { GiftCertificateClassType, RequestState } from '@maple/ts/domain';
import type {
  GetGiftCardOptionsRequest,
  GetGiftCardOptionsResponse,
  GetPublicClassRequest,
  GetPublicClassResponse,
  PurchaseGiftCardRequest,
  PurchaseGiftCardResponse,
} from '@maple/ts/firebase/api-types';
import { giftCardPurchaseValidation } from '@maple/ts/validation';
import { getWidgetFunctions, routeCallable } from './firebase-init';
import { trackAddGiftCardToCart, trackPurchaseGiftCard } from './lib/gift-card-analytics';

export interface GiftCardWidgetProps {
  /** Square application ID (sandbox or production). */
  squareAppId: string;
  /** Square location ID. */
  squareLocationId: string;
  /** 'dev' | 'prod' | 'emulator': selects the Firebase project + Square SDK. */
  env: string;
  /**
   * Optional class whose type to preselect under "A class".
   * `?giftClass=<classId>` in the page URL does the same and wins over this
   * prop.
   */
  classId?: string;
  /** The page heading (h1). Server-rendered by Webflow. */
  heading?: string;
  /** The line under the heading. */
  intro?: string;
  /** Small print under the form. */
  finePrint?: string;
}

export const GIFT_CARD_DEFAULT_HEADING = 'Give the gift of making';
export const GIFT_CARD_DEFAULT_INTRO =
  'A Maple & Spruce gift card is good for handmade goods from local artists and for craft classes. Send it by email, or send it to yourself to print.';
export const GIFT_CARD_DEFAULT_FINE_PRINT =
  "Gift cards never expire and can't be exchanged for cash. They are good at Maple & Spruce, but not for Music Together, which is a separate business.";

/** The amount choices: a preset in cents, or the buyer's own. */
type AmountChoice = number | 'custom';

/**
 * The class a link names, resolved to its type. `failed` covers a class that
 * could not be read; the buyer then just picks a type.
 */
type GiftClassState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'resolved'; classCategoryId: string | undefined };

type Step =
  | { status: 'form' }
  | { status: 'paying' }
  | { status: 'done'; result: PurchaseGiftCardResponse; description: string };

/** Field-level messages from the shared Vest suite. */
type FieldErrors = Record<string, string | undefined>;

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `gc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** `?giftClass=` from the page URL, if any. */
function giftClassFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get('giftClass') ?? undefined;
}

/** Dollars typed by the buyer to cents, or NaN when it is not a number. */
function dollarsToCents(text: string): number {
  const trimmed = text.trim().replace(/^\$/, '');
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return Number.NaN;
  return Math.round(Number(trimmed) * 100);
}

export function GiftCardWidget({
  squareAppId,
  squareLocationId,
  env,
  classId,
  heading = GIFT_CARD_DEFAULT_HEADING,
  intro = GIFT_CARD_DEFAULT_INTRO,
  finePrint = GIFT_CARD_DEFAULT_FINE_PRINT,
}: GiftCardWidgetProps) {
  const functions = useMemo(() => getWidgetFunctions(env), [env]);
  const giftClassId = useMemo(() => giftClassFromUrl() ?? (classId || undefined), [classId]);

  const [optionsState, setOptionsState] = useState<RequestState<GetGiftCardOptionsResponse>>({
    status: 'loading',
  });
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [giftClassState, setGiftClassState] = useState<GiftClassState>(
    giftClassId ? { status: 'loading' } : { status: 'none' }
  );
  const [kind, setKind] = useState<'amount' | 'class'>('amount');
  /** `null` until the buyer picks: the middle preset is the default. */
  const [amountChoice, setAmountChoice] = useState<AmountChoice | null>(null);
  const [classTypeId, setClassTypeId] = useState<string | undefined>(undefined);
  const preselected = useRef(false);
  const [customDollars, setCustomDollars] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [message, setMessage] = useState('');
  const [deliverTo, setDeliverTo] = useState<'recipient' | 'buyer'>('recipient');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ status: 'form' });
  const [cardReady, setCardReady] = useState(false);
  const tokenizeRef = useRef<(() => Promise<CardTokenizeResult>) | null>(null);

  // Wake the purchase route now: the buyer will press Pay a minute from now,
  // and its codebase cold-starts in several seconds (ADR-031). A router route
  // is warmed through its URL, the same way it is called.
  useEffect(() => {
    void (async () => {
      try {
        await routeCallable(functions, 'giftCards', 'purchaseGiftCard')({ __warmup: true });
      } catch {
        // best-effort
      }
    })();
  }, [functions]);

  // What Katie sells: the amounts and the class types that are switched on.
  useEffect(() => {
    let cancelled = false;
    setOptionsState({ status: 'loading' });
    routeCallable<GetGiftCardOptionsRequest, GetGiftCardOptionsResponse>(
      functions,
      'publicSite',
      'getGiftCardOptions'
    )({})
      .then((res) => {
        if (!cancelled) setOptionsState({ status: 'success', data: res.data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setOptionsState({
            status: 'error',
            error: errorMessageFor(err, 'Could not load gift card options'),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [functions, optionsAttempt]);

  // A class link: find the class's type, to preselect it.
  useEffect(() => {
    if (!giftClassId) return;
    let cancelled = false;
    setGiftClassState({ status: 'loading' });
    routeCallable<GetPublicClassRequest, GetPublicClassResponse>(
      functions,
      'publicSite',
      'getPublicClass'
    )({ id: giftClassId })
      .then((res) => {
        if (!cancelled) {
          setGiftClassState({ status: 'resolved', classCategoryId: res.data.class.categoryId });
        }
      })
      .catch(() => {
        if (!cancelled) setGiftClassState({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [functions, giftClassId]);

  const options = optionsState.status === 'success' ? optionsState.data : undefined;
  const amounts = options?.amounts;
  const classTypes: GiftCertificateClassType[] = useMemo(
    () => options?.classTypes ?? [],
    [options]
  );
  const linkedCategoryId =
    giftClassState.status === 'resolved' ? giftClassState.classCategoryId : undefined;
  const linkedTypeIsOn = classTypes.some((t) => t.id === linkedCategoryId);

  // Once both reads are in, a class link opens on "A class": its own type
  // when that is switched on, otherwise the picker.
  useEffect(() => {
    if (preselected.current || !giftClassId || !options) return;
    if (giftClassState.status === 'loading') return;
    preselected.current = true;
    if (classTypes.length === 0) return;
    setKind('class');
    if (linkedTypeIsOn) setClassTypeId(linkedCategoryId);
    else if (classTypes.length === 1) setClassTypeId(classTypes[0].id);
  }, [giftClassId, options, giftClassState.status, classTypes, linkedTypeIsOn, linkedCategoryId]);

  const presets = amounts?.presetCents ?? [];
  const defaultPreset = presets[Math.min(1, presets.length - 1)];
  const effectiveChoice: AmountChoice | undefined = amountChoice ?? defaultPreset;
  const classType = classTypes.find((t) => t.id === classTypeId);
  const amountCents =
    effectiveChoice === 'custom'
      ? dollarsToCents(customDollars)
      : (effectiveChoice ?? Number.NaN);
  const valueCents = kind === 'class' ? (classType?.priceCents ?? Number.NaN) : amountCents;
  const description =
    kind === 'class' && classType
      ? `One ${classType.name} class`
      : Number.isFinite(amountCents)
        ? formatGiftCardDollars(amountCents)
        : 'Gift card';

  const buildRequest = useCallback(
    (sourceId: string, idempotencyKey: string): PurchaseGiftCardRequest => {
      // Optional fields are left out when empty: the callable wire turns an
      // `undefined` value into `null`.
      const optional = Object.fromEntries(
        Object.entries({
          recipientName: recipientName.trim(),
          recipientEmail: recipientEmail.trim(),
          message: message.trim(),
        }).filter(([, value]) => value !== '')
      ) as { recipientName?: string; recipientEmail?: string; message?: string };
      const base = {
        buyerName: buyerName.trim(),
        buyerEmail: buyerEmail.trim(),
        ...optional,
        deliverTo,
        sourceId,
        idempotencyKey,
      };
      if (kind === 'class') {
        // The old class link rides along for the record when it is the
        // type being bought.
        const viaLink =
          classTypeId && giftClassId && classTypeId === linkedCategoryId
            ? { classId: giftClassId }
            : {};
        return {
          ...base,
          kind: 'class',
          ...(classTypeId ? { classCategoryId: classTypeId } : {}),
          ...viaLink,
        };
      }
      return { ...base, kind: 'amount', amountCents };
    },
    [
      buyerName,
      buyerEmail,
      recipientName,
      recipientEmail,
      message,
      deliverTo,
      kind,
      classTypeId,
      giftClassId,
      linkedCategoryId,
      amountCents,
    ]
  );

  /** Check the form with the server's own suite; true when it is good to pay. */
  const validate = useCallback((): boolean => {
    // Placeholders for what only exists at pay time.
    const result = giftCardPurchaseValidation(
      buildRequest('pending-card', 'pending-key'),
      undefined,
      amounts
    );
    const errors = result.getErrors();
    const next: FieldErrors = {};
    for (const [field, messages] of Object.entries(errors)) next[field] = messages[0];
    setFieldErrors(next);
    return !result.hasErrors();
  }, [buildRequest, amounts]);

  const handlePay = useCallback(async () => {
    setSubmitError(null);
    if (!validate()) {
      setSubmitError('Please check the highlighted fields.');
      return;
    }
    if (!tokenizeRef.current) return;
    setStep({ status: 'paying' });
    trackAddGiftCardToCart(typeof window !== 'undefined' ? window : null, { valueCents });
    try {
      const { nonce } = await tokenizeRef.current();
      // A fresh key per attempt: a declined card is retried with a new card
      // nonce, which Square would refuse under the old key.
      const purchase = routeCallable<PurchaseGiftCardRequest, PurchaseGiftCardResponse>(
        functions,
        'giftCards',
        'purchaseGiftCard'
      );
      const res = await purchase(buildRequest(nonce, newIdempotencyKey()));
      trackPurchaseGiftCard(typeof window !== 'undefined' ? window : null, {
        valueCents: res.data.valueCents,
        transactionId: res.data.giftCardId,
      });
      setStep({ status: 'done', result: res.data, description });
    } catch (err) {
      setSubmitError(
        errorMessageFor(err, 'We could not complete your purchase. Please try again.')
      );
      setStep({ status: 'form' });
    }
  }, [validate, valueCents, functions, buildRequest, description]);

  if (step.status === 'done') {
    const { result } = step;
    const toThem = result.deliverTo === 'recipient';
    return (
      <ThemeProvider theme={theme}>
        <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center', py: 3, maxWidth: 520, mx: 'auto' }}>
          <Typography variant="h4" component="h1">
            {heading}
          </Typography>
          <CheckCircleOutlineIcon color="success" sx={{ fontSize: 48 }} />
          <Typography variant="h5" component="h2">
            {toThem ? 'Your gift card is on its way' : 'Your gift card is ready'}
          </Typography>
          <Typography variant="body1">
            {step.description} gift card
            {result.last4 ? (
              <>
                , ending in{' '}
                <Box component="span" sx={{ fontFamily: fonts.mono }}>
                  {result.last4}
                </Box>
              </>
            ) : null}
            .
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {toThem
              ? `We emailed it to ${result.sentTo}. You will get a receipt by email too.`
              : `We emailed it to you at ${result.sentTo}. Print the email or write the code on a card to give it.`}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Questions? Email katie@mapleandsprucefolkarts.com or call 304-314-4506.
          </Typography>
        </Stack>
      </ThemeProvider>
    );
  }

  const paying = step.status === 'paying';
  const payDisabled = paying || !cardReady || !Number.isFinite(valueCents);
  const messageLeft = GIFT_CARD_MESSAGE_MAX_LENGTH - message.length;
  const optionsLoading =
    optionsState.status === 'idle' ||
    optionsState.status === 'loading' ||
    (Boolean(giftClassId) && giftClassState.status === 'loading');
  const linkedTypeOff =
    Boolean(giftClassId) && !optionsLoading && !linkedTypeIsOn && giftClassState.status !== 'none';

  const header = (
    <Stack spacing={1} sx={{ mb: 3 }}>
      <Typography variant="h4" component="h1">
        {heading}
      </Typography>
      {intro && (
        <Typography variant="body1" color="textSecondary">
          {intro}
        </Typography>
      )}
    </Stack>
  );
  const footer = finePrint ? (
    <Typography variant="caption" color="textSecondary" component="p" sx={{ mt: 3 }}>
      {finePrint}
    </Typography>
  ) : null;

  if (optionsState.status === 'error') {
    return (
      <ThemeProvider theme={theme}>
        <Box sx={{ maxWidth: 520, mx: 'auto' }}>
          {header}
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => setOptionsAttempt((n) => n + 1)}>
                Try again
              </Button>
            }
          >
            We could not load the gift card options. Please try again, or call us at
            304-314-4506.
          </Alert>
          {footer}
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ maxWidth: 520, mx: 'auto' }}>
        {header}
        <Stack spacing={3}>
          {/* What to give */}
          <FormControl component="fieldset">
            <FormLabel component="legend" sx={{ mb: 1 }}>
              What would you like to give?
            </FormLabel>

            {optionsLoading ? (
              <Box aria-busy="true" aria-label="Loading gift card options">
                <Stack direction="row" spacing={1}>
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} variant="rounded" width={88} height={40} />
                  ))}
                </Stack>
              </Box>
            ) : (
              <ToggleButtonGroup
                exclusive
                value={kind === 'class' ? 'class' : effectiveChoice}
                onChange={(_e, value: AmountChoice | 'class' | null) => {
                  if (value === null) return;
                  if (value === 'class') {
                    setKind('class');
                    if (!classTypeId && classTypes.length === 1) setClassTypeId(classTypes[0].id);
                  } else {
                    setKind('amount');
                    setAmountChoice(value);
                  }
                }}
                aria-label="Gift card amount"
                sx={{ flexWrap: 'wrap', gap: 1, '& .MuiToggleButton-root': { borderRadius: 1, border: 1, borderColor: 'divider' } }}
              >
                {presets.map((cents) => (
                  <ToggleButton key={cents} value={cents} disabled={paying}>
                    {formatGiftCardDollars(cents)}
                  </ToggleButton>
                ))}
                <ToggleButton value="custom" disabled={paying}>
                  Other amount
                </ToggleButton>
                {classTypes.length > 0 && (
                  <ToggleButton value="class" disabled={paying}>
                    A class
                  </ToggleButton>
                )}
              </ToggleButtonGroup>
            )}

            {!optionsLoading && linkedTypeOff && classTypes.length === 0 && (
              <Alert severity="info" sx={{ mt: 1.5 }}>
                That class cannot be given as a gift certificate. You can give a dollar amount
                instead.
              </Alert>
            )}

            {kind === 'amount' && effectiveChoice === 'custom' && amounts && (
              <TextField
                label="Amount in dollars"
                value={customDollars}
                onChange={(e) => setCustomDollars(e.target.value)}
                inputMode="numeric"
                disabled={paying}
                error={Boolean(fieldErrors['amountCents'])}
                helperText={
                  fieldErrors['amountCents'] ??
                  `Whole dollars, ${formatGiftCardDollars(amounts.minCents)} to ${formatGiftCardDollars(amounts.maxCents)}`
                }
                sx={{ mt: 2, maxWidth: 240 }}
              />
            )}

            {kind === 'class' && classTypes.length > 0 && (
              <Box sx={{ mt: 2 }}>
                {linkedTypeOff && (
                  <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                    That class is not sold as a gift certificate, but these are.
                  </Typography>
                )}
                <RadioGroup
                  aria-label="Class type"
                  value={classTypeId ?? ''}
                  onChange={(e) => setClassTypeId(e.target.value)}
                >
                  <Stack spacing={1}>
                    {classTypes.map((type) => (
                      <FormControlLabel
                        key={type.id}
                        value={type.id}
                        disabled={paying}
                        control={<Radio />}
                        sx={{
                          m: 0,
                          p: 1,
                          border: 1,
                          borderColor: classTypeId === type.id ? 'primary.main' : 'divider',
                          borderRadius: 1,
                        }}
                        label={
                          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                            {type.imageUrl && (
                              <Box
                                component="img"
                                src={type.imageUrl}
                                alt={type.imageAlt ?? ''}
                                sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1 }}
                              />
                            )}
                            <Box>
                              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                {type.name}
                              </Typography>
                              <Typography variant="body2" color="textSecondary">
                                {formatGiftCardDollars(type.priceCents)}
                              </Typography>
                            </Box>
                          </Stack>
                        }
                      />
                    ))}
                  </Stack>
                </RadioGroup>
                {fieldErrors['classCategoryId'] && (
                  <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                    {fieldErrors['classCategoryId']}
                  </Typography>
                )}
                {classType && (
                  <Typography variant="body2" color="textSecondary" sx={{ mt: 1.5 }}>
                    Good for one {classType.name} class. Any money left over spends like a
                    regular gift card.
                  </Typography>
                )}
              </Box>
            )}
          </FormControl>

          {/* Who it is for */}
          <Stack spacing={2}>
            <Typography variant="h6" component="h3">
              Who is it for?
            </Typography>
            <TextField
              label="Their name"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              disabled={paying}
              error={Boolean(fieldErrors['recipientName'])}
              helperText={fieldErrors['recipientName']}
              fullWidth
            />
            <TextField
              label={deliverTo === 'recipient' ? 'Their email' : 'Their email (optional)'}
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              disabled={paying}
              required={deliverTo === 'recipient'}
              error={Boolean(fieldErrors['recipientEmail'])}
              helperText={fieldErrors['recipientEmail']}
              fullWidth
            />
          </Stack>

          {/* Who it is from */}
          <Stack spacing={2}>
            <Typography variant="h6" component="h3">
              From
            </Typography>
            <TextField
              label="Your name"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              disabled={paying}
              required
              error={Boolean(fieldErrors['buyerName'])}
              helperText={fieldErrors['buyerName']}
              fullWidth
            />
            <TextField
              label="Your email"
              type="email"
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              disabled={paying}
              required
              error={Boolean(fieldErrors['buyerEmail'])}
              helperText={fieldErrors['buyerEmail'] ?? 'For your receipt'}
              fullWidth
            />
            <TextField
              label="Message (optional)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={paying}
              multiline
              minRows={3}
              error={messageLeft < 0 || Boolean(fieldErrors['message'])}
              helperText={
                fieldErrors['message'] ??
                (messageLeft < 0
                  ? `${-messageLeft} characters too long`
                  : `${messageLeft} characters left`)
              }
              fullWidth
            />
          </Stack>

          <FormControl component="fieldset">
            <FormLabel component="legend">Send it to</FormLabel>
            <RadioGroup
              value={deliverTo}
              onChange={(e) => setDeliverTo(e.target.value as 'recipient' | 'buyer')}
            >
              <FormControlLabel
                value="recipient"
                control={<Radio />}
                label="Them, by email"
                disabled={paying}
              />
              <FormControlLabel
                value="buyer"
                control={<Radio />}
                label="Me, so I can print it"
                disabled={paying}
              />
            </RadioGroup>
          </FormControl>

          {submitError && <Alert severity="error">{submitError}</Alert>}

          {!squareAppId ? (
            <Alert severity="warning">
              Gift cards are not available online right now. Please call us at 304-314-4506.
            </Alert>
          ) : (
            <SquareCardForm
              applicationId={squareAppId}
              locationId={squareLocationId}
              env={env}
              totalCents={Number.isFinite(valueCents) ? valueCents : undefined}
              maxWidth={520}
              onReady={() => setCardReady(true)}
              onTokenizeRef={(fn) => {
                tokenizeRef.current = fn;
              }}
              afterCardContent={
                // Native button with inline brand styling: in Shadow DOM this
                // is portaled to the light DOM, where MUI theme CSS cannot
                // reach it. Mirrors CraftClubSignupWidget's pay button.
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
                    letterSpacing: '0.02em',
                  }}
                >
                  {paying
                    ? 'Buying your gift card…'
                    : Number.isFinite(valueCents)
                      ? `Buy gift card: ${formatGiftCardDollars(valueCents)}`
                      : 'Buy gift card'}
                </button>
              }
            />
          )}
        </Stack>
        {footer}
      </Box>
    </ThemeProvider>
  );
}
