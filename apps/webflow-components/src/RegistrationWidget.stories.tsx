import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import type { GetRegistrationStatusResponse } from '@maple/ts/firebase/api-types';
import { RegistrationWidget } from './RegistrationWidget';

/**
 * The page a buyer lands on after paying on Square's hosted checkout.
 *
 * Square sends them back to the class page with `?reg=<registrationId>`. The
 * widget must not trust that param: it asks `publicSite/getRegistrationStatus`,
 * and only a `confirmed` answer earns the "You're Registered!" screen. While the
 * payment webhook is still on its way it says so, and if the lookup fails it
 * falls back to the normal form rather than a dead end.
 *
 * This is the rarest path a family takes (only when the in-page card form can't
 * start), so it is the one most likely to break unnoticed. The server side of
 * it — link, webhook, confirmation — is the emulator test "D: hosted checkout"
 * in `functions-integration-tests-class-square`.
 *
 * ## How this runs without Firebase
 *
 * As in the other widget stories, the stub sits on `window.fetch`, the layer
 * the callable protocol crosses, and `env="emulator"` keeps the client on
 * localhost. `?reg=` is set on the story frame's URL before the widget mounts,
 * and removed again for stories that don't want it.
 */

const CLASS = {
  id: 'class-hosted',
  name: 'Stained Glass Suncatchers',
  slug: 'stained-glass-suncatchers',
  description: 'Cut, foil and solder a suncatcher to take home.',
  sessions: [{ dateTime: '2030-05-14T22:00:00.000Z' }],
  durationMinutes: 180,
  capacity: 8,
  spotsRemaining: 5,
  priceCents: 6000,
  skillLevel: 'all-levels',
  location: 'Maple & Spruce',
};

const CONFIRMED: GetRegistrationStatusResponse = {
  status: 'confirmed',
  confirmation: {
    confirmationNumber: 'MS-HOSTED1',
    className: CLASS.name,
    customerName: 'Robin Ashfield',
    customerEmail: 'robin@example.com',
    quantity: 1,
    pricePaidCents: 6360,
  },
};

/** What `getRegistrationStatus` answers, in order; the last one repeats. */
let statusReplies: Array<GetRegistrationStatusResponse | 'error'> = [];
let statusCalls = 0;

function setReturnParam(reg: string | undefined): void {
  const url = new URL(window.location.href);
  if (reg) url.searchParams.set('reg', reg);
  else url.searchParams.delete('reg');
  window.history.replaceState(window.history.state, '', url);
}

function installStubs(): void {
  statusCalls = 0;
  window.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    if (url.includes('getPublicClass')) {
      return json({ data: { class: CLASS } });
    }
    if (url.includes('getRequiredAgreementsForClass')) {
      return json({ data: { agreements: [] } });
    }
    if (url.includes('getRegistrationStatus')) {
      const reply =
        statusReplies[Math.min(statusCalls, statusReplies.length - 1)];
      statusCalls++;
      if (reply === 'error') {
        return json(
          { error: { message: 'Unavailable', status: 'UNAVAILABLE' } },
          503,
        );
      }
      return json({ data: reply });
    }
    if (url.includes('calculateRegistrationCost')) {
      return json({
        data: {
          quantity: 1,
          pricePerItemCents: 6000,
          originalCostCents: 6000,
          discountAmountCents: 0,
          finalCostCents: 6000,
          taxRatePercent: 6,
          taxAmountCents: 360,
          totalCents: 6360,
        },
      });
    }
    return json({ data: {} });
  }) as typeof window.fetch;
}

type ReturnParameters = {
  /** `?reg=` on the frame URL, or none. */
  reg?: string;
  /** `getRegistrationStatus` replies, in order. */
  statusReplies?: Array<GetRegistrationStatusResponse | 'error'>;
};

const meta: Meta<typeof RegistrationWidget> = {
  title: 'Webflow/RegistrationWidget/Hosted checkout return',
  component: RegistrationWidget,
  parameters: { layout: 'padded', a11y: { disable: true } },
  args: {
    classId: CLASS.id,
    squareAppId: 'sandbox-app',
    squareLocationId: 'LOC1',
    env: 'emulator',
  },
  decorators: [
    (Story, context) => {
      const params = context.parameters as ReturnParameters;
      statusReplies = params.statusReplies ?? [{ status: 'not-found' }];
      setReturnParam(params.reg);
      installStubs();
      return <Story />;
    },
  ],
};
export default meta;

type Story = StoryObj<typeof RegistrationWidget>;

/** The webhook beat the buyer back: straight to the confirmation. */
export const Confirmed: Story = {
  parameters: { reg: 'reg-hosted-1', statusReplies: [CONFIRMED] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("You're Registered!");
    await expect(canvas.getByText(/MS-HOSTED1/)).toBeInTheDocument();
    await expect(canvas.getByText(/robin@example\.com/)).toBeInTheDocument();
    // A buyer who has paid must not be offered the form again.
    await expect(canvas.queryByText(/Your Information/)).toBeNull();
  },
};

/**
 * The buyer is back before Square's webhook: "Confirming your payment…", then
 * the confirmation once the next poll sees it.
 */
export const ConfirmingThenConfirmed: Story = {
  parameters: {
    reg: 'reg-hosted-2',
    statusReplies: [{ status: 'pending' }, CONFIRMED],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Confirming your payment…');
    await expect(canvas.queryByText(/Your Information/)).toBeNull();
    // The widget polls every 3s.
    await canvas.findByText("You're Registered!", undefined, {
      timeout: 8000,
    });
  },
};

/**
 * The lookup itself fails. The param proves nothing, so the buyer gets the
 * normal form rather than a confirmation that may not be true, or a dead end.
 */
export const LookupFailsFallsBackToForm: Story = {
  parameters: { reg: 'reg-hosted-3', statusReplies: ['error'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/Your Information/);
    await expect(canvas.queryByText("You're Registered!")).toBeNull();
  },
};

/** A `?reg=` for a registration that isn't paid (or doesn't exist): the form. */
export const UnknownRegistrationShowsForm: Story = {
  parameters: { reg: 'reg-unknown', statusReplies: [{ status: 'not-found' }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/Your Information/);
    await expect(canvas.queryByText("You're Registered!")).toBeNull();
  },
};
