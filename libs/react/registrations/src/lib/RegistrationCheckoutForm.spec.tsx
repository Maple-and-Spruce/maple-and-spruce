// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import type { PublicClass } from '@maple/ts/domain';
import type {
  CalculateRegistrationCostResponse,
  CreateRegistrationResponse,
} from '@maple/ts/firebase/api-types';

// Mock @maple/react/agreements — SigningForm depends on signature_pad
// which isn't available in jsdom. This mock renders a "Sign" button that
// calls onSubmit with minimal valid data so we can simulate signing.
vi.mock('@maple/react/agreements', () => ({
  SigningForm: ({
    onSubmit,
    templateName,
  }: {
    onSubmit: (data: Record<string, unknown>) => Promise<void>;
    templateName: string;
  }) => (
    <div data-testid="mock-signing-form">
      <span>{templateName}</span>
      <button
        data-testid={`sign-agreement-${templateName}`}
        onClick={() =>
          onSubmit({
            signatureData: 'data:image/png;base64,mock',
            printedName: 'Jane Doe',
            isMinor: false,
          })
        }
      >
        Sign {templateName}
      </button>
    </div>
  ),
}));

// Capture the onDigitalWalletToken callback so tests can simulate
// Google Pay / Apple Pay token events from outside the component.
let capturedDigitalWalletTokenCallback: ((token: string) => void) | undefined;

// Mock SquareCardForm — the real one loads Square's Web Payments SDK
// from a CDN, which isn't available in jsdom. We emulate the minimum
// surface the parent depends on: signalling ready, exposing a tokenize
// function, and rendering afterCardContent (which contains the button).
vi.mock('./SquareCardForm', () => ({
  SquareCardForm: ({
    onReady,
    onTokenizeRef,
    onDigitalWalletToken,
    afterCardContent,
  }: {
    onReady?: () => void;
    onTokenizeRef: (fn: () => Promise<string>) => void;
    onDigitalWalletToken?: (token: string) => void;
    afterCardContent?: React.ReactNode;
  }) => {
    useEffect(() => {
      onTokenizeRef(() => Promise.resolve('test-nonce'));
      onReady?.();
    }, [onReady, onTokenizeRef]);
    useEffect(() => {
      capturedDigitalWalletTokenCallback = onDigitalWalletToken;
    }, [onDigitalWalletToken]);
    return <div data-testid="mock-square-form">{afterCardContent}</div>;
  },
}));

