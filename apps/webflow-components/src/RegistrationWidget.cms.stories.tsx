import type { Meta, StoryObj } from '@storybook/react';
import { expect, waitFor, within } from 'storybook/test';
import { RegistrationWidget } from './RegistrationWidget';

/**
 * First paint from Webflow CMS (`Data Source: cms`).
 *
 * On the class template page the widget's CMS props are bound to the class's
 * `name`, `price-cents` and `spots-remaining` fields, so the form can render
 * from the served HTML without waiting on a Cloud Function (a cold
 * `maple-core` start is ~6s). The live read still runs, in the background, and
 * replaces the CMS numbers when it lands. Agreements load in the background
 * too; Pay stays disabled until they are known.
 *
 * ## How this runs without Firebase
 *
 * As in the hosted-checkout stories, the stub sits on `window.fetch`. Each
 * story sets how long the live reads take, so the form provably appears
 * before they answer.
 */

const CLASS = {
  id: 'class-cms',
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

const WAIVER = {
  templateId: 'tmpl-glass',
  templateName: 'Studio Safety Waiver',
  sections: [{ id: 'safety', title: 'Safety', content: '<p>Glass is sharp.</p>' }],
  supportsMinor: false,
};

type CmsParameters = {
  /** ms before getPublicClass answers; `null` never answers. */
  classDelayMs?: number | null;
  /** Spots remaining in the live reply. */
  liveSpots?: number;
  /** ms before getRequiredAgreementsForClass answers. */
  agreementsDelayMs?: number;
  agreements?: unknown[];
};

let classCalls = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function installStubs(params: CmsParameters): void {
  classCalls = 0;
  window.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    if (url.includes('getPublicClass')) {
      classCalls++;
      if (params.classDelayMs === null) return new Promise<Response>(() => {});
      await sleep(params.classDelayMs ?? 0);
      return json({
        data: {
          class: { ...CLASS, spotsRemaining: params.liveSpots ?? 5 },
        },
      });
    }
    if (url.includes('getRequiredAgreementsForClass')) {
      await sleep(params.agreementsDelayMs ?? 0);
      return json({ data: { agreements: params.agreements ?? [] } });
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

const meta: Meta<typeof RegistrationWidget> = {
  title: 'Webflow/RegistrationWidget/CMS first paint',
  component: RegistrationWidget,
  parameters: { layout: 'padded', a11y: { disable: true } },
  args: {
    classId: CLASS.id,
    squareAppId: 'sandbox-app',
    squareLocationId: 'LOC1',
    env: 'emulator',
    dataSource: 'cms',
    cmsClassName: CLASS.name,
    cmsPriceCents: CLASS.priceCents,
    cmsSpotsRemaining: 3,
  },
  decorators: [
    (Story, context) => {
      const url = new URL(window.location.href);
      url.searchParams.delete('reg');
      window.history.replaceState(window.history.state, '', url);
      installStubs(context.parameters as CmsParameters);
      return <Story />;
    },
  ],
};
export default meta;

type Story = StoryObj<typeof RegistrationWidget>;

/**
 * The live read never answers (a cold start, or worse) and the form is there
 * anyway, from the CMS props.
 */
export const RendersBeforeLiveRead: Story = {
  parameters: { classDelayMs: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/Your Information/, undefined, { timeout: 1000 });
    await expect(canvas.getByText(/3 spots available/)).toBeInTheDocument();
    await expect(classCalls).toBe(1);
  },
};

/** The live read lands and corrects the CMS spot count. */
export const LiveReadReplacesCmsCount: Story = {
  parameters: { classDelayMs: 300, liveSpots: 2 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/3 spots available/);
    await canvas.findByText(/2 spots available/, undefined, { timeout: 3000 });
  },
};

/** The live read says the class filled up since the last sync: waitlist. */
export const LiveReadSaysFull: Story = {
  parameters: { classDelayMs: 300, liveSpots: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/Your Information/);
    await canvas.findByRole(
      'button',
      { name: /Join waitlist/ },
      { timeout: 3000 }
    );
    await expect(canvas.queryByText(/Your Information/)).toBeNull();
  },
};

/**
 * Agreements arrive after the form: a placeholder first, then the waiver to
 * sign. Pay is never offered before it is known whether there is one.
 */
export const WaiverArrivesAfterForm: Story = {
  parameters: { agreementsDelayMs: 800, agreements: [WAIVER] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/Your Information/);
    await expect(canvas.getByTestId('agreements-loading')).toBeInTheDocument();
    await canvas.findByText(/Sign Waiver/, undefined, { timeout: 3000 });
    await waitFor(() =>
      expect(canvas.queryByTestId('agreements-loading')).toBeNull()
    );
  },
};

/** Flag on but props unbound: behaves exactly like `live`. */
export const UnboundPropsFallBackToLive: Story = {
  args: { cmsPriceCents: -1 },
  parameters: { classDelayMs: 600 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText(/Your Information/)).toBeNull();
    await canvas.findByText(/Your Information/, undefined, { timeout: 3000 });
    await expect(canvas.getByText(/5 spots available/)).toBeInTheDocument();
  },
};
