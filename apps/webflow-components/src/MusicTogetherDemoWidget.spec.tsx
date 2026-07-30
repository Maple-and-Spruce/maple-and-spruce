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

// Records the last payload sent to each callable, by name.
const calls: Record<string, unknown> = {};
// Controls the addMusicTogetherDemoRsvp response.
let nextRsvp: { added: boolean; status: 'confirmed' | 'waitlisted' } = {
  added: true,
  status: 'confirmed',
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

describe('MusicTogetherDemoWidget', () => {
  beforeEach(() => {
    nextRsvp = { added: true, status: 'confirmed' };
    demos = [libraryDemo, studioDemo];
    for (const k of Object.keys(calls)) delete calls[k];
  });
  afterEach(() => cleanup());

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
    expect(calls['addMusicTogetherDemoRsvp']).toEqual({
      demoId: 'demo-1',
      name: 'Jamie Rivera',
      email: 'jamie@example.com',
    });
    expect(
      screen.getByText(/We'll see you .* at Morgantown Public Library/i)
    ).toBeInTheDocument();
  });

  it('shows waitlist copy when the RSVP is waitlisted', async () => {
    nextRsvp = { added: true, status: 'waitlisted' };
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
