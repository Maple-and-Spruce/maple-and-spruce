// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';

// Canned eligibility response for the next checkCraftClubEligibility call.
let nextEligibility: { status: string; alreadyMember: boolean } = {
  status: 'unknown',
  alreadyMember: false,
};
// Records the last payload sent to each callable, by name.
const calls: Record<string, unknown> = {};

vi.mock('./firebase-init', () => ({
  getWidgetFunctions: () => ({ __mock: true }),
}));

vi.mock('./lib/warmup', () => ({ warmup: vi.fn() }));

vi.mock('firebase/functions', () => ({
  httpsCallable:
    (_fns: unknown, name: string) => (payload: unknown) => {
      calls[name] = payload;
      if (name === 'checkCraftClubEligibility') {
        return Promise.resolve({ data: nextEligibility });
      }
      if (name === 'createCraftClubSubscription') {
        return Promise.resolve({
          data: { member: { id: 'm1' }, cardLast4: '1111' },
        });
      }
      if (name === 'requestCraftClubAccess') {
        return Promise.resolve({ data: { status: 'requested' } });
      }
      return Promise.resolve({ data: {} });
    },
}));

// Stub the Square card form: immediately ready, with a fake tokenizer, and
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

import { CraftClubSignupWidget } from './CraftClubSignupWidget';

function renderWidget() {
  return render(
    <CraftClubSignupWidget
      squareAppId="sandbox-app"
      squareLocationId="LOC1"
      env="dev"
      manageUrl="https://example.com/manage"
    />
  );
}

async function enterEmailAndContinue(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/Email/i), email);
  await user.click(screen.getByRole('button', { name: /Continue/i }));
  return user;
}

describe('CraftClubSignupWidget', () => {
  beforeEach(() => {
    for (const k of Object.keys(calls)) delete calls[k];
  });
  afterEach(() => cleanup());

  it('shows the request-access form for an unknown email and submits it', async () => {
    nextEligibility = { status: 'unknown', alreadyMember: false };
    const user = await renderAndContinue('nobody@example.com');

    expect(
      await screen.findByText(/isn't on the approved list/i)
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /Request access/i })
    );

    expect(
      await screen.findByText(/pending approval/i)
    ).toBeInTheDocument();
    expect(calls['requestCraftClubAccess']).toMatchObject({
      email: 'nobody@example.com',
    });
  });

  it('lets an approved member subscribe', async () => {
    nextEligibility = { status: 'approved', alreadyMember: false };
    const user = await renderAndContinue('approved@example.com');

    // Name is required before the subscribe button enables.
    await user.type(screen.getByLabelText(/Full name/i), 'Ada Lovelace');

    const subscribeBtn = await screen.findByRole('button', {
      name: /Subscribe/i,
    });
    await waitFor(() => expect(subscribeBtn).toBeEnabled());
    await user.click(subscribeBtn);

    expect(await screen.findByText(/You're in!/i)).toBeInTheDocument();
    expect(calls['createCraftClubSubscription']).toMatchObject({
      email: 'approved@example.com',
      name: 'Ada Lovelace',
      paymentNonce: 'cnon:test-nonce',
    });
  });

  it('points an existing member to the manage page', async () => {
    nextEligibility = { status: 'active', alreadyMember: true };
    await renderAndContinue('member@example.com');

    expect(
      await screen.findByText(/already have an active Craft Club/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Manage your membership/i })
    ).toHaveAttribute('href', 'https://example.com/manage');
  });
});

async function renderAndContinue(email: string) {
  renderWidget();
  return enterEmailAndContinue(email);
}
