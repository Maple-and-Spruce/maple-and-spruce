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

// Records the last payload sent to each callable, by name.
const calls: Record<string, unknown> = {};
// Controls the addMusicTogetherDemoRsvp response.
let nextAdded = true;

vi.mock('./firebase-init', () => ({
  getWidgetFunctions: () => ({ __mock: true }),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string) => (payload: unknown) => {
    calls[name] = payload;
    if (name === 'addMusicTogetherDemoRsvp') {
      return Promise.resolve({ data: { added: nextAdded } });
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
    nextAdded = true;
    for (const k of Object.keys(calls)) delete calls[k];
  });
  afterEach(() => cleanup());

  it('renders the configured demo slots as radio options', () => {
    render(
      <MusicTogetherDemoWidget
        env="dev"
        demoSlot1="Sat Aug 3 · 10:00 AM"
        demoSlot2="Sun Aug 4 · 9:00 AM"
      />
    );
    expect(
      screen.getByRole('radio', { name: /Sat Aug 3 · 10:00 AM/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /Sun Aug 4 · 9:00 AM/i })
    ).toBeInTheDocument();
    // No Square anywhere.
    expect(document.querySelector('#card-container')).toBeNull();
    expect(screen.queryByText(/card/i)).toBeNull();
  });

  it('submits the chosen slot, name, and email', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <MusicTogetherDemoWidget
        env="dev"
        demoSlot1="Sat Aug 3 · 10:00 AM"
        demoSlot2="Sun Aug 4 · 9:00 AM"
      />
    );

    await user.click(
      screen.getByRole('radio', { name: /Sun Aug 4 · 9:00 AM/i })
    );
    setField(/Your name/i, 'Jamie Rivera');
    setField(/^Email/i, 'jamie@example.com');

    await user.click(
      screen.getByRole('button', { name: /reserve my spot/i })
    );

    await waitFor(() =>
      expect(screen.getByText(/You're in!/i)).toBeInTheDocument()
    );
    expect(calls['addMusicTogetherDemoRsvp']).toEqual({
      demoSlot: 'Sun Aug 4 · 9:00 AM',
      name: 'Jamie Rivera',
      email: 'jamie@example.com',
    });
    expect(screen.getByText(/Sun Aug 4 · 9:00 AM/)).toBeInTheDocument();
  });

  it('preselects the only slot when exactly one is configured', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <MusicTogetherDemoWidget env="dev" demoSlot1="Sat Aug 3 · 10:00 AM" />
    );

    setField(/Your name/i, 'Solo Family');
    setField(/^Email/i, 'solo@example.com');
    await user.click(
      screen.getByRole('button', { name: /reserve my spot/i })
    );

    await waitFor(() =>
      expect(screen.getByText(/You're in!/i)).toBeInTheDocument()
    );
    expect(calls['addMusicTogetherDemoRsvp']).toMatchObject({
      demoSlot: 'Sat Aug 3 · 10:00 AM',
    });
  });

  it('shows an already-signed-up message when added=false', async () => {
    nextAdded = false;
    const user = userEvent.setup({ delay: null });
    render(
      <MusicTogetherDemoWidget env="dev" demoSlot1="Sat Aug 3 · 10:00 AM" />
    );
    setField(/Your name/i, 'Repeat Family');
    setField(/^Email/i, 'repeat@example.com');
    await user.click(
      screen.getByRole('button', { name: /reserve my spot/i })
    );
    await waitFor(() =>
      expect(
        screen.getByText(/already signed up — we updated your demo/i)
      ).toBeInTheDocument()
    );
  });

  it('blocks submission until a slot is chosen', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <MusicTogetherDemoWidget
        env="dev"
        demoSlot1="Sat Aug 3 · 10:00 AM"
        demoSlot2="Sun Aug 4 · 9:00 AM"
      />
    );
    setField(/Your name/i, 'No Slot');
    setField(/^Email/i, 'noslot@example.com');
    await user.click(
      screen.getByRole('button', { name: /reserve my spot/i })
    );
    await waitFor(() =>
      expect(
        screen.getByText(/choose a demo class time/i)
      ).toBeInTheDocument()
    );
    expect(calls['addMusicTogetherDemoRsvp']).toBeUndefined();
  });

  it('shows a "coming soon" state when no slots are configured', () => {
    render(<MusicTogetherDemoWidget env="dev" />);
    expect(
      screen.getByText(/Demo dates coming soon — check back!/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /reserve my spot/i })
    ).toBeNull();
  });
});
