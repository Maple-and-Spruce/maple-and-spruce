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

describe('MusicTogetherInterestWidget', () => {
  beforeEach(() => {
    nextSections = makeSections();
    nextAdded = true;
    for (const k of Object.keys(calls)) delete calls[k];
  });
  afterEach(() => cleanup());

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
