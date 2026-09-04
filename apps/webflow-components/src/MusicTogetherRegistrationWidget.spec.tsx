// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import type { PublicMusicTogetherSection } from '@maple/ts/firebase/api-types';

// Canned section returned by getPublicMusicTogetherSection for the next render.
let nextSection: PublicMusicTogetherSection = makeSection();
// Canned discount returned by lookupDiscount (undefined = unknown code).
let nextDiscount: unknown = undefined;
// Records the last payload sent to each callable, by name.
const calls: Record<string, unknown> = {};

function makeSection(
  overrides: Partial<PublicMusicTogetherSection> = {}
): PublicMusicTogetherSection {
  return {
    id: 'sec-thu',
    name: 'Thursday Morning — Mixed Age (0–5)',
    sessions: [{ dateTime: '2026-09-10T14:00:00.000Z' }],
    priceFullCents: 25200,
    installmentPlan: [
      { amountCents: 13200, dueAt: '2026-09-10T14:00:00.000Z' },
      { amountCents: 13200, dueAt: '2026-10-08T14:00:00.000Z' },
    ],
    capacityFamilies: 8,
    spotsRemaining: 5,
    enrollmentOpen: true,
    ...overrides,
  };
}

vi.mock('./firebase-init', () => ({
  getWidgetFunctions: () => ({ __mock: true }),
}));

vi.mock('./lib/warmup', () => ({ warmup: vi.fn() }));

vi.mock('firebase/functions', () => ({
  httpsCallable:
    (_fns: unknown, name: string) => (payload: unknown) => {
      calls[name] = payload;
      if (name === 'getPublicMusicTogetherSection') {
        return Promise.resolve({ data: { section: nextSection } });
      }
      if (name === 'createMusicTogetherRegistration') {
        const plan = (payload as { paymentPlan: string }).paymentPlan;
        return Promise.resolve({
          data: {
            registrationId: 'reg-1',
            status: 'confirmed',
            amountChargedCents: plan === 'installments' ? 13200 : 25200,
            scheduledChargeCount: plan === 'installments' ? 1 : 0,
            cardLast4: plan === 'installments' ? '4242' : undefined,
          },
        });
      }
      if (name === 'addToMusicTogetherWaitlist') {
        return Promise.resolve({ data: { added: true } });
      }
      if (name === 'lookupDiscount') {
        return Promise.resolve({ data: { discount: nextDiscount } });
      }
      return Promise.resolve({ data: {} });
    },
}));

