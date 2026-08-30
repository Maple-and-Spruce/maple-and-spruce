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
import type { PublicMusicTogetherDemo } from '@maple/ts/firebase/api-types';

/** Stands in for the server-derived dedup key returned by the callable. */
const DEMO_EVENT_ID = 'mt-demo-0123456789abcdef';
const DEMO_WAITLIST_EVENT_ID = 'mt-demo-fedcba9876543210';

// Records the last payload sent to each callable, by name.
const calls: Record<string, unknown> = {};
// Controls the addMusicTogetherDemoRsvp response.
let nextRsvp: {
  added: boolean;
  status: 'confirmed' | 'waitlisted';
  eventId: string;
} = {
  added: true,
  status: 'confirmed',
  // The SERVER computes this and already sent the CAPI `Schedule` under it —
  // the widget must echo it back as the Pixel's `eventID`, never rebuild it.
  eventId: DEMO_EVENT_ID,
};
// Controls the getPublicMusicTogetherDemos response.
let demos: PublicMusicTogetherDemo[] = [];

const libraryDemo: PublicMusicTogetherDemo = {
  id: 'demo-1',
  dateTime: '2030-08-03T14:00:00.000Z',
  location: 'Morgantown Public Library',
  durationMinutes: 45,
  spotsRemaining: 3,
  isFull: false,
};
const studioDemo: PublicMusicTogetherDemo = {
  id: 'demo-2',
  dateTime: '2030-08-04T13:00:00.000Z',
  location: 'Maple & Spruce Studio',
  durationMinutes: 45,
  spotsRemaining: 0,
  isFull: true,
};

vi.mock('./firebase-init', () => ({
  getWidgetFunctions: () => ({ __mock: true }),
}));

// Warmup is a fire-and-forget no-op in tests (mirrors the other widget specs);
// otherwise its mount-time ping registers as an addMusicTogetherDemoRsvp call.
vi.mock('./lib/warmup', () => ({ warmup: vi.fn() }));

vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string) => (payload: unknown) => {
    calls[name] = payload;
    if (name === 'getPublicMusicTogetherDemos') {
      return Promise.resolve({ data: { demos } });
    }
    if (name === 'addMusicTogetherDemoRsvp') {
      return Promise.resolve({ data: nextRsvp });
    }
    return Promise.resolve({ data: {} });
  },
}));

import { MusicTogetherDemoWidget } from './MusicTogetherDemoWidget';

function setField(matcher: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(matcher), { target: { value } });
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

