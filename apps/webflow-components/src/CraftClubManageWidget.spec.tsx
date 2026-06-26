// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';

const calls: Record<string, unknown> = {};
// Per-test overrides for the session's member status.
let sessionMember = {
  email: 'm@e.com',
  status: 'active',
  currentPeriodEndsAt: '2026-07-26',
};

vi.mock('./firebase-init', () => ({
  getWidgetFunctions: () => ({ __mock: true }),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string) => (payload: unknown) => {
    calls[name] = payload;
    switch (name) {
      case 'startCraftClubSession':
        return Promise.resolve({
          data: { sessionToken: 'sess-1', member: sessionMember },
        });
      case 'requestCraftClubManageLink':
        return Promise.resolve({ data: { ok: true } });
      case 'cancelCraftClubSubscription':
        return Promise.resolve({
          data: { member: { ...sessionMember, status: 'cancelled' } },
        });
      case 'updateCraftClubPaymentMethod':
        return Promise.resolve({
          data: { member: sessionMember, cardLast4: '4242' },
        });
      default:
        return Promise.resolve({ data: {} });
    }
  },
}));

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
      onTokenizeRef(async () => 'cnon:new-card');
      onReady?.();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="mock-card-form">{afterCardContent}</div>;
  },
}));

import { CraftClubManageWidget } from './CraftClubManageWidget';

function renderWidget(token?: string) {
  return render(
    <CraftClubManageWidget
      squareAppId="sandbox-app"
      squareLocationId="LOC1"
      env="dev"
      token={token}
    />
  );
}

describe('CraftClubManageWidget', () => {
  beforeEach(() => {
    for (const k of Object.keys(calls)) delete calls[k];
    sessionMember = {
      email: 'm@e.com',
      status: 'active',
      currentPeriodEndsAt: '2026-07-26',
    };
  });
  afterEach(() => cleanup());

  it('without a token, emails a management link', async () => {
    const user = userEvent.setup();
    renderWidget(undefined);

    await user.type(screen.getByLabelText(/Email/i), 'm@e.com');
    await user.click(screen.getByRole('button', { name: /Email me a link/i }));

    expect(await screen.findByText(/on its way/i)).toBeInTheDocument();
    expect(calls['requestCraftClubManageLink']).toMatchObject({ email: 'm@e.com' });
  });

  it('with a token, shows active status and cancels on request', async () => {
    const user = userEvent.setup();
    renderWidget('magic-token');

    expect(
      await screen.findByText(/membership is active/i)
    ).toBeInTheDocument();
    expect(calls['startCraftClubSession']).toMatchObject({ token: 'magic-token' });

    await user.click(
      screen.getByRole('button', { name: /Cancel membership/i })
    );

    expect(
      await screen.findByText(/membership is cancelled/i)
    ).toBeInTheDocument();
    expect(calls['cancelCraftClubSubscription']).toMatchObject({
      sessionToken: 'sess-1',
    });
  });

  it('with a token, changes the payment method', async () => {
    const user = userEvent.setup();
    renderWidget('magic-token');

    await screen.findByText(/membership is active/i);
    await user.click(
      screen.getByRole('button', { name: /Change payment method/i })
    );

    const saveBtn = await screen.findByRole('button', {
      name: /Save new card/i,
    });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    await waitFor(() =>
      expect(calls['updateCraftClubPaymentMethod']).toMatchObject({
        sessionToken: 'sess-1',
        paymentNonce: 'cnon:new-card',
      })
    );
  });
});
