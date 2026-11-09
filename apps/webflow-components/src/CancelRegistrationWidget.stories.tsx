import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { LookupRegistrationForCancellationResponse } from '@maple/ts/firebase/api-types';
import { CancelRegistrationWidget } from './CancelRegistrationWidget';

/**
 * The website's /cancel page.
 *
 * Before a class's free cancellation date (two weeks before it) a customer can
 * ask Katie to cancel. After it the page shows the class and how to reach Katie,
 * and says nothing about cancelling.
 *
 * As in the other widget stories, the stub sits on `window.fetch` and
 * `env="emulator"` keeps the client on localhost.
 */

const DEADLINE = '2030-04-30T22:00:00.000Z';

const BEFORE: LookupRegistrationForCancellationResponse = {
  found: true,
  className: 'Stained Glass Suncatchers',
  startsAt: '2030-05-14T22:00:00.000Z',
  freeCancellationUntil: DEADLINE,
  cancellationRequested: false,
};

const AFTER: LookupRegistrationForCancellationResponse = {
  found: true,
  className: 'Stained Glass Suncatchers',
  startsAt: '2030-05-14T22:00:00.000Z',
  cancellationRequested: false,
};

let lookupReply: LookupRegistrationForCancellationResponse = BEFORE;
let lastLookupBody: unknown;
let requestCalls = 0;

function installStubs(): void {
  requestCalls = 0;
  lastLookupBody = undefined;
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    if (url.includes('lookupRegistrationForCancellation')) {
      lastLookupBody = init?.body ? JSON.parse(String(init.body)) : undefined;
      return json({ data: lookupReply });
    }
    if (url.includes('requestRegistrationCancellation')) {
      requestCalls++;
      return json({
        data: { ok: true, freeCancellationUntil: DEADLINE },
      });
    }
    return json({ data: {} });
  }) as typeof window.fetch;
}

type Params = { lookupReply?: LookupRegistrationForCancellationResponse };

const meta: Meta<typeof CancelRegistrationWidget> = {
  title: 'Webflow/CancelRegistrationWidget',
  component: CancelRegistrationWidget,
  parameters: { layout: 'padded', a11y: { disable: true } },
  args: { env: 'emulator', confirmationNumber: 'ms-abc234' },
  decorators: [
    (Story, context) => {
      lookupReply = (context.parameters as Params).lookupReply ?? BEFORE;
      installStubs();
      return <Story />;
    },
  ],
};
export default meta;

type Story = StoryObj<typeof CancelRegistrationWidget>;

async function findRegistration(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.type(
    canvas.getByLabelText('Email you registered with'),
    'robin@example.com'
  );
  await userEvent.click(canvas.getByRole('button', { name: 'Find registration' }));
  return canvas;
}

/** Before the date: the deadline and a button that sends the request. */
export const BeforeDeadline: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await findRegistration(canvasElement);
    await canvas.findByText('Stained Glass Suncatchers');
    // The number from the link is tidied before it is sent.
    await expect(lastLookupBody).toEqual({
      data: { confirmationNumber: 'MS-ABC234', email: 'robin@example.com' },
    });
    await expect(
      canvas.getByText(/Free cancellation until Tue, Apr 30 at 6:00 PM/)
    ).toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Request cancellation' })
    );
    await canvas.findByText('Request sent');
    await waitFor(() => expect(requestCalls).toBe(1));
    await expect(
      canvas.getByText(/you will get a full refund for Stained Glass Suncatchers/)
    ).toBeInTheDocument();
  },
};

/** After the date: the class and Katie's contact, nothing about cancelling. */
export const AfterDeadline: Story = {
  parameters: { lookupReply: AFTER },
  play: async ({ canvasElement }) => {
    const canvas = await findRegistration(canvasElement);
    await canvas.findByText('Stained Glass Suncatchers');
    await expect(canvas.queryByTestId('free-cancellation-note')).toBeNull();
    await expect(
      canvas.queryByRole('button', { name: /cancel/i })
    ).toBeNull();
    await expect(canvas.queryByText(/cancel/i)).toBeNull();
    await expect(
      canvas.getByText(/Questions about your registration/)
    ).toBeInTheDocument();
  },
};

/** Already asked: says so, and offers no second button. */
export const AlreadyRequested: Story = {
  parameters: { lookupReply: { ...BEFORE, cancellationRequested: true } },
  play: async ({ canvasElement }) => {
    const canvas = await findRegistration(canvasElement);
    await canvas.findByText(/Your cancellation request is with Katie/);
    await expect(
      canvas.queryByRole('button', { name: 'Request cancellation' })
    ).toBeNull();
  },
};

/** No match: neutral, and a way back to the form. */
export const NotFound: Story = {
  parameters: { lookupReply: { found: false } },
  play: async ({ canvasElement }) => {
    const canvas = await findRegistration(canvasElement);
    await canvas.findByText(/couldn't find a registration/);
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }));
    await canvas.findByRole('button', { name: 'Find registration' });
  },
};