describe('MusicTogetherDemoWidget', () => {
  beforeEach(() => {
    nextRsvp = { added: true, status: 'confirmed', eventId: DEMO_EVENT_ID };
    demos = [libraryDemo, studioDemo];
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
   * /music-together-demo is a paid-traffic landing page whose hero IS this
   * widget, so the widget owns the page's only h1. Every other widget in this
   * library renders `component="h2"` on purpose (they sit under a page that
   * already has an h1); this one must not follow that convention or the landing
   * page ships with no h1 at all (#785).
   */
  it('renders its heading as the page h1 by default', async () => {
    render(<MusicTogetherDemoWidget env="dev" heading="Free Demo Class" />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Free Demo Class' })
    ).toBeInTheDocument();
  });

  it('renders an h2 when embedded under a page that owns the h1', async () => {
    render(
      <MusicTogetherDemoWidget
        env="dev"
        heading="Free Demo Class"
        headingLevel="h2"
      />
    );

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Free Demo Class' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  /**
   * `Schedule`, not `Lead` — booking a specific demo time is a stronger signal
   * than joining the interest list, and keeping them distinct lets the two MT
   * campaigns bid toward different outcomes. Scoped to the MT pixel so it never
   * lands in the site-wide Maple & Spruce dataset.
   */
  it('fires a Schedule scoped to the Music Together pixel on RSVP', async () => {
    const fbq = installFbq();
    const user = userEvent.setup({ delay: null });
    render(<MusicTogetherDemoWidget env="dev" />);

    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: /Morgantown Public Library/i })
      ).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole('radio', { name: /Morgantown Public Library/i })
    );
    setField(/Your name/i, 'Jamie Rivera');
    setField(/^Email/i, 'jamie@example.com');
    await user.click(screen.getByRole('button', { name: /reserve my spot/i }));
    await waitFor(() =>
      expect(screen.getByText(/You're in!/i)).toBeInTheDocument()
    );

    const scheduled = fbq.mock.calls.filter((c) => c[2] === 'Schedule');
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0][0]).toBe('trackSingle');
    expect(scheduled[0][1]).toBe('1562555242035326');
    expect(scheduled[0][3]).toMatchObject({
      content_category: 'music_together_demo',
      content_ids: ['demo-1'],
      demo_date_time: '2030-08-03T14:00:00.000Z',
      rsvp_status: 'confirmed',
    });

    // The 5th fbq arg is the dedup envelope. Without it, this browser event and
    // the CAPI `Schedule` the callable already sent are two conversions, and
    // every RSVP double-counts in Ads Manager.
    expect(scheduled[0][4]).toEqual({ eventID: DEMO_EVENT_ID });

    expect(fbq.mock.calls.some((c) => c[2] === 'Lead')).toBe(false);
    expect(fbq.mock.calls.some((c) => c[0] === 'track')).toBe(false);
  });

  it('sends the ad-click cookies with the RSVP so the server can attribute it', async () => {
    // Without `_fbc` the server event falls back to email-hash matching alone,
    // which is what keeps Events Manager match quality low.
    document.cookie = '_fbp=fb.1.1700000000000.111';
    document.cookie = '_fbc=fb.1.1700000000000.IwAR-click';
    const user = userEvent.setup({ delay: null });
    render(<MusicTogetherDemoWidget env="dev" />);

    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: /Morgantown Public Library/i })
      ).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole('radio', { name: /Morgantown Public Library/i })
    );
    setField(/Your name/i, 'Jamie Rivera');
    setField(/^Email/i, 'jamie@example.com');
    await user.click(screen.getByRole('button', { name: /reserve my spot/i }));
    await waitFor(() =>
      expect(screen.getByText(/You're in!/i)).toBeInTheDocument()
    );

    expect(
      (calls['addMusicTogetherDemoRsvp'] as { metaAttribution?: unknown })
        .metaAttribution
    ).toMatchObject({
      fbp: 'fb.1.1700000000000.111',
      fbc: 'fb.1.1700000000000.IwAR-click',
    });

    document.cookie = '_fbp=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = '_fbc=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('tags a full-demo waitlist join as waitlisted, not a booked seat', async () => {
    nextRsvp = {
      added: true,
      status: 'waitlisted',
      eventId: DEMO_WAITLIST_EVENT_ID,
    };
    const fbq = installFbq();
    const user = userEvent.setup({ delay: null });
    render(<MusicTogetherDemoWidget env="dev" />);

    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: /Maple & Spruce Studio/i })
      ).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole('radio', { name: /Maple & Spruce Studio/i })
    );
    setField(/Your name/i, 'Full Family');
    setField(/^Email/i, 'full@example.com');
    await user.click(screen.getByRole('button', { name: /reserve my spot/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/on the waitlist and we'll email you if a spot opens/i)
      ).toBeInTheDocument()
    );

    const scheduled = fbq.mock.calls.find((c) => c[2] === 'Schedule');
    expect(scheduled?.[3]).toMatchObject({ rsvp_status: 'waitlisted' });
  });

  it('completes the RSVP when fbevents never loads (ad blocker)', async () => {
    const user = userEvent.setup({ delay: null });
    render(<MusicTogetherDemoWidget env="dev" />);

    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: /Morgantown Public Library/i })
      ).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole('radio', { name: /Morgantown Public Library/i })
    );
    setField(/Your name/i, 'Jamie Rivera');
    setField(/^Email/i, 'jamie@example.com');
    await user.click(screen.getByRole('button', { name: /reserve my spot/i }));

    // Analytics is never allowed to break the actual RSVP.
    await waitFor(() =>
      expect(screen.getByText(/You're in!/i)).toBeInTheDocument()
    );
  });

  it('fetches and renders demos with location + spots (no Square)', async () => {
    render(<MusicTogetherDemoWidget env="dev" />);

    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: /Morgantown Public Library/i })
      ).toBeInTheDocument()
    );
    expect(screen.getByText(/3 spots left/i)).toBeInTheDocument();
    // Full demo shows the waitlist prompt.
    expect(screen.getByText(/Full — join the waitlist/i)).toBeInTheDocument();
    // No Square anywhere.
    expect(document.querySelector('#card-container')).toBeNull();
    expect(calls['getPublicMusicTogetherDemos']).toEqual({});
  });

  it('submits the chosen demoId, name, and email', async () => {
    const user = userEvent.setup({ delay: null });
    render(<MusicTogetherDemoWidget env="dev" />);

    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: /Morgantown Public Library/i })
      ).toBeInTheDocument()
    );

    await user.click(
      screen.getByRole('radio', { name: /Morgantown Public Library/i })
    );
    setField(/Your name/i, 'Jamie Rivera');
    setField(/^Email/i, 'jamie@example.com');
    await user.click(screen.getByRole('button', { name: /reserve my spot/i }));

    await waitFor(() =>
      expect(screen.getByText(/You're in!/i)).toBeInTheDocument()
    );
    expect(calls['addMusicTogetherDemoRsvp']).toMatchObject({
      demoId: 'demo-1',
      name: 'Jamie Rivera',
      email: 'jamie@example.com',
    });
    expect(
      screen.getByText(/We'll see you .* at Morgantown Public Library/i)
    ).toBeInTheDocument();
  });

  it('shows waitlist copy when the RSVP is waitlisted', async () => {
    nextRsvp = {
      added: true,
      status: 'waitlisted',
      eventId: DEMO_WAITLIST_EVENT_ID,
    };
    const user = userEvent.setup({ delay: null });
    render(<MusicTogetherDemoWidget env="dev" />);

    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: /Maple & Spruce Studio/i })
      ).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole('radio', { name: /Maple & Spruce Studio/i })
    );
    setField(/Your name/i, 'Full Family');
    setField(/^Email/i, 'full@example.com');
    await user.click(screen.getByRole('button', { name: /reserve my spot/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/on the waitlist and we'll email you if a spot opens/i)
      ).toBeInTheDocument()
    );
  });

  it('preselects the only demo when exactly one is available', async () => {
    demos = [libraryDemo];
    const user = userEvent.setup({ delay: null });
    render(<MusicTogetherDemoWidget env="dev" />);

    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: /Morgantown Public Library/i })
      ).toBeInTheDocument()
    );
    setField(/Your name/i, 'Solo Family');
    setField(/^Email/i, 'solo@example.com');
    await user.click(screen.getByRole('button', { name: /reserve my spot/i }));

    await waitFor(() =>
      expect(screen.getByText(/You're in!/i)).toBeInTheDocument()
    );
    expect(calls['addMusicTogetherDemoRsvp']).toMatchObject({
      demoId: 'demo-1',
    });
  });

  it('blocks submission until a demo is chosen', async () => {
    const user = userEvent.setup({ delay: null });
    render(<MusicTogetherDemoWidget env="dev" />);

    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: /Morgantown Public Library/i })
      ).toBeInTheDocument()
    );
    setField(/Your name/i, 'No Slot');
    setField(/^Email/i, 'noslot@example.com');
    await user.click(screen.getByRole('button', { name: /reserve my spot/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/choose a demo class time/i)
      ).toBeInTheDocument()
    );
    expect(calls['addMusicTogetherDemoRsvp']).toBeUndefined();
  });

  it('shows a "coming soon" state when no demos are available', async () => {
    demos = [];
    render(<MusicTogetherDemoWidget env="dev" />);
    await waitFor(() =>
      expect(
        screen.getByText(/Demo dates coming soon — check back!/i)
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByRole('button', { name: /reserve my spot/i })
    ).toBeNull();
  });
});