// Stub the Square card form: immediately ready with a fake tokenizer, and
// render the submit button passed via afterCardContent.
vi.mock('@maple/react/registrations', () => ({
  SquareCardForm: ({
    onReady,
    onTokenizeRef,
    afterCardContent,
  }: {
    onReady?: () => void;
    onTokenizeRef: (
      fn: () => Promise<{ nonce: string; verificationToken?: string }>
    ) => void;
    afterCardContent?: React.ReactNode;
  }) => {
    useEffect(() => {
      onTokenizeRef(async () => ({
        nonce: 'cnon:test-nonce',
        verificationToken: 'verf:test-token',
      }));
      onReady?.();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="mock-card-form">{afterCardContent}</div>;
  },
}));

import { MusicTogetherRegistrationWidget } from './MusicTogetherRegistrationWidget';

function renderWidget() {
  return render(
    <MusicTogetherRegistrationWidget
      sectionId="sec-thu"
      squareAppId="sandbox-app"
      squareLocationId="LOC1"
      env="dev"
      policiesUrl="https://example.com/music-together/policies"
    />
  );
}

/**
 * Set a controlled text field's value in a single event. Typing character by
 * character with `user.type` re-renders the whole MUI form per keystroke, which
 * is slow enough to blow the per-test timeout under CI + coverage.
 */
function setField(matcher: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(matcher), { target: { value } });
}

/** Fill every required family field so the Register button can enable. */
function fillFamily() {
  setField(/^First name/i, 'Jane');
  setField(/^Last name/i, 'Doe');
  setField(/Child's first name/i, 'Baby Doe');
  setField(/Date of birth/i, '2024-03-15');
  setField(/^Email/i, 'jane@example.com');
  setField(/^Phone/i, '304-555-0100');
  setField(/Full mailing address/i, '1 Main St');
}

/** Check both required consent boxes (policies + privacy notice). */
async function acceptConsents(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText(/I have read and agree/i));
  await user.click(screen.getByLabelText(/shared with Music Together Worldwide/i));
}

/**
 * Stand in for fbevents.js. The MT pixel init is memoized on `window`, so the
 * flag has to be cleared between tests or only the first one sees the init.
 */
function installFbq(): ReturnType<typeof vi.fn> {
  const fbq = vi.fn();
  const w = window as unknown as {
    fbq?: unknown;
    __mtPixelInitialized?: boolean;
  };
  w.fbq = fbq;
  w.__mtPixelInitialized = false;
  return fbq;
}

describe('MusicTogetherRegistrationWidget', () => {
  beforeEach(() => {
    nextSection = makeSection();
    nextDiscount = undefined;
    for (const k of Object.keys(calls)) delete calls[k];
  });
  afterEach(() => {
    cleanup();
    const w = window as unknown as {
      fbq?: unknown;
      __mtPixelInitialized?: boolean;
    };
    delete w.fbq;
    delete w.__mtPixelInitialized;
  });

  /**
   * The full MT funnel on the MT pixel. The `Purchase` eventID must be
   * `mt-<registrationId>` — `sendMusicTogetherConversion` sends the server-side
   * twin under that exact id, and if the two drift Meta stops collapsing them
   * and every enrollment is counted twice.
   */
  it('fires ViewContent → InitiateCheckout → Purchase on the Music Together pixel', async () => {
    const fbq = installFbq();
    const user = userEvent.setup({ delay: null });
    renderWidget();

    expect(
      await screen.findByText(/Register — Thursday Morning/i)
    ).toBeInTheDocument();

    // ViewContent lands as soon as the section loads.
    const viewed = fbq.mock.calls.filter((c) => c[2] === 'ViewContent');
    expect(viewed).toHaveLength(1);
    expect(viewed[0][0]).toBe('trackSingle');
    expect(viewed[0][1]).toBe('1562555242035326');
    expect(viewed[0][3]).toMatchObject({
      content_ids: ['sec-thu'],
      content_category: 'music_together',
      value: 252,
    });

    fillFamily();
    await acceptConsents(user);
    const registerBtn = await screen.findByRole('button', {
      name: /Register — \$252\.00/i,
    });
    await waitFor(() => expect(registerBtn).toBeEnabled());
    await user.click(registerBtn);
    expect(await screen.findByText(/You're registered!/i)).toBeInTheDocument();

    const checkout = fbq.mock.calls.filter((c) => c[2] === 'InitiateCheckout');
    expect(checkout).toHaveLength(1);
    expect(checkout[0][1]).toBe('1562555242035326');

    const purchases = fbq.mock.calls.filter((c) => c[2] === 'Purchase');
    expect(purchases).toHaveLength(1);
    expect(purchases[0][0]).toBe('trackSingle');
    expect(purchases[0][1]).toBe('1562555242035326');
    expect(purchases[0][3]).toMatchObject({
      content_ids: ['sec-thu'],
      value: 252,
      num_items: 1,
      payment_plan: 'full',
      amount_paid_today: 252,
    });
    // Dedup key shared with sendMusicTogetherConversion.
    expect(purchases[0][4]).toEqual({ eventID: 'mt-reg-1' });

    // Nothing un-scoped: none of this may reach the Maple & Spruce pixel.
    expect(fbq.mock.calls.some((c) => c[0] === 'track')).toBe(false);
  });

  /**
   * Meta resolves a deduplicated pair with mismatched `value` unpredictably.
   * The server reports the FULL committed tuition, so the browser must too —
   * NOT the installment actually charged today.
   */
  it('reports the full committed tuition on an installment Purchase', async () => {
    const fbq = installFbq();
    const user = userEvent.setup({ delay: null });
    renderWidget();
    expect(
      await screen.findByText(/Register — Thursday Morning/i)
    ).toBeInTheDocument();

    fillFamily();
    await acceptConsents(user);
    await user.click(screen.getByRole('radio', { name: /Two installments/i }));
    await user.click(screen.getByLabelText(/I authorize Music Together/i));

    const registerBtn = await screen.findByRole('button', {
      name: /Register — \$132\.00/i,
    });
    await waitFor(() => expect(registerBtn).toBeEnabled());
    await user.click(registerBtn);
    expect(await screen.findByText(/You're registered!/i)).toBeInTheDocument();

    const purchase = fbq.mock.calls.find((c) => c[2] === 'Purchase');
    expect(purchase?.[3]).toMatchObject({
      // Full committed total, matching the server event.
      value: 252,
      // Cash collected today — the timing story, not the optimization target.
      amount_paid_today: 132,
      payment_plan: 'installments',
    });
  });

  it('completes registration when fbevents never loads (ad blocker)', async () => {
    const user = userEvent.setup({ delay: null });
    renderWidget();
    expect(
      await screen.findByText(/Register — Thursday Morning/i)
    ).toBeInTheDocument();

    fillFamily();
    await acceptConsents(user);
    const registerBtn = await screen.findByRole('button', {
      name: /Register — \$252\.00/i,
    });
    await waitFor(() => expect(registerBtn).toBeEnabled());
    await user.click(registerBtn);

    // Analytics is never allowed to break a paid registration.
    expect(await screen.findByText(/You're registered!/i)).toBeInTheDocument();
  });

  it('registers a family paying in full', async () => {
    const user = userEvent.setup({ delay: null });
    renderWidget();

    // Section header renders once loaded.
    expect(
      await screen.findByText(/Register — Thursday Morning/i)
    ).toBeInTheDocument();

    fillFamily();
    // Accept the policies + privacy notice (both required).
    await acceptConsents(user);

    const registerBtn = await screen.findByRole('button', {
      name: /Register — \$252\.00/i,
    });
    await waitFor(() => expect(registerBtn).toBeEnabled());
    await user.click(registerBtn);

    expect(await screen.findByText(/You're registered!/i)).toBeInTheDocument();
    expect(screen.getByText(/\$252\.00 paid today/i)).toBeInTheDocument();

    expect(calls['createMusicTogetherRegistration']).toMatchObject({
      sectionId: 'sec-thu',
      adultFirstName: 'Jane',
      adultLastName: 'Doe',
      parentNames: ['Jane Doe'],
      email: 'jane@example.com',
      phone: '304-555-0100',
      address: '1 Main St',
      paymentPlan: 'full',
      policiesAccepted: true,
      privacyConsent: true,
      paymentNonce: 'cnon:test-nonce',
    });
    const payload = calls['createMusicTogetherRegistration'] as {
      children: { name: string; dob: string }[];
    };
    expect(payload.children).toHaveLength(1);
    expect(payload.children[0].name).toBe('Baby Doe');
    expect(payload.children[0].dob).toMatch(/^2024-03-15/);
  });

  it('names the specific missing field(s) instead of a generic hint', async () => {
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await screen.findByText(/Register — Thursday Morning/i);

    // Fill everything EXCEPT the child's date of birth, and accept both
    // consents — so the only thing missing is the DOB (easiest to overlook).
    setField(/^First name/i, 'Jane');
    setField(/^Last name/i, 'Doe');
    setField(/Child's first name/i, 'Baby Doe');
    setField(/^Email/i, 'jane@example.com');
    setField(/^Phone/i, '304-555-0100');
    setField(/Full mailing address/i, '1 Main St');
    await acceptConsents(user);

    expect(
      await screen.findByText(/Still needed:.*date of birth/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Register — \$252\.00/i })
    ).toBeDisabled();
  });

  it('requires card-on-file authorization for the installment plan', async () => {
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await screen.findByText(/Register — Thursday Morning/i);
    fillFamily();
    await acceptConsents(user);

    // Switch to the two-installment plan.
    await user.click(screen.getByRole('radio', { name: /Two installments/i }));

    const registerBtn = screen.getByRole('button', {
      name: /Register — \$132\.00/i,
    });
    // Still disabled — the card-on-file authorization hasn't been given.
    expect(registerBtn).toBeDisabled();

    await user.click(screen.getByLabelText(/I authorize Music Together/i));
    await waitFor(() => expect(registerBtn).toBeEnabled());
    await user.click(registerBtn);

    expect(await screen.findByText(/You're registered!/i)).toBeInTheDocument();
    // Confirmation surfaces the scheduled second installment.
    expect(screen.getByText(/\$132\.00 paid today/i)).toBeInTheDocument();
    expect(
      screen.getByText(/automatically charged for your remaining installment/i)
    ).toBeInTheDocument();

    expect(calls['createMusicTogetherRegistration']).toMatchObject({
      paymentPlan: 'installments',
      cardOnFileAuth: true,
      // The installment plan vaults a card on file — the widget must forward
      // the STORE-intent verifyBuyer token so real Square accepts the vault.
      cardVerificationToken: 'verf:test-token',
    });
  });

  it('keeps Register disabled until both consents are accepted', async () => {
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await screen.findByText(/Register — Thursday Morning/i);
    fillFamily();

    const registerBtn = screen.getByRole('button', {
      name: /Register — \$252\.00/i,
    });
    expect(registerBtn).toBeDisabled();

    // Accepting only the policies is not enough — privacy is also required.
    await user.click(screen.getByLabelText(/I have read and agree/i));
    expect(registerBtn).toBeDisabled();

    await user.click(
      screen.getByLabelText(/shared with Music Together Worldwide/i)
    );
    await waitFor(() => expect(registerBtn).toBeEnabled());
  });

  it('supports up to three children and hides Add at the cap', async () => {
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await screen.findByText(/Register — Thursday Morning/i);

    // Starts with one child; add two more to reach the cap of three.
    await user.click(
      screen.getByRole('button', { name: /Add another child/i })
    );
    expect(screen.getAllByLabelText(/Child's first name/i)).toHaveLength(2);

    await user.click(
      screen.getByRole('button', { name: /Add another child/i })
    );
    expect(screen.getAllByLabelText(/Child's first name/i)).toHaveLength(3);

    // At three children the Add button is gone.
    expect(
      screen.queryByRole('button', { name: /Add another child/i })
    ).not.toBeInTheDocument();
  });

  it('updates the family total with the sibling discount as children are added', async () => {
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await screen.findByText(/Register — Thursday Morning/i);

    // Complete the first child's row → one-child price on both plans.
    setField(/Child's first name/i, 'Sky');
    setField(/Date of birth/i, '2023-04-01');
    expect(
      await screen.findByRole('radio', { name: /Pay in full — \$252\.00/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /\$132\.00 now, \$132\.00 on/i })
    ).toBeInTheDocument();

    // Add a 2nd child and complete the row → 2-child price ($378 / $198).
    await user.click(
      screen.getByRole('button', { name: /Add another child/i })
    );
    let names = screen.getAllByLabelText(/Child's first name/i);
    let dobs = screen.getAllByLabelText(/Date of birth/i);
    fireEvent.change(names[1], { target: { value: 'River' } });
    fireEvent.change(dobs[1], { target: { value: '2024-05-02' } });

    expect(
      await screen.findByRole('radio', { name: /Pay in full — \$378\.00/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /\$198\.00 now, \$198\.00 on/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/first child full\s*price, 50% off each additional child/i)
    ).toBeInTheDocument();

    // Add a 3rd child and complete the row → 3-child price ($504 / $264).
    await user.click(
      screen.getByRole('button', { name: /Add another child/i })
    );
    names = screen.getAllByLabelText(/Child's first name/i);
    dobs = screen.getAllByLabelText(/Date of birth/i);
    fireEvent.change(names[2], { target: { value: 'Wren' } });
    fireEvent.change(dobs[2], { target: { value: '2025-06-03' } });

    expect(
      await screen.findByRole('radio', { name: /Pay in full — \$504\.00/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /\$264\.00 now, \$264\.00 on/i })
    ).toBeInTheDocument();
  });

  it('reflects the discounted multi-child total on the pay button', async () => {
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await screen.findByText(/Register — Thursday Morning/i);

    fillFamily();
    // Add a second child so the family is priced for two ($378 total).
    await user.click(
      screen.getByRole('button', { name: /Add another child/i })
    );
    const names = screen.getAllByLabelText(/Child's first name/i);
    const dobs = screen.getAllByLabelText(/Date of birth/i);
    fireEvent.change(names[1], { target: { value: 'River' } });
    fireEvent.change(dobs[1], { target: { value: '2024-05-02' } });
    await acceptConsents(user);

    // The pay button and the "today" line both show the discounted 2-child total.
    const registerBtn = await screen.findByRole('button', {
      name: /Register — \$378\.00/i,
    });
    await waitFor(() => expect(registerBtn).toBeEnabled());
    expect(screen.getByText(/Payment — \$378\.00 today/i)).toBeInTheDocument();
  });

  it('shows the waitlist when the section is full', async () => {
    nextSection = makeSection({ spotsRemaining: 0 });
    const user = userEvent.setup({ delay: null });
    renderWidget();

    expect(
      await screen.findByText(/is full \(8 families\)/i)
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Your name/i), 'Wait Family');
    await user.type(screen.getByLabelText(/^Email/i), 'wait@example.com');
    await user.type(
      screen.getByLabelText(/What days and times/i),
      'weekday mornings'
    );
    await user.click(
      screen.getByRole('button', { name: /Join the waitlist/i })
    );

    expect(
      await screen.findByText(/You're on the waitlist/i)
    ).toBeInTheDocument();
    expect(calls['addToMusicTogetherWaitlist']).toMatchObject({
      sectionId: 'sec-thu',
      name: 'Wait Family',
      email: 'wait@example.com',
      availability: 'weekday mornings',
    });
  });

  it('renders the email-only "coming soon" capture and never shows the checkout', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <MusicTogetherRegistrationWidget
        sectionId="sec-thu"
        squareAppId="sandbox-app"
        squareLocationId="LOC1"
        env="dev"
        policiesUrl="https://example.com/music-together/policies"
        comingSoon
      />
    );

    // The coming-soon heading + email field render; the section header stays.
    expect(await screen.findByText(/Coming soon!/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Thursday Morning — Mixed Age/i)
    ).toBeInTheDocument();

    // The full checkout / waitlist family-name fields are NOT rendered.
    expect(
      screen.queryByLabelText(/^First name/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Your name/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Register — \$/i })
    ).not.toBeInTheDocument();

    // Submitting captures the email into the waitlist with NO name.
    setField(/^Email/i, 'notify@example.com');
    await user.click(screen.getByRole('button', { name: /Notify me/i }));

    expect(
      await screen.findByText(/we'll email you at notify@example.com/i)
    ).toBeInTheDocument();
    expect(calls['addToMusicTogetherWaitlist']).toEqual({
      sectionId: 'sec-thu',
      email: 'notify@example.com',
    });
    expect(
      (calls['addToMusicTogetherWaitlist'] as { name?: string }).name
    ).toBeUndefined();
    // Square checkout was never invoked.
    expect(calls['createMusicTogetherRegistration']).toBeUndefined();
  });

  it('shows an "opens soon" notice instead of the form when enrollment is closed', async () => {
    nextSection = makeSection({
      enrollmentOpen: false,
      enrollmentOpensAt: '2026-10-01T13:00:00.000Z',
    });
    renderWidget();

    expect(
      await screen.findByText(/isn't open yet/i)
    ).toBeInTheDocument();
    // The registration form (Register button) must not render.
    expect(
      screen.queryByRole('button', { name: /Register — \$/i })
    ).not.toBeInTheDocument();
  });
  // ── Discount codes (#791 pilot half-off) ───────────────────────────────

  const PILOT_HALF_OFF = {
    id: 'disc-1',
    code: 'PILOTCLASS',
    description: 'Pilot semester — half off',
    type: 'percent',
    percent: 50,
    status: 'active',
    appliesTo: 'order',
    nthSlot: 1,
    usageLimit: null,
    usageCount: 0,
  };

  async function applyCode(
    user: ReturnType<typeof userEvent.setup>,
    code: string
  ) {
    setField(/Discount code/i, code);
    await user.click(screen.getByRole('button', { name: /^Apply$/i }));
  }

  it('halves every displayed amount when a 50% code is applied', async () => {
    nextDiscount = PILOT_HALF_OFF;
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await screen.findByText(/Register — Thursday Morning/i);

    setField(/Child's first name/i, 'Sky');
    setField(/Date of birth/i, '2023-04-01');
    // Baseline, before the code.
    expect(
      await screen.findByRole('radio', { name: /Pay in full — \$252\.00/i })
    ).toBeInTheDocument();

    await applyCode(user, 'pilotclass');

    // Pay-in-full halves, and so does EACH installment — including the one
    // that becomes the scheduled Week-5 charge. That is the whole promise.
    expect(
      await screen.findByRole('radio', {
        name: /Pay in full — \$126\.00 \(was \$252\.00\)/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', {
        name: /\$66\.00 now, \$66\.00 on .*\(was \$132\.00 each\)/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/including the second installment/i)
    ).toBeInTheDocument();
  });

  it('sends the applied code to the server, which reprices authoritatively', async () => {
    nextDiscount = PILOT_HALF_OFF;
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await screen.findByText(/Register — Thursday Morning/i);

    fillFamily();
    await applyCode(user, 'PILOTCLASS');
    await acceptConsents(user);

    const registerBtn = await screen.findByRole('button', {
      name: /Register — \$126\.00/i,
    });
    await waitFor(() => expect(registerBtn).toBeEnabled());
    await user.click(registerBtn);

    await waitFor(() =>
      expect(calls['createMusicTogetherRegistration']).toBeTruthy()
    );
    expect(calls['createMusicTogetherRegistration']).toMatchObject({
      discountCode: 'PILOTCLASS',
    });
  });

  it('stacks with the sibling discount', async () => {
    nextDiscount = PILOT_HALF_OFF;
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await screen.findByText(/Register — Thursday Morning/i);

    setField(/Child's first name/i, 'Sky');
    setField(/Date of birth/i, '2023-04-01');
    await user.click(
      screen.getByRole('button', { name: /Add another child/i })
    );
    const names = screen.getAllByLabelText(/Child's first name/i);
    const dobs = screen.getAllByLabelText(/Date of birth/i);
    fireEvent.change(names[1], { target: { value: 'River' } });
    fireEvent.change(dobs[1], { target: { value: '2024-05-02' } });

    await applyCode(user, 'PILOTCLASS');

    // 2 children = $378, then half off = $189.
    expect(
      await screen.findByRole('radio', { name: /Pay in full — \$189\.00/i })
    ).toBeInTheDocument();
  });

  it('rejects an unknown code and leaves the price alone', async () => {
    nextDiscount = undefined;
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await screen.findByText(/Register — Thursday Morning/i);

    await applyCode(user, 'NOPE');

    expect(await screen.findByText(/isn't a valid code/i)).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /Pay in full — \$252\.00/i })
    ).toBeInTheDocument();
  });

  it('refuses a slot-scoped M&S code rather than showing an unchanged total', async () => {
    nextDiscount = { ...PILOT_HALF_OFF, appliesTo: 'nth-slot-onward', nthSlot: 2 };
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await screen.findByText(/Register — Thursday Morning/i);

    await applyCode(user, 'SECONDSLOT');

    expect(
      await screen.findByText(/can't be used for Music Together/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /Pay in full — \$252\.00/i })
    ).toBeInTheDocument();
  });

  it('restores full price when the code is removed', async () => {
    nextDiscount = PILOT_HALF_OFF;
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await screen.findByText(/Register — Thursday Morning/i);

    await applyCode(user, 'PILOTCLASS');
    expect(
      await screen.findByRole('radio', { name: /Pay in full — \$126\.00/i })
    ).toBeInTheDocument();

    // The applied chip's delete affordance clears it.
    await user.click(screen.getByTestId('CancelIcon'));

    expect(
      await screen.findByRole('radio', { name: /Pay in full — \$252\.00/i })
    ).toBeInTheDocument();
  });
});
