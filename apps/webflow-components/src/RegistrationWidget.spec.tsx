// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { PublicClass } from '@maple/ts/domain';

/**
 * Where the class widget's first paint comes from.
 *
 * `live` (the default, and what every published page uses until the Designer
 * flag is flipped) waits on `publicSite/getPublicClass`. `cms` renders from
 * props bound to the class's CMS fields with no function call, then refreshes
 * from the live read in the background. These lock in that the flag changes
 * nothing until it is set, that unbound props fall back to live, and that the
 * live read wins once it lands.
 */

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const calls: string[] = [];
let classReply: Deferred<{ data: { class: PublicClass } }>;
let agreementsReply: Deferred<{ data: { agreements: unknown[] } }>;

vi.mock('./firebase-init', async () => {
  const { httpsCallable } = await import('firebase/functions');
  return {
    getWidgetFunctions: () => ({ __mock: true }),
    routeCallable: (fns: never, router: string, route: string) => {
      if (router !== 'publicSite') {
        throw new Error(`unexpected router ${router}`);
      }
      return httpsCallable(fns, route);
    },
  };
});

vi.mock('./lib/warmup', () => ({ warmup: vi.fn() }));

const analytics = vi.hoisted(() => ({
  trackViewClass: vi.fn(),
  trackAddClassToCart: vi.fn(),
  trackPurchaseClass: vi.fn(),
}));
vi.mock('./lib/class-analytics', () => analytics);

vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string) => () => {
    calls.push(name);
    if (name === 'getPublicClass') return classReply.promise;
    if (name === 'getRequiredAgreementsForClass') {
      return agreementsReply.promise;
    }
    return Promise.resolve({ data: {} });
  },
}));

// The checkout form has its own spec; here it only reports what it was given.
vi.mock('@maple/react/registrations', () => ({
  RegistrationCheckoutForm: (props: {
    publicClass: { name: string; spotsRemaining: number };
    agreementsLoading?: boolean;
    requiredAgreements?: unknown[];
  }) => (
    <div data-testid="checkout-form">
      <span data-testid="form-class">{props.publicClass.name}</span>
      <span data-testid="form-spots">{props.publicClass.spotsRemaining}</span>
      <span data-testid="form-agreements">
        {props.agreementsLoading
          ? 'loading'
          : String(props.requiredAgreements?.length ?? 0)}
      </span>
    </div>
  ),
}));

import { RegistrationWidget, classFromCmsProps } from './RegistrationWidget';

const LIVE_CLASS = {
  id: 'class-1',
  name: 'Stained Glass Suncatchers',
  slug: 'stained-glass-suncatchers',
  description: 'Cut, foil and solder a suncatcher.',
  sessions: [{ dateTime: '2030-05-14T22:00:00.000Z' }],
  durationMinutes: 180,
  capacity: 8,
  spotsRemaining: 5,
  priceCents: 6000,
  skillLevel: 'all-levels',
} as PublicClass;

const baseProps = {
  classId: 'class-1',
  squareAppId: 'sandbox-app',
  squareLocationId: 'LOC1',
  env: 'emulator',
};

const cmsProps = {
  ...baseProps,
  dataSource: 'cms',
  cmsClassName: 'Stained Glass Suncatchers',
  cmsPriceCents: 6000,
  cmsSpotsRemaining: 3,
};

function setReturnParam(reg: string | undefined): void {
  const url = new URL(window.location.href);
  if (reg) url.searchParams.set('reg', reg);
  else url.searchParams.delete('reg');
  window.history.replaceState(window.history.state, '', url);
}

describe('classFromCmsProps', () => {
  it('returns null unless the flag is cms', () => {
    expect(classFromCmsProps({ ...cmsProps, dataSource: 'live' })).toBeNull();
    expect(classFromCmsProps({ ...cmsProps, dataSource: undefined })).toBeNull();
  });

  it('returns null when the name is unbound', () => {
    expect(classFromCmsProps({ ...cmsProps, cmsClassName: '  ' })).toBeNull();
  });

  it('returns null when the price is unbound (negative default)', () => {
    expect(classFromCmsProps({ ...cmsProps, cmsPriceCents: -1 })).toBeNull();
    expect(
      classFromCmsProps({ ...cmsProps, cmsPriceCents: undefined })
    ).toBeNull();
  });

  it('returns null when an empty CMS number arrives as null', () => {
    expect(classFromCmsProps({ ...cmsProps, cmsPriceCents: null })).toBeNull();
    expect(
      classFromCmsProps({ ...cmsProps, cmsSpotsRemaining: null })
    ).toBeNull();
  });

  it('returns null without a class id', () => {
    expect(classFromCmsProps({ ...cmsProps, classId: '' })).toBeNull();
  });

  it('builds the checkout class from bound props', () => {
    expect(classFromCmsProps(cmsProps)).toEqual({
      id: 'class-1',
      name: 'Stained Glass Suncatchers',
      priceCents: 6000,
      spotsRemaining: 3,
    });
  });

  it('accepts a free class and a full one', () => {
    expect(
      classFromCmsProps({
        ...cmsProps,
        cmsPriceCents: 0,
        cmsSpotsRemaining: 0,
      })
    ).toMatchObject({ priceCents: 0, spotsRemaining: 0 });
  });
});