import {
  RegistrationCheckoutForm,
  RequiredAgreementTemplate,
} from './RegistrationCheckoutForm';

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

  // @testing-library/react v13+ auto-registers cleanup only when Vitest
  // globals are enabled. This spec runs under both the project config
  // (globals: true) and the repo-root config during CI coverage runs
  // (globals: false). Explicit cleanup keeps tests isolated under either.
  afterEach(() => {
    cleanup();
  });

  it('blocks submit and surfaces validation errors when the form is empty', async () => {
    const user = userEvent.setup();

    const onSubmit = vi.fn();
    const onCalculateCost = vi.fn().mockResolvedValue(mockCostResponse);
    const onSuccess = vi.fn();

    render(
      <RegistrationCheckoutForm
        publicClass={mockPublicClass}
        squareApplicationId="test-app"
        squareLocationId="test-loc"
        onCalculateCost={onCalculateCost}
        onSubmit={onSubmit}
        onSuccess={onSuccess}
      />
    );

    const registerButton = await screen.findByRole('button', {
      name: /Register & Pay/,
    });
    await waitFor(() => expect(registerButton).toBeEnabled());

    // Submit without filling anything — the Vest suite should reject.
    await user.click(registerButton);

    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    });

    // Backend must not be called.
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('blocks submit on an invalid email and lets it through once corrected', async () => {
    const user = userEvent.setup();

    const onSubmit = vi.fn().mockResolvedValue(mockRegistrationResponse);
    const onCalculateCost = vi.fn().mockResolvedValue(mockCostResponse);
    const onSuccess = vi.fn();

    render(
      <RegistrationCheckoutForm
        publicClass={mockPublicClass}
        squareApplicationId="test-app"
        squareLocationId="test-loc"
        onCalculateCost={onCalculateCost}
        onSubmit={onSubmit}
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
      target: { value: 'not-an-email' },
    });

    await user.click(registerButton);

    await waitFor(() => {
      expect(
        screen.getByText(/email must be a valid email address/i)
      ).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();

    // Fix the email and resubmit — it should now pass.
    fireEvent.change(screen.getByLabelText(/Email Address/), {
      target: { value: 'jane@example.com' },
    });

    await user.click(registerButton);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
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

// ============================================================
// Digital wallet + agreement signing
// ============================================================

const mockAgreement: RequiredAgreementTemplate = {
  templateId: 'tmpl-1',
  templateName: 'Class Waiver',
  sections: [
    {
      type: 'text',
      title: 'Liability Waiver',
      content: 'You agree to the terms.',
    },
  ] as RequiredAgreementTemplate['sections'],
  supportsMinor: false,
};

describe('RegistrationCheckoutForm — digital wallet + agreements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedDigitalWalletTokenCallback = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  function renderWithAgreements(overrides: {
    onSubmit?: ReturnType<typeof vi.fn>;
    onSuccess?: ReturnType<typeof vi.fn>;
  } = {}) {
    const onSubmit =
      overrides.onSubmit ??
      vi.fn().mockResolvedValue(mockRegistrationResponse);
    const onCalculateCost = vi.fn().mockResolvedValue(mockCostResponse);
    const onSuccess = overrides.onSuccess ?? vi.fn();

    render(
      <RegistrationCheckoutForm
        publicClass={mockPublicClass}
        squareApplicationId="test-app"
        squareLocationId="test-loc"
        applePayCheckoutUrl="https://business.example.com/apple-pay-checkout"
        requiredAgreements={[mockAgreement]}
        onCalculateCost={onCalculateCost}
        onSubmit={onSubmit}
        onSuccess={onSuccess}
      />
    );

    return { onSubmit, onSuccess };
  }

  async function fillCustomerInfo() {
    fireEvent.change(screen.getByLabelText(/Full Name/), {
      target: { value: 'Jane Doe' },
    });
    fireEvent.change(screen.getByLabelText(/Email Address/), {
      target: { value: 'jane@example.com' },
    });
  }

  it('blocks digital wallet token when agreements are unsigned', async () => {
    const { onSubmit } = renderWithAgreements();

    // Wait for Square form to initialise and capture callback
    await waitFor(() => expect(capturedDigitalWalletTokenCallback).toBeDefined());

    await fillCustomerInfo();

    // Simulate Google Pay returning a token while agreement is unsigned
    await act(async () => {
      capturedDigitalWalletTokenCallback!('google-pay-nonce');
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('allows digital wallet token after agreements are signed', async () => {
    const { onSubmit, onSuccess } = renderWithAgreements();

    await waitFor(() => expect(capturedDigitalWalletTokenCallback).toBeDefined());

    await fillCustomerInfo();

    // Sign the agreement via the mock SigningForm button
    const signButton = screen.getByTestId('sign-agreement-Class Waiver');
    await act(async () => {
      fireEvent.click(signButton);
    });

    // Agreement should now show as signed
    await waitFor(() => {
      expect(screen.getByText(/Class Waiver — Signed/)).toBeInTheDocument();
    });

    // Now the digital wallet token should go through
    await act(async () => {
      capturedDigitalWalletTokenCallback!('google-pay-nonce');
    });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentNonce: 'google-pay-nonce',
        agreements: expect.arrayContaining([
          expect.objectContaining({ templateId: 'tmpl-1' }),
        ]),
      })
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('disables the Register & Pay button when agreements are unsigned', async () => {
    renderWithAgreements();

    const registerButton = await screen.findByRole('button', {
      name: /Register & Pay/,
    });

    // Button should be disabled because agreement isn't signed
    await waitFor(() => expect(registerButton).toBeDisabled());

    // Sign the agreement
    const signButton = screen.getByTestId('sign-agreement-Class Waiver');
    await act(async () => {
      fireEvent.click(signButton);
    });

    await waitFor(() => expect(registerButton).toBeEnabled());
  });
});
