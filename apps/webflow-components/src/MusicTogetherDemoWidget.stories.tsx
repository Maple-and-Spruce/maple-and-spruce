import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { MusicTogetherDemoWidget } from './MusicTogetherDemoWidget';

/**
 * Interaction coverage for the demo RSVP widget's ad tracking.
 *
 * The thing worth proving here is not that the form works — the jsdom spec
 * covers that — but that the REAL widget, rendered in a real browser, fires a
 * `Schedule` on the Music Together pixel carrying the `eventID` the server
 * returned. That id is the only thing stopping the browser event and the
 * server-side Conversions API `Schedule` (sent by `addMusicTogetherDemoRsvp`
 * in the same request) from being counted as two conversions.
 *
 * ## How this runs without Firebase
 *
 * The widget has no injection seam — it builds its own Functions client from
 * the `env` prop. So the story stubs `window.fetch` instead, which is the
 * layer the callable protocol actually crosses: request `{data: …}` in,
 * response `{data: …}` out. `env="emulator"` additionally points the client at
 * 127.0.0.1, so a story can never reach a real Firebase project even if the
 * stub were bypassed.
 *
 * `window.fbq` is stubbed the same way, standing in for fbevents.js, and the
 * calls it records are what the assertions read.
 */

interface FbqCall {
  args: unknown[];
}

interface StoryWindow extends Window {
  fbq?: (...args: unknown[]) => void;
  __storyFbqCalls__?: FbqCall[];
  __mtPixelInitialized__?: boolean;
  __mtPixelInitialized?: boolean;
}

/** The dedup key the server derives and returns; the widget must echo it. */
const SERVER_EVENT_ID = 'mt-demo-a1b2c3d4e5f60718';

const DEMO = {
  id: 'demo-1',
  dateTime: '2030-08-03T14:00:00.000Z',
  location: 'Morgantown Public Library',
  durationMinutes: 45,
  spotsRemaining: 3,
  isFull: false,
};

/**
 * Stub the callable transport + the Pixel, and reset the once-per-page pixel
 * init flag so every story run sees its own `init`.
 */
function installStubs(): void {
  const w = window as StoryWindow;

  w.__storyFbqCalls__ = [];
  w.fbq = (...args: unknown[]) => {
    w.__storyFbqCalls__?.push({ args });
  };
  // `ensureMusicTogetherPixel` memoizes on this flag.
  w.__mtPixelInitialized = false;

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    if (url.includes('getPublicMusicTogetherDemos')) {
      return json({ data: { demos: [DEMO] } });
    }
    if (url.includes('addMusicTogetherDemoRsvp')) {
      const sent = JSON.parse(String(init?.body ?? '{}')) as {
        data?: { __warmup?: boolean };
      };
      // The widget warms this callable on mount; that ping must not be
      // mistaken for an RSVP.
      if (sent.data?.__warmup) return json({ data: { warm: true } });
      return json({
        data: {
          added: true,
          status: 'confirmed',
          eventId: SERVER_EVENT_ID,
        },
      });
    }
    return json({ data: {} });
  }) as typeof window.fetch;
}

const meta: Meta<typeof MusicTogetherDemoWidget> = {
  title: 'Webflow/MusicTogetherDemoWidget',
  component: MusicTogetherDemoWidget,
  parameters: { layout: 'centered' },
  // `emulator` keeps the Functions client pointed at localhost — belt and
  // braces on top of the fetch stub.
  args: { env: 'emulator' },
  decorators: [
    (Story) => {
      installStubs();
      return <Story />;
    },
  ],
};
export default meta;

type Story = StoryObj<typeof MusicTogetherDemoWidget>;

/** The form as a family first sees it, with one demo to choose. */
export const Default: Story = {};

/**
 * Drives a full RSVP and asserts the Meta event that comes out of it.
 */
export const FiresScheduleWithServerEventId: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const w = window as StoryWindow;

    const option = await canvas.findByRole('radio', {
      name: /Morgantown Public Library/i,
    });
    await userEvent.click(option);

    await userEvent.type(canvas.getByLabelText(/Your name/i), 'Jamie Rivera');
    await userEvent.type(
      canvas.getByLabelText(/^Email/i),
      'jamie@example.com'
    );
    await userEvent.click(
      canvas.getByRole('button', { name: /reserve my spot/i })
    );

    await canvas.findByText(/You're in!/i);

    const calls = w.__storyFbqCalls__ ?? [];
    const schedule = calls.find((c) => c.args[2] === 'Schedule');
    await expect(schedule).toBeTruthy();

    // Addressed to ONE pixel. A bare `track` would broadcast to every
    // initialized pixel, filing an MT conversion into the Maple & Spruce
    // dataset and defeating the separate ad account.
    await expect(schedule?.args[0]).toBe('trackSingle');
    await expect(schedule?.args[1]).toBe('1562555242035326');

    await expect(schedule?.args[3]).toMatchObject({
      content_category: 'music_together_demo',
      content_ids: ['demo-1'],
      rsvp_status: 'confirmed',
    });

    // The whole point of this story: the id came from the server response and
    // reached fbq unchanged. Without it, this RSVP counts twice.
    await expect(schedule?.args[4]).toEqual({ eventID: SERVER_EVENT_ID });

    // And nothing was ever sent un-scoped.
    await expect(calls.some((c) => c.args[0] === 'track')).toBe(false);
  },
};
