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
    status: 'open',
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
    onTokenizeRef: (fn: () => Promise<string>) => void;
    afterCardContent?: React.ReactNode;
  }) => {
    useEffect(() => {
      onTokenizeRef(async () => 'cnon:test-nonce');
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

/** Fill every required family field so the Register button can enable. */
async function fillFamily(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^First name/i), 'Jane');
  await user.type(screen.getByLabelText(/^Last name/i), 'Doe');
  await user.type(screen.getByLabelText(/Child's first name/i), 'Baby Doe');
  fireEvent.change(screen.getByLabelText(/Date of birth/i), {
    target: { value: '2024-03-15' },
  });
  await user.type(screen.getByLabelText(/^Email/i), 'jane@example.com');
  await user.type(screen.getByLabelText(/^Phone/i), '304-555-0100');
  await user.type(screen.getByLabelText(/Full mailing address/i), '1 Main St');
}

/** Check both required consent boxes (policies + privacy notice). */
async function acceptConsents(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText(/I have read and agree/i));
  await user.click(screen.getByLabelText(/shared with Music Together Worldwide/i));
}

describe('MusicTogetherRegistrationWidget', () => {
  beforeEach(() => {
    nextSection = makeSection();
    for (const k of Object.keys(calls)) delete calls[k];
  });
  afterEach(() => cleanup());

  it('registers a family paying in full', async () => {
    const user = userEvent.setup();
    renderWidget();

    // Section header renders once loaded.
    expect(
      await screen.findByText(/Register — Thursday Morning/i)
    ).toBeInTheDocument();

    await fillFamily(user);
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
    const user = userEvent.setup();
    renderWidget();
    await screen.findByText(/Register — Thursday Morning/i);

    // Fill everything EXCEPT the child's date of birth, and accept both
    // consents — so the only thing missing is the DOB (easiest to overlook).
    await user.type(screen.getByLabelText(/^First name/i), 'Jane');
    await user.type(screen.getByLabelText(/^Last name/i), 'Doe');
    await user.type(screen.getByLabelText(/Child's first name/i), 'Baby Doe');
    await user.type(screen.getByLabelText(/^Email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/^Phone/i), '304-555-0100');
    await user.type(screen.getByLabelText(/Full mailing address/i), '1 Main St');
    await acceptConsents(user);

    expect(
      await screen.findByText(/Still needed:.*date of birth/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Register — \$252\.00/i })
    ).toBeDisabled();
  });

  it('requires card-on-file authorization for the installment plan', async () => {
    const user = userEvent.setup();
    renderWidget();
    await screen.findByText(/Register — Thursday Morning/i);
    await fillFamily(user);
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
    });
  });

  it('keeps Register disabled until both consents are accepted', async () => {
    const user = userEvent.setup();
    renderWidget();
    await screen.findByText(/Register — Thursday Morning/i);
    await fillFamily(user);

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
    const user = userEvent.setup();
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

  it('shows the waitlist when the section is full', async () => {
    nextSection = makeSection({ spotsRemaining: 0 });
    const user = userEvent.setup();
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
});
