// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PublicClass } from '@maple/ts/domain';
import { RegistrationWidget } from './RegistrationWidget';

/**
 * Registration closes at the class's cutoff, on the page as on the server.
 *
 * The server refuses to price a booking once `registrationClosesAt` (or, with
 * no override, the first session's start) has passed. Before this, the widget
 * decided from seats alone, so on a class's own day it offered the whole form
 * and the visitor only found out at payment.
 */

const START = '2026-11-09T23:00:00.000Z';
const START_MS = new Date(START).getTime();

function makeClass(overrides: Partial<PublicClass> = {}): PublicClass {
  return {
    id: 'class-closing',
    name: 'Stained Glass Ornaments',
    slug: 'stained-glass-ornaments',
    description: 'Cut, foil and solder ornaments to take home.',
    sessions: [{ dateTime: START }],
    durationMinutes: 180,
    capacity: 8,
    spotsRemaining: 1,
    priceCents: 6000,
    skillLevel: 'all-levels',
    ...overrides,
  };
}

let nextClass: PublicClass = makeClass();
const calledRoutes: string[] = [];

vi.mock('./firebase-init', () => ({
  getWidgetFunctions: () => ({ __mock: true }),
  routeCallable: (_fns: never, _router: string, route: string) => () => {
    calledRoutes.push(route);
    if (route === 'getPublicClass') {
      return Promise.resolve({ data: { class: nextClass } });
    }
    if (route === 'getRequiredAgreementsForClass') {
      return Promise.resolve({ data: { agreements: [] } });
    }
    return Promise.reject(new Error(`unexpected route ${route}`));
  },
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string) => () => {
    calledRoutes.push(name);
    return Promise.resolve({ data: { added: true } });
  },
}));

vi.mock('./lib/warmup', () => ({ warmup: vi.fn() }));

// The real form loads the Square SDK. Its only job here is to say it rendered;
// a real form would call `onCalculateCost` on mount, so the stub does too.
vi.mock('@maple/react/registrations', async () => ({
  // The real hint: it is what the waitlist form's typo test drives.
  EmailTypoHint: (
    await vi.importActual<
      typeof import('../../../libs/react/registrations/src/lib/EmailTypoHint')
    >('../../../libs/react/registrations/src/lib/EmailTypoHint')
  ).EmailTypoHint,
  FreeCancellationNote: () => null,
  RegistrationCheckoutForm: ({
    onCalculateCost,
    publicClass,
  }: {
    onCalculateCost: (id: string, qty: number) => Promise<unknown>;
    publicClass: PublicClass;
  }) => {
    void onCalculateCost(publicClass.id, 1).catch(() => undefined);
    return <div>Checkout form</div>;
  },
}));


function renderWidget() {
  return render(
    <RegistrationWidget
      classId="class-closing"
      squareAppId="sandbox-app"
      squareLocationId="LOC1"
      env="emulator"
    />
  );
}

describe('RegistrationWidget trusts the server clock', () => {
  beforeEach(() => {
    calledRoutes.length = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('is closed when the server says so, though the visitor clock is behind', async () => {
    nextClass = makeClass({ registrationOpen: false });
    vi.setSystemTime(START_MS - 60 * 60_000);
    renderWidget();
    expect(
      await screen.findByText('Registration is closed')
    ).toBeInTheDocument();
    expect(calledRoutes).not.toContain('calculateRegistrationCost');
  });

  it('shows the form when the server says open, though the visitor clock is ahead', async () => {
    nextClass = makeClass({ registrationOpen: true });
    vi.setSystemTime(START_MS + 60 * 60_000);
    renderWidget();
    expect(await screen.findByText('Checkout form')).toBeInTheDocument();
  });
});

/**
 * Without `registrationOpen` (a server older than the field) the widget
 * applies the same rule on the visitor's clock.
 */
describe('RegistrationWidget registration cutoff, no server verdict', () => {
  beforeEach(() => {
    calledRoutes.length = 0;
    nextClass = makeClass();
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows the form one millisecond before the class starts', async () => {
    vi.setSystemTime(START_MS - 1);
    renderWidget();
    expect(await screen.findByText('Checkout form')).toBeInTheDocument();
    expect(screen.queryByTestId('registration-closed')).toBeNull();
    // The open form prices on mount, so its absence below means something.
    expect(calledRoutes).toContain('calculateRegistrationCost');
  });

  it('is closed from the moment the class starts, and never prices a booking', async () => {
    vi.setSystemTime(START_MS);
    renderWidget();
    expect(
      await screen.findByText('Registration is closed')
    ).toBeInTheDocument();
    expect(screen.queryByText('Checkout form')).toBeNull();
    expect(screen.getByRole('link', { name: 'See upcoming classes' })).toHaveAttribute(
      'href',
      'https://mapleandsprucefolkarts.com/upcoming-classes'
    );
    expect(calledRoutes).not.toContain('calculateRegistrationCost');
  });

  it('shows closed, not the waitlist, for a full class that has started', async () => {
    nextClass = makeClass({ spotsRemaining: 0 });
    vi.setSystemTime(START_MS + 60_000);
    renderWidget();
    expect(
      await screen.findByText('Registration is closed')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join waitlist' })).toBeNull();
  });

  it('still offers the waitlist for a full class that has not started', async () => {
    nextClass = makeClass({ spotsRemaining: 0 });
    vi.setSystemTime(START_MS - 60_000);
    renderWidget();
    expect(
      await screen.findByRole('button', { name: 'Join waitlist' })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('registration-closed')).toBeNull();
  });

  it('offers to fix a mistyped email domain on the waitlist form', async () => {
    nextClass = makeClass({ spotsRemaining: 0 });
    vi.setSystemTime(START_MS - 60_000);
    renderWidget();
    const field = await screen.findByLabelText(/Email address/);
    // Built at runtime so no real-looking address sits in the source.
    const typed = ['robin', 'gnail.com'].join('@');
    const fixed = ['robin', 'gmail.com'].join('@');

    fireEvent.change(field, { target: { value: typed } });
    expect(screen.getByTestId('email-typo-hint')).toHaveTextContent(
      `Did you mean ${fixed}?`
    );

    fireEvent.click(screen.getByRole('button', { name: fixed }));
    expect(field).toHaveValue(fixed);
    expect(screen.queryByTestId('email-typo-hint')).toBeNull();
  });

  it('closes at an earlier registrationClosesAt override', async () => {
    const closesAt = '2026-11-08T05:00:00.000Z';
    nextClass = makeClass({ registrationClosesAt: closesAt });
    vi.setSystemTime(new Date(closesAt).getTime());
    renderWidget();
    expect(
      await screen.findByText('Registration is closed')
    ).toBeInTheDocument();
  });

  it('keeps a private-hours class open while a later hour is ahead', async () => {
    nextClass = makeClass({
      format: 'privateHours',
      sessions: [{ dateTime: START }, { dateTime: '2026-11-10T01:00:00.000Z' }],
      bookedSlotStarts: [],
    });
    vi.setSystemTime(START_MS + 60_000);
    renderWidget();
    expect(await screen.findByText('Checkout form')).toBeInTheDocument();
  });

  it('closes a private-hours class once its last hour has started', async () => {
    nextClass = makeClass({
      format: 'privateHours',
      sessions: [{ dateTime: START }, { dateTime: '2026-11-10T01:00:00.000Z' }],
      bookedSlotStarts: [],
    });
    vi.setSystemTime(new Date('2026-11-10T01:00:00.000Z').getTime());
    renderWidget();
    expect(
      await screen.findByText('Registration is closed')
    ).toBeInTheDocument();
  });
});
