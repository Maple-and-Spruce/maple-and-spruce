// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import type { PublicClass } from '@maple/ts/domain';
import type {
  CalculateRegistrationCostResponse,
  CreateRegistrationResponse,
} from '@maple/ts/firebase/api-types';

// Mock SquareCardForm — the real one loads Square's Web Payments SDK
// from a CDN, which isn't available in jsdom. We emulate the minimum
// surface the parent depends on: signalling ready, exposing a tokenize
// function, and rendering afterCardContent (which contains the button).
vi.mock('./SquareCardForm', () => ({
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
      onTokenizeRef(() => Promise.resolve('test-nonce'));
      onReady?.();
    }, [onReady, onTokenizeRef]);
    return <div data-testid="mock-square-form">{afterCardContent}</div>;
  },
}));

import { RegistrationCheckoutForm } from './RegistrationCheckoutForm';

const mockPublicClass = {
  id: 'class-1',
  name: 'Test Class',
  description: 'Test description',
  sessions: [{ dateTime: '2099-06-15T14:00:00.000Z' }],
  durationMinutes: 60,
  capacity: 10,
  spotsRemaining: 5,
  priceCents: 5000,
  skillLevel: 'All Levels',
} as unknown as PublicClass;

const mockCostResponse: CalculateRegistrationCostResponse = {
  originalCostCents: 5000,
  discountAmountCents: 0,
  finalCostCents: 5000,
  taxRatePercent: 0,
  taxAmountCents: 0,
  totalCents: 5000,
};

const mockRegistrationResponse = {
  registration: { pricePaidCents: 5000 },
  confirmationNumber: 'CONF123',
} as unknown as CreateRegistrationResponse;

describe('RegistrationCheckoutForm submit flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables the Register button immediately on click and ignores repeat clicks while the backend is cold-starting', async () => {
    const user = userEvent.setup();

    // Simulate a cold-starting cloud function: the promise stays pending
    // until we manually resolve it. Without the fix, an impatient user's
    // second click in this window triggers a second charge.
    let resolveSubmit!: (value: CreateRegistrationResponse) => void;
    const slowSubmit = vi.fn(
      () =>
        new Promise<CreateRegistrationResponse>((resolve) => {
          resolveSubmit = resolve;
        })
    );
    const onCalculateCost = vi.fn().mockResolvedValue(mockCostResponse);
    const onSuccess = vi.fn();

    render(
      <RegistrationCheckoutForm
        publicClass={mockPublicClass}
        squareApplicationId="test-app"
        squareLocationId="test-loc"
        onCalculateCost={onCalculateCost}
        onSubmit={slowSubmit}
        onSuccess={onSuccess}
      />
    );

    const registerButton = await screen.findByRole('button', {
      name: /Register & Pay/,
    });
    await waitFor(() => expect(registerButton).toBeEnabled());

    fireEvent.change(screen.getByLabelText(/Full Name/), {
      target: { value: 'Jane Doe' },
    });
    fireEvent.change(screen.getByLabelText(/Email Address/), {
      target: { value: 'jane@example.com' },
    });

    await user.click(registerButton);

    // Immediately after click the button flips to the loading state,
    // before the cold-start onSubmit has resolved.
    const processingButton = screen.getByRole('button', { name: /Processing/ });
    expect(processingButton).toBeDisabled();
    expect(slowSubmit).toHaveBeenCalledTimes(1);

    // Impatient user keeps clicking while the cold start is pending —
    // both through userEvent (respects disabled) and fireEvent (doesn't).
    await user.click(processingButton);
    fireEvent.click(processingButton);
    fireEvent.click(processingButton);
    fireEvent.click(processingButton);

    // Backend was only called once despite repeat clicks.
    expect(slowSubmit).toHaveBeenCalledTimes(1);
    expect(processingButton).toBeDisabled();

    // Cold start finally responds.
    await act(async () => {
      resolveSubmit(mockRegistrationResponse);
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalledWith({
      confirmationNumber: 'CONF123',
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      pricePaidCents: 5000,
      quantity: 1,
    });
    expect(slowSubmit).toHaveBeenCalledTimes(1);
  });
});
