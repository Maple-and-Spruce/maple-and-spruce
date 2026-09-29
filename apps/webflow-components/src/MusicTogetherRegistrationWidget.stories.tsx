import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { MusicTogetherRegistrationWidget } from './MusicTogetherRegistrationWidget';

/**
 * Real-browser coverage for the discount-code affordance (legacy #791 pilot half-off).
 *
 * The jsdom spec already proves the arithmetic. What only a browser can show is
 * that the code row and the applied-code chip actually LAY OUT next to the
 * tuition options in the widget families see, and that the plan labels re-render
 * with both the discounted amount and the struck price.
 *
 * ## How this runs without Firebase
 *
 * Mirrors `MusicTogetherDemoWidget.stories.tsx`: the widget builds its own
 * Functions client from `env`, so there is no injection seam — the stub goes on
 * `window.fetch`, the layer the callable protocol crosses (`{data: …}` in,
 * `{data: …}` out). `env="emulator"` points the client at 127.0.0.1 as well, so
 * a story can never reach a real project even if the stub were bypassed.
 *
 * The Square card form needs an application id it can't get here, so the card
 * area renders its own error; everything above it — which is what these stories
 * assert — renders normally.
 *
 * ## App Check
 *
 * The decorator sets `__MAPLE_APP_CHECK_TEST_TOKEN__`, so `firebase-init` starts
 * App Check with a fixed token instead of reCAPTCHA. The fetch stub records the
 * headers each lookup arrived with, which lets a story prove the token actually
 * rides on the callable request (ADR-034).
 */

const STORY_APP_CHECK_TOKEN = 'story-app-check-token';

const SECTION = {
  id: 'sec-thu',
  name: 'Thursday Morning — Mixed Age (0–5)',
  sessions: [{ dateTime: '2030-09-10T14:00:00.000Z' }],
  priceFullCents: 25200,
  installmentPlan: [
    { amountCents: 13200, dueAt: '2030-09-10T14:00:00.000Z' },
    { amountCents: 13200, dueAt: '2030-10-08T14:00:00.000Z' },
  ],
  capacityFamilies: 8,
  spotsRemaining: 5,
  enrollmentOpen: true,
};

const PILOT_DISCOUNT = {
  id: 'disc-1',
  code: 'PILOTCLASS',
  description: 'Pilot semester — half off',
  type: 'percent',
  percent: 50,
  status: 'active',
  appliesTo: 'order',
  nthSlot: 1,
  usageLimit: null,
  usageCount: 0,
};

/** Headers of every non-warmup `lookupDiscount` call, oldest first. */
const lookupHeaders: Headers[] = [];

/** Stub the callable transport. `PILOTCLASS` is the only code that resolves. */
function installStubs(): void {
  (window as { __mtPixelInitialized?: boolean }).__mtPixelInitialized = true;
  (
    globalThis as { __MAPLE_APP_CHECK_TEST_TOKEN__?: string }
  ).__MAPLE_APP_CHECK_TEST_TOKEN__ = STORY_APP_CHECK_TOKEN;

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    if (url.includes('getPublicMusicTogetherSection')) {
      return json({ data: { section: SECTION } });
    }
    if (url.includes('lookupDiscount')) {
      const sent = JSON.parse(String(init?.body ?? '{}')) as {
        data?: { code?: string; __warmup?: boolean };
      };
      // The widget warms this callable on mount; that ping isn't a lookup.
      if (sent.data?.__warmup) return json({ data: { warm: true } });
      lookupHeaders.push(new Headers(init?.headers));
      return json({
        data: {
          discount:
            sent.data?.code?.toUpperCase() === 'PILOTCLASS'
              ? PILOT_DISCOUNT
              : undefined,
        },
      });
    }
    return json({ data: {} });
  }) as typeof window.fetch;
}

const meta: Meta<typeof MusicTogetherRegistrationWidget> = {
  title: 'Webflow/MusicTogetherRegistrationWidget',
  component: MusicTogetherRegistrationWidget,
  parameters: { layout: 'padded', a11y: { disable: true } },
  args: {
    sectionId: 'sec-thu',
    squareAppId: 'sandbox-app',
    squareLocationId: 'LOC1',
    // `emulator` keeps the Functions client on localhost — belt and braces on
    // top of the fetch stub.
    env: 'emulator',
    policiesUrl: 'https://example.com/music-together/policies',
  },
  decorators: [
    (Story) => {
      installStubs();
      return <Story />;
    },
  ],
};
export default meta;

type Story = StoryObj<typeof MusicTogetherRegistrationWidget>;

/** The form as a family first sees it: full price, empty code field. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('radio', { name: /Pay in full — \$252\.00/i });
    await expect(canvas.getByLabelText(/Discount code/i)).toBeInTheDocument();
  },
};

/**
 * Applying `PILOTCLASS` halves every amount and says so. The struck prices are
 * the point: a family should be able to see what the code did, not just what
 * they now owe.
 */
export const AppliesTheHalfOffCode: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('radio', { name: /Pay in full — \$252\.00/i });

    await userEvent.type(
      canvas.getByLabelText(/Discount code/i),
      'PILOTCLASS'
    );
    await userEvent.click(canvas.getByRole('button', { name: /^Apply$/i }));

    // The chip replaces the input, and both plans re-render halved.
    await canvas.findByText('PILOTCLASS applied');
    await expect(
      canvas.getByRole('radio', {
        name: /Pay in full — \$126\.00 \(was \$252\.00\)/i,
      })
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('radio', {
        name: /\$66\.00 now, \$66\.00 on .* \(was \$132\.00 each\)/i,
      })
    ).toBeInTheDocument();
    // The scheduled Week-5 charge is discounted too — say it in words, since
    // that is the part a family can't verify at checkout.
    await expect(
      canvas.getByText(/including the second installment/i)
    ).toBeInTheDocument();

    // The lookup went out carrying the App Check token.
    await expect(lookupHeaders.at(-1)?.get('X-Firebase-AppCheck')).toBe(
      STORY_APP_CHECK_TOKEN
    );
  },
};

/** An unknown code is refused inline and leaves the price untouched. */
export const RejectsAnUnknownCode: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('radio', { name: /Pay in full — \$252\.00/i });

    await userEvent.type(canvas.getByLabelText(/Discount code/i), 'NOPE');
    await userEvent.click(canvas.getByRole('button', { name: /^Apply$/i }));

    await canvas.findByText(/isn't a valid code/i);
    await expect(
      canvas.getByRole('radio', { name: /Pay in full — \$252\.00/i })
    ).toBeInTheDocument();
  },
};