describe('RegistrationWidget first paint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    classReply = deferred();
    agreementsReply = deferred();
    setReturnParam(undefined);
  });

  afterEach(() => {
    cleanup();
    setReturnParam(undefined);
  });

  it('live (default): waits on getPublicClass before showing the form', async () => {
    render(<RegistrationWidget {...baseProps} />);

    expect(screen.queryByTestId('checkout-form')).toBeNull();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(calls).toContain('getPublicClass');

    await act(async () => {
      classReply.resolve({ data: { class: LIVE_CLASS } });
      agreementsReply.resolve({ data: { agreements: [] } });
    });

    expect(await screen.findByTestId('checkout-form')).toBeInTheDocument();
    expect(screen.getByTestId('form-spots')).toHaveTextContent('5');
  });

  it('cms: shows the form on first render, before any function answers', () => {
    render(<RegistrationWidget {...cmsProps} />);

    expect(screen.getByTestId('checkout-form')).toBeInTheDocument();
    expect(screen.getByTestId('form-class')).toHaveTextContent(
      'Stained Glass Suncatchers'
    );
    expect(screen.getByTestId('form-spots')).toHaveTextContent('3');
    expect(screen.getByTestId('form-agreements')).toHaveTextContent('loading');
    expect(analytics.trackViewClass).toHaveBeenCalledWith(expect.anything(), {
      classId: 'class-1',
      className: 'Stained Glass Suncatchers',
      priceCents: 6000,
    });
  });

  it('cms: fills in agreements when they arrive', async () => {
    render(<RegistrationWidget {...cmsProps} />);

    await act(async () => {
      agreementsReply.resolve({ data: { agreements: [{ templateId: 't1' }] } });
    });

    expect(screen.getByTestId('form-agreements')).toHaveTextContent('1');
  });

  it('cms: treats a failed agreements lookup as none, like live mode', async () => {
    render(<RegistrationWidget {...cmsProps} />);

    await act(async () => {
      agreementsReply.reject(new Error('cold start timeout'));
    });

    expect(screen.getByTestId('form-agreements')).toHaveTextContent('0');
  });

  it('cms: the live spot count replaces the CMS one', async () => {
    render(<RegistrationWidget {...cmsProps} />);
    expect(screen.getByTestId('form-spots')).toHaveTextContent('3');

    await act(async () => {
      classReply.resolve({ data: { class: { ...LIVE_CLASS, spotsRemaining: 2 } } });
    });

    expect(screen.getByTestId('form-spots')).toHaveTextContent('2');
  });

  it('cms: switches to the waitlist when the live read says full', async () => {
    render(<RegistrationWidget {...cmsProps} />);

    await act(async () => {
      classReply.resolve({ data: { class: { ...LIVE_CLASS, spotsRemaining: 0 } } });
    });

    expect(screen.queryByTestId('checkout-form')).toBeNull();
    expect(
      screen.getByRole('button', { name: /Join waitlist/ })
    ).toBeInTheDocument();
  });

  it('cms: keeps the CMS data when the live read fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<RegistrationWidget {...cmsProps} />);

    await act(async () => {
      classReply.reject(new Error('unavailable'));
    });

    expect(screen.getByTestId('checkout-form')).toBeInTheDocument();
    expect(screen.getByTestId('form-spots')).toHaveTextContent('3');
    warn.mockRestore();
  });

  it('cms: a full class in CMS shows the waitlist straight away', () => {
    render(<RegistrationWidget {...cmsProps} cmsSpotsRemaining={0} />);

    expect(
      screen.getByRole('button', { name: /Join waitlist/ })
    ).toBeInTheDocument();
  });

  it('cms with unbound props falls back to the live read', () => {
    render(<RegistrationWidget {...cmsProps} cmsPriceCents={-1} />);

    expect(screen.queryByTestId('checkout-form')).toBeNull();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('cms: a hosted-checkout return still takes the verified live path', () => {
    setReturnParam('reg-1');
    render(<RegistrationWidget {...cmsProps} />);

    // No form until getRegistrationStatus has had its say.
    expect(screen.queryByTestId('checkout-form')).toBeNull();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
