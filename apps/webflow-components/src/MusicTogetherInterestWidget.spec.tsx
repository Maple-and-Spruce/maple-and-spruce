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
import type { PublicMusicTogetherSectionOption } from '@maple/ts/firebase/api-types';

// Canned section options returned by getPublicMusicTogetherSections.
let nextSections: PublicMusicTogetherSectionOption[] = makeSections();
// Records the last payload sent to each callable, by name.
const calls: Record<string, unknown> = {};
// Controls the addMusicTogetherInterest response.
let nextAdded = true;

function makeSections(): PublicMusicTogetherSectionOption[] {
  return [
    {
      id: 'sec-thu',
      name: 'Thursdays 10am',
      firstSessionAt: '2026-09-10T14:00:00.000Z',
      location: 'Studio A',
      status: 'open',
    },
    {
      id: 'sec-sat',
      name: 'Saturdays 9am',
      firstSessionAt: '2026-09-12T13:00:00.000Z',
      status: 'full',
    },
  ];
}

vi.mock('./firebase-init', () => ({
  getWidgetFunctions: () => ({ __mock: true }),
}));

// Warmup is a fire-and-forget no-op in tests; otherwise its mount ping
// registers as an addMusicTogetherInterest call.
vi.mock('./lib/warmup', () => ({ warmup: vi.fn() }));

vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string) => (payload: unknown) => {
    calls[name] = payload;
    if (name === 'getPublicMusicTogetherSections') {
      return Promise.resolve({ data: { sections: nextSections } });
    }
    if (name === 'addMusicTogetherInterest') {
      return Promise.resolve({ data: { added: nextAdded } });
    }
    return Promise.resolve({ data: {} });
  },
}));

import { MusicTogetherInterestWidget } from './MusicTogetherInterestWidget';

function renderWidget() {
  return render(<MusicTogetherInterestWidget env="dev" />);
}

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

