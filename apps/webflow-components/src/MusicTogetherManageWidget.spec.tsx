// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';

const calls: Record<string, unknown> = {};

const sessionRegistration = {
  registrationId: 'reg-1',
  sectionName: 'Fall Babies',
  parentName: 'Ada',
  nextInstallment: {
    amountCents: 9500,
    amountLabel: '$95.00',
    dueAt: '2026-09-15T13:00:00.000Z',
    dueLabel: 'September 15, 2026',
    status: 'scheduled',
  },
};

vi.mock('./firebase-init', () => ({
  getWidgetFunctions: () => ({ __mock: true }),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string) => (payload: unknown) => {
    calls[name] = payload;
    switch (name) {
      case 'startMusicTogetherManageSession':
        return Promise.resolve({
          data: { sessionToken: 'sess-1', registration: sessionRegistration },
        });
      case 'requestMusicTogetherManageLink':
        return Promise.resolve({ data: { ok: true } });
      case 'updateMusicTogetherPaymentMethod':
        return Promise.resolve({
          data: { registration: sessionRegistration, cardLast4: '4242' },
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

import { MusicTogetherManageWidget } from './MusicTogetherManageWidget';

function renderWidget(token?: string) {
  return render(
    <MusicTogetherManageWidget
      squareAppId="sandbox-app"
      squareLocationId="LOC1"
      env="dev"
      token={token}
    />
  );
}

describe('MusicTogetherManageWidget', () => {
  beforeEach(() => {
    for (const k of Object.keys(calls)) delete calls[k];
  });
  afterEach(() => cleanup());

  it('without a token, emails an update link', async () => {
    const user = userEvent.setup();
    renderWidget(undefined);

    await user.type(screen.getByLabelText(/Email/i), 'family@e.com');
    await user.click(screen.getByRole('button', { name: /Email me a link/i }));

    expect(await screen.findByText(/on its way/i)).toBeInTheDocument();
    expect(calls['requestMusicTogetherManageLink']).toMatchObject({
      email: 'family@e.com',
    });
  });

  it('with a token, exchanges it and updates the card on file', async () => {
    const user = userEvent.setup();
    renderWidget('magic-token');

    // Context about which installment the new card will cover.
    expect(await screen.findByText(/Fall Babies/)).toBeInTheDocument();
    expect(calls['startMusicTogetherManageSession']).toMatchObject({
      token: 'magic-token',
    });

    const saveBtn = await screen.findByRole('button', {
      name: /Save new card/i,
    });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    await waitFor(() =>
      expect(calls['updateMusicTogetherPaymentMethod']).toMatchObject({
        sessionToken: 'sess-1',
        paymentNonce: 'cnon:new-card',
      })
    );
    expect(await screen.findByText(/card was updated/i)).toBeInTheDocument();
    expect(screen.getByText(/ending 4242/i)).toBeInTheDocument();
  });
});
