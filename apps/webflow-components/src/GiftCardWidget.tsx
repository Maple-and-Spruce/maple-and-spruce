/**
 * Gift Card Widget: buy a Maple & Spruce gift card on the website (#300).
 *
 * Designed for embedding in Webflow via Code Components (see
 * `gift-card.webflow.tsx`). The buyer picks a dollar amount, or one class
 * when the page names one (the `classId` prop, or `?giftClass=<classId>` in
 * the URL), fills in who it is for and who it is from, and pays by card.
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
  GIFT_CARD_MAX_CENTS,
  GIFT_CARD_MESSAGE_MAX_LENGTH,
  GIFT_CARD_MIN_CENTS,
  GIFT_CARD_PRESET_CENTS,
  formatGiftCardDollars,
  isPrivateHoursClass,
} from '@maple/ts/domain';
import type { PublicClass } from '@maple/ts/domain';
import type {
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
   * Optional class to offer as a gift ("A class"). `?giftClass=<classId>` in
   * the page URL does the same and wins over this prop.
   */
  classId?: string;
}

/** The amount choices: a preset in cents, or the buyer's own. */
type AmountChoice = number | 'custom';

/** The class offered as a gift, as it loads. */
type GiftClassState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error' }
  /** Loaded, but it cannot be sold as a gift (private hours, no type, free). */
  | { status: 'unavailable' }
  | { status: 'success'; giftClass: PublicClass };

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

/** Whether a class can be bought as a certificate (mirrors the server). */
function isGiftableClass(pc: PublicClass): boolean {
  return Boolean(pc.categoryId) && pc.priceCents > 0 && !isPrivateHoursClass(pc);
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
}: GiftCardWidgetProps) {
  const functions = useMemo(() => getWidgetFunctions(env), [env]);
  const giftClassId = useMemo(() => giftClassFromUrl() ?? (classId || undefined), [classId]);

  const [giftClassState, setGiftClassState] = useState<GiftClassState>(
    giftClassId ? { status: 'loading' } : { status: 'none' }
  );
  const [kind, setKind] = useState<'amount' | 'class'>('amount');
  const [amountChoice, setAmountChoice] = useState<AmountChoice>(5000);
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

  // Load the class offered as a gift, if the page names one.
  useEffect(() => {
    if (!giftClassId) return;
    let cancelled = false;
    setGiftClassState({ status: 'loading' });
    const getPublicClass = routeCallable<GetPublicClassRequest, GetPublicClassResponse>(
      functions,
      'publicSite',
      'getPublicClass'
    );
    getPublicClass({ id: giftClassId })
      .then((res) => {
        if (cancelled) return;
        const pc = res.data.class;
        if (isGiftableClass(pc)) {
          setGiftClassState({ status: 'success', giftClass: pc });
          setKind('class');
        } else {
          setGiftClassState({ status: 'unavailable' });
        }
      })
      .catch(() => {
        if (!cancelled) setGiftClassState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [functions, giftClassId]);

  const giftClass = giftClassState.status === 'success' ? giftClassState.giftClass : undefined;
  const amountCents =
    amountChoice === 'custom' ? dollarsToCents(customDollars) : amountChoice;
  const valueCents = kind === 'class' && giftClass ? giftClass.priceCents : amountCents;
  const description =
    kind === 'class' && giftClass
      ? `One ${giftClass.categoryName ? `${giftClass.categoryName} ` : ''}class (${giftClass.name})`
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
      return kind === 'class' && giftClass
        ? { ...base, kind: 'class', classId: giftClass.id }
        : { ...base, kind: 'amount', amountCents };
    },
    [buyerName, buyerEmail, recipientName, recipientEmail, message, deliverTo, kind, giftClass, amountCents]
  );

  /** Check the form with the server's own suite; true when it is good to pay. */
  const validate = useCallback((): boolean => {
    // Placeholders for what only exists at pay time.
    const result = giftCardPurchaseValidation(buildRequest('pending-card', 'pending-key'));
    const errors = result.getErrors();
    const next: FieldErrors = {};
    for (const [field, messages] of Object.entries(errors)) next[field] = messages[0];
    setFieldErrors(next);
    return !result.hasErrors();
  }, [buildRequest]);

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
        err instanceof Error && err.message
          ? err.message
          : 'We could not complete your purchase. Please try again.'
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
          <CheckCircleOutlineIcon color="success" sx={{ fontSize: 48 }} />
          <Typography variant="h5" component="h2">
            {toThem ? 'Your gift card is on its way' : 'Your gift card is ready'}
          </Typography>
          <Typography variant="body1">
            {step.description} gift card, ending in{' '}
            <Box component="span" sx={{ fontFamily: fonts.mono }}>
              {result.last4}
            </Box>
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

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ maxWidth: 520, mx: 'auto' }}>
        <Stack spacing={3}>
          {/* What to give */}
          <FormControl component="fieldset">
            <FormLabel component="legend" sx={{ mb: 1 }}>
              What would you like to give?
            </FormLabel>
            <ToggleButtonGroup
              exclusive
              value={kind === 'class' ? 'class' : amountChoice}
              onChange={(_e, value: AmountChoice | 'class' | null) => {
                if (value === null) return;
                if (value === 'class') {
                  setKind('class');
                } else {
                  setKind('amount');
                  setAmountChoice(value);
                }
              }}
              aria-label="Gift card amount"
              sx={{ flexWrap: 'wrap', gap: 1, '& .MuiToggleButton-root': { borderRadius: 1, border: 1, borderColor: 'divider' } }}
            >
              {GIFT_CARD_PRESET_CENTS.map((cents) => (
                <ToggleButton key={cents} value={cents} disabled={paying}>
                  {formatGiftCardDollars(cents)}
                </ToggleButton>
              ))}
              <ToggleButton value="custom" disabled={paying}>
                Other amount
              </ToggleButton>
              {giftClass && (
                <ToggleButton value="class" disabled={paying}>
                  A class
                </ToggleButton>
              )}
            </ToggleButtonGroup>

            {giftClassState.status === 'loading' && (
              <Box aria-busy="true" aria-label="Loading the class" sx={{ mt: 1.5 }}>
                <Skeleton variant="rounded" height={56} />
              </Box>
            )}
            {giftClassState.status === 'error' && (
              <Alert severity="info" sx={{ mt: 1.5 }}>
                We could not load that class right now. You can still give a dollar amount.
              </Alert>
            )}
            {giftClassState.status === 'unavailable' && (
              <Alert severity="info" sx={{ mt: 1.5 }}>
                That class cannot be given as a gift certificate. You can give a dollar amount
                instead.
              </Alert>
            )}

            {kind === 'amount' && amountChoice === 'custom' && (
              <TextField
                label="Amount in dollars"
                value={customDollars}
                onChange={(e) => setCustomDollars(e.target.value)}
                inputMode="numeric"
                disabled={paying}
                error={Boolean(fieldErrors['amountCents'])}
                helperText={
                  fieldErrors['amountCents'] ??
                  `Whole dollars, $${GIFT_CARD_MIN_CENTS / 100} to $${GIFT_CARD_MAX_CENTS / 100}`
                }
                sx={{ mt: 2, maxWidth: 240 }}
              />
            )}

            {kind === 'class' && giftClass && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {giftClass.name}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {formatGiftCardDollars(giftClass.priceCents)}. Good for this class or any{' '}
                  {giftClass.categoryName ? `${giftClass.categoryName} ` : ''}class. Any money
                  left over spends like a regular gift card.
                </Typography>
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
      </Box>
    </ThemeProvider>
  );
}