describe('MusicTogetherInterestWidget', () => {
  beforeEach(() => {
    nextSections = makeSections();
    nextAdded = true;
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
   * Music Together advertises from its own Meta ad account. The Maple & Spruce
   * pixel is loaded site-wide via GTM on the same Webflow site, so a bare
   * `fbq('track', …)` here would file this Lead in the craft-class dataset too.
   */
  it('fires a Lead scoped to the Music Together pixel on submit', async () => {
    const fbq = installFbq();
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await waitFor(() =>
      expect(screen.getByText(/Thursdays 10am/)).toBeInTheDocument()
    );

    setField(/Your name/i, 'Jamie Rivera');
    setField(/^Email/i, 'jamie@example.com');
    await user.click(screen.getByRole('checkbox', { name: /Thursdays 10am/i }));
    await user.click(
      screen.getByRole('button', { name: /join the interest list/i })
    );
    await waitFor(() =>
      expect(screen.getByText(/on the interest list/i)).toBeInTheDocument()
    );

    const leads = fbq.mock.calls.filter((c) => c[2] === 'Lead');
    expect(leads).toHaveLength(1);
    expect(leads[0][0]).toBe('trackSingle');
    expect(leads[0][1]).toBe('1562555242035326');
    expect(leads[0][3]).toMatchObject({
      content_category: 'music_together_interest',
      content_ids: ['sec-thu'],
      already_on_list: false,
    });

    // The page also gets an MT-scoped PageView so the ad account has a
    // retargetable audience — and nothing is ever sent un-scoped.
    expect(fbq).toHaveBeenCalledWith('init', '1562555242035326');
    expect(fbq.mock.calls.some((c) => c[0] === 'track')).toBe(false);
  });

  it('marks a repeat submit as already_on_list', async () => {
    nextAdded = false;
    const fbq = installFbq();
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await waitFor(() =>
      expect(screen.getByText(/Thursdays 10am/)).toBeInTheDocument()
    );

    setField(/Your name/i, 'Jamie Rivera');
    setField(/^Email/i, 'jamie@example.com');
    await user.click(screen.getByRole('checkbox', { name: /Thursdays 10am/i }));
    await user.click(
      screen.getByRole('button', { name: /join the interest list/i })
    );
    await waitFor(() =>
      expect(screen.getByText(/already on our interest list/i)).toBeInTheDocument()
    );

    const lead = fbq.mock.calls.find((c) => c[2] === 'Lead');
    expect(lead?.[3]).toMatchObject({ already_on_list: true });
  });

  it('submits normally when fbevents never loads (ad blocker)', async () => {
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await waitFor(() =>
      expect(screen.getByText(/Thursdays 10am/)).toBeInTheDocument()
    );

    setField(/Your name/i, 'Jamie Rivera');
    setField(/^Email/i, 'jamie@example.com');
    await user.click(screen.getByRole('checkbox', { name: /Thursdays 10am/i }));
    await user.click(
      screen.getByRole('button', { name: /join the interest list/i })
    );

    // Analytics is never allowed to break the actual signup.
    await waitFor(() =>
      expect(screen.getByText(/on the interest list/i)).toBeInTheDocument()
    );
    expect(calls['addMusicTogetherInterest']).toBeTruthy();
  });

  it('submits a cross-section interest entry with checked sections + all three notes', async () => {
    const user = userEvent.setup({ delay: null });
    renderWidget();

    // Section checkboxes render once the options load.
    await waitFor(() =>
      expect(screen.getByText(/Thursdays 10am/)).toBeInTheDocument()
    );

    setField(/Your name/i, 'Jamie Rivera');
    setField(/^Email/i, 'jamie@example.com');

    // Check both section times.
    await user.click(screen.getByRole('checkbox', { name: /Thursdays 10am/i }));
    await user.click(screen.getByRole('checkbox', { name: /Saturdays 9am/i }));

    setField(/which one\(s\) are you most interested in/i, 'Thursdays please');
    setField(/what other days\/times would work best/i, 'Saturday mornings');
    setField(/Additional notes/i, 'Two kids');

    await user.click(
      screen.getByRole('button', { name: /join the interest list/i })
    );

    await waitFor(() =>
      expect(screen.getByText(/on the interest list/i)).toBeInTheDocument()
    );

    expect(calls['addMusicTogetherInterest']).toEqual({
      name: 'Jamie Rivera',
      email: 'jamie@example.com',
      interestedSectionIds: ['sec-thu', 'sec-sat'],
      preferenceNote: 'Thursdays please',
      alternateTimesNote: 'Saturday mornings',
      notes: 'Two kids',
    });
  });

  it('allows submitting with only an alternate-times note (no section checked)', async () => {
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await waitFor(() =>
      expect(screen.getByText(/Thursdays 10am/)).toBeInTheDocument()
    );

    setField(/Your name/i, 'No Fit');
    setField(/^Email/i, 'nofit@example.com');
    setField(/what other days\/times would work best/i, 'Weekday afternoons');

    await user.click(
      screen.getByRole('button', { name: /join the interest list/i })
    );

    await waitFor(() =>
      expect(screen.getByText(/on the interest list/i)).toBeInTheDocument()
    );
    expect(calls['addMusicTogetherInterest']).toMatchObject({
      interestedSectionIds: [],
      alternateTimesNote: 'Weekday afternoons',
    });
  });

  it('blocks submission when nothing indicates interest', async () => {
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await waitFor(() =>
      expect(screen.getByText(/Thursdays 10am/)).toBeInTheDocument()
    );

    setField(/Your name/i, 'Jamie');
    setField(/^Email/i, 'jamie@example.com');

    await user.click(
      screen.getByRole('button', { name: /join the interest list/i })
    );

    await waitFor(() =>
      expect(
        screen.getByText(/check at least one class time/i)
      ).toBeInTheDocument()
    );
    expect(calls['addMusicTogetherInterest']).toBeUndefined();
  });

  it('shows an already-on-list message when the email returns added=false', async () => {
    nextAdded = false;
    const user = userEvent.setup({ delay: null });
    renderWidget();
    await waitFor(() =>
      expect(screen.getByText(/Thursdays 10am/)).toBeInTheDocument()
    );

    setField(/Your name/i, 'Jamie');
    setField(/^Email/i, 'jamie@example.com');
    await user.click(screen.getByRole('checkbox', { name: /Thursdays 10am/i }));
    await user.click(
      screen.getByRole('button', { name: /join the interest list/i })
    );

    await waitFor(() =>
      expect(
        screen.getByText(/already on our interest list/i)
      ).toBeInTheDocument()
    );
  });

  it('handles an empty section list — prompts for alternate times', async () => {
    nextSections = [];
    renderWidget();
    await waitFor(() =>
      expect(
        screen.getByText(/No class times are posted yet/i)
      ).toBeInTheDocument()
    );
  });
});
