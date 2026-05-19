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

// Allow individual tests to override how the mocked tokenize function
// behaves (e.g. to keep the promise pending and simulate Square's SDK
// taking a moment to produce a nonce). Default is an instant resolve.
let mockTokenizeImpl: () => Promise<string> = () =>
  Promise.resolve('test-nonce');

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
      onTokenizeRef(() => mockTokenizeImpl());
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

// Each test that exercises the add/remove attendee path patches
// onCalculateCost to return a per-call response that echoes back the
// quantity it was called with — the new server-truth contract — so
// the CostSummary line item ("N x $price") reflects what the server
// actually priced rather than a locally-derived count.
function makeCostResponse(
  quantity: number,
  pricePerItemCents = 5000
): CalculateRegistrationCostResponse {
  return {
    quantity,
    pricePerItemCents,
    originalCostCents: pricePerItemCents * quantity,
    discountAmountCents: 0,
    finalCostCents: pricePerItemCents * quantity,
    taxRatePercent: 0,
    taxAmountCents: 0,
    totalCents: pricePerItemCents * quantity,
  };
}

const mockCostResponse: CalculateRegistrationCostResponse = makeCostResponse(1);

const mockRegistrationResponse = {
  registration: { pricePaidCents: 5000 },
  confirmationNumber: 'CONF123',
} as unknown as CreateRegistrationResponse;

describe('RegistrationCheckoutForm submit flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTokenizeImpl = () => Promise.resolve('test-nonce');
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

  it('flips the Register button to its loading state while Square tokenization is still pending', async () => {
    const user = userEvent.setup();

    // Square's tokenize call is the first await in the click handler. Hold
    // its promise pending so we can observe the button state *before* the
    // backend onSubmit is ever reached.
    let resolveTokenize!: (nonce: string) => void;
    mockTokenizeImpl = () =>
      new Promise<string>((resolve) => {
        resolveTokenize = resolve;
      });

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
      target: { value: 'jane@example.com' },
    });

    await user.click(registerButton);

    // While tokenize is still pending, the button must already show its
    // loading state — that's the regression this test guards against.
    const processingButton = await screen.findByRole('button', {
      name: /Processing/,
    });
    expect(processingButton).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();

    // Resolve tokenize → onSubmit runs → onSuccess fires.
    await act(async () => {
      resolveTokenize('square-nonce');
    });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ paymentNonce: 'square-nonce' })
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('restores the Register button to its default state when the backend call fails', async () => {
    const user = userEvent.setup();

    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error('Payment declined by issuer'));
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
      target: { value: 'jane@example.com' },
    });

    await user.click(registerButton);

    // After the rejection, the button must flip back from "Processing..."
    // to its default label so the user can correct + retry.
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Register & Pay/ })
      ).toBeEnabled();
    });
    expect(screen.getByText(/Payment declined by issuer/)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
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

// ============================================================
// Quantity recalculation when attendees are added / removed
//
// Regression: PR #417 introduced a multi-attendee flow that called
// `calculateCost(quantity.value + 1)` after pushing a new attendee
// into the signal. Because `quantity` is a computed of
// `additionalAttendees.length + 1`, reading it after the write
// already reflects the new total — the +1 double-counted and the
// backend returned cost for N+1 people while the UI displayed N.
// Customers were overcharged by one ticket. These tests lock in
// the corrected behaviour.
// ============================================================
describe('RegistrationCheckoutForm — attendee quantity recalculation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('recalculates cost with the new total (not total+1) when an attendee is added', async () => {
    const user = userEvent.setup();

    const onCalculateCost = vi
      .fn()
      .mockImplementation(async (_classId: string, qty: number) =>
        makeCostResponse(qty)
      );

    render(
      <RegistrationCheckoutForm
        publicClass={mockPublicClass}
        squareApplicationId="test-app"
        squareLocationId="test-loc"
        onCalculateCost={onCalculateCost}
        onSubmit={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    // Initial mount fires onCalculateCost with quantity 1.
    await waitFor(() =>
      expect(onCalculateCost).toHaveBeenCalledWith('class-1', 1, undefined)
    );

    await user.click(
      screen.getByRole('button', { name: /Add another person/ })
    );

    // Adding one attendee → 2 people total, not 3.
    await waitFor(() =>
      expect(onCalculateCost).toHaveBeenLastCalledWith('class-1', 2, undefined)
    );
    // And the user-visible cost summary line item reflects that.
    expect(screen.getByText(/2 x \$50\.00/)).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /Add another person/ })
    );

    // Adding a second attendee → 3 people total, not 4.
    await waitFor(() =>
      expect(onCalculateCost).toHaveBeenLastCalledWith('class-1', 3, undefined)
    );
    await waitFor(() =>
      expect(screen.getByText(/3 x \$50\.00/)).toBeInTheDocument()
    );
  });

  it('recalculates cost with the new total (not total-1) when an attendee is removed', async () => {
    const user = userEvent.setup();

    const onCalculateCost = vi
      .fn()
      .mockImplementation(async (_classId: string, qty: number) =>
        makeCostResponse(qty)
      );

    render(
      <RegistrationCheckoutForm
        publicClass={mockPublicClass}
        squareApplicationId="test-app"
        squareLocationId="test-loc"
        onCalculateCost={onCalculateCost}
        onSubmit={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() =>
      expect(onCalculateCost).toHaveBeenCalledWith('class-1', 1, undefined)
    );

    // Add two attendees so we can remove one.
    await user.click(
      screen.getByRole('button', { name: /Add another person/ })
    );
    await user.click(
      screen.getByRole('button', { name: /Add another person/ })
    );
    await waitFor(() =>
      expect(onCalculateCost).toHaveBeenLastCalledWith('class-1', 3, undefined)
    );

    // Remove the first attendee → 2 people total, not 1.
    await user.click(
      screen.getByRole('button', { name: /Remove additional person 1/ })
    );
    await waitFor(() =>
      expect(onCalculateCost).toHaveBeenLastCalledWith('class-1', 2, undefined)
    );
    await waitFor(() =>
      expect(screen.getByText(/2 x \$50\.00/)).toBeInTheDocument()
    );
  });

  it('renders the cost summary line item from the server response, not from local state', async () => {
    // Source-of-truth contract: even if the server priced a different
    // quantity than the UI thinks it asked for, the cost summary
    // displays what the server said. This is the structural guarantee
    // that prevents the line-item / totals divergence from #423.
    const onCalculateCost = vi.fn().mockResolvedValue({
      quantity: 7,
      pricePerItemCents: 1234,
      originalCostCents: 8638,
      discountAmountCents: 0,
      finalCostCents: 8638,
      taxRatePercent: 0,
      taxAmountCents: 0,
      totalCents: 8638,
    } satisfies CalculateRegistrationCostResponse);

    render(
      <RegistrationCheckoutForm
        publicClass={mockPublicClass}
        squareApplicationId="test-app"
        squareLocationId="test-loc"
        onCalculateCost={onCalculateCost}
        onSubmit={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    // Backend was asked for qty=1, but it (hypothetically) returned
    // qty=7 / $12.34 ea. The UI must render the server's numbers —
    // the line-item multiplier and per-item price come straight from
    // the response object.
    await waitFor(() => {
      expect(screen.getByText(/7 x \$12\.34/)).toBeInTheDocument();
    });
    // $86.38 appears in originalCost line, Total line, AND the Pay
    // button label — use getAllByText since we only need to confirm
    // the value is present, not that it's unique.
    expect(screen.getAllByText(/\$86\.38/).length).toBeGreaterThanOrEqual(2);
  });
});
