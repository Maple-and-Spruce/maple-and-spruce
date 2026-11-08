import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { GiftCardWidget } from './GiftCardWidget';

/**
 * The gift card buy page (#300), driven end to end in a real browser.
 *
 * ## How this runs without Firebase or Square
 *
 * As in the other widget stories, the callable transport is stubbed on
 * `window.fetch` (`{data: …}` in, `{data: …}` out) and `env="emulator"` keeps
 * the client on localhost. The Square Web Payments SDK is replaced by a tiny
 * fake on `window.Square` whose card always tokenizes to `cnon:story-nonce`, so
 * the Pay button works and a story can follow the whole purchase. The fake is
 * removed after each story so other stories see the real "no Square" state.
 *
 * The server side (order, payment, activation, refund) is covered by
 * `apps/functions-integration-tests-square/src/purchase-gift-card.spec.ts`.
 */

const STORY_APP_CHECK_TOKEN = 'story-app-check-token';
const CODE = '7783320000004242';

const POTTERY_CLASS = {
  id: 'class-wheel',
  name: 'Beginner Wheel',
  slug: 'beginner-wheel',
  description: 'Center and throw your first cylinder.',
  sessions: [{ dateTime: '2030-05-14T22:00:00.000Z' }],
  durationMinutes: 120,
  capacity: 6,
  spotsRemaining: 4,
  priceCents: 6500,
  categoryId: 'cat-pottery',
  categoryName: 'Pottery',
  skillLevel: 'beginner',
};

type ClassReply = 'ok' | 'error' | 'never' | 'private-hours';
type PurchaseReply = 'ok' | 'declined';

/** Bodies of every non-warmup purchase call, oldest first. */
let purchaseBodies: Array<Record<string, unknown>> = [];
let warmups = 0;

function installStubs(classReply: ClassReply, purchaseReply: PurchaseReply): void {
  purchaseBodies = [];
  warmups = 0;
  (globalThis as { __MAPLE_APP_CHECK_TEST_TOKEN__?: string }).__MAPLE_APP_CHECK_TEST_TOKEN__ =
    STORY_APP_CHECK_TOKEN;

  // A Square SDK whose card field is a plain box and always tokenizes.
  (window as unknown as { Square: unknown }).Square = {
    payments: async () => ({
      card: async () => ({
        attach: async (target: HTMLElement) => {
          target.textContent = 'Card number (story)';
        },
        tokenize: async () => ({ status: 'OK', token: 'cnon:story-nonce' }),
        destroy: async () => undefined,
      }),
      paymentRequest: () => ({}),
      googlePay: async () => {
        throw new Error('not in stories');
      },
      verifyBuyer: async () => ({ token: 'verf' }),
    }),
  };

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    const sent = JSON.parse(String(init?.body ?? '{}')) as {
      data?: Record<string, unknown>;
    };

    if (url.includes('getPublicClass')) {
      if (classReply === 'never') return new Promise<Response>(() => undefined);
      if (classReply === 'error') {
        return json({ error: { message: 'Unavailable', status: 'UNAVAILABLE' } }, 503);
      }
      const cls =
        classReply === 'private-hours'
          ? { ...POTTERY_CLASS, format: 'privateHours' }
          : POTTERY_CLASS;
      return json({ data: { class: cls } });
    }
    if (url.includes('purchaseGiftCard')) {
      if (sent.data?.['__warmup']) {
        warmups++;
        return json({ data: { warm: true } });
      }
      purchaseBodies.push(sent.data ?? {});
      if (purchaseReply === 'declined') {
        return json(
          {
            error: {
              message: 'Your card was declined. Please try a different card.',
              status: 'INVALID_ARGUMENT',
            },
          },
          400
        );
      }
      const data = sent.data ?? {};
      const isClass = data['kind'] === 'class';
      const toThem = data['deliverTo'] === 'recipient';
      return json({
        data: {
          giftCardId: 'gftc:story-1',
          last4: CODE.slice(-4),
          kind: data['kind'],
          valueCents: isClass ? POTTERY_CLASS.priceCents : data['amountCents'],
          className: isClass ? POTTERY_CLASS.name : undefined,
          deliverTo: data['deliverTo'],
          sentTo: toThem ? data['recipientEmail'] : data['buyerEmail'],
        },
      });
    }
    return json({ data: {} });
  }) as typeof window.fetch;
}

function setGiftClassParam(id: string | undefined): void {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('giftClass', id);
  else url.searchParams.delete('giftClass');
  window.history.replaceState(window.history.state, '', url);
}

type StoryParameters = {
  giftClass?: string;
  classReply?: ClassReply;
  purchaseReply?: PurchaseReply;
};

const meta: Meta<typeof GiftCardWidget> = {
  title: 'Webflow/GiftCardWidget',
  component: GiftCardWidget,
  parameters: { layout: 'padded', a11y: { disable: true } },
  args: {
    squareAppId: 'sandbox-sq0idb-story',
    squareLocationId: 'LOC1',
    env: 'emulator',
  },
  beforeEach: (context) => {
    const params = context.parameters as StoryParameters;
    setGiftClassParam(params.giftClass);
    installStubs(params.classReply ?? 'ok', params.purchaseReply ?? 'ok');
    return () => {
      delete (window as unknown as { Square?: unknown }).Square;
      setGiftClassParam(undefined);
    };
  },
};
export default meta;

type Story = StoryObj<typeof GiftCardWidget>;

async function fill(canvas: ReturnType<typeof within>, label: RegExp, value: string) {
  const field = canvas.getByLabelText(label);
  await userEvent.clear(field);
  await userEvent.type(field, value);
}

async function payButton(canvasElement: HTMLElement): Promise<HTMLButtonElement> {
  const page = within(canvasElement.ownerDocument.body);
  const button = (await page.findByRole('button', { name: /Buy gift card/ })) as HTMLButtonElement;
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

/**
 * The main flow: $100, emailed to the recipient. The browser gets back the
 * last 4 digits and never the full code.
 */
export const AmountEmailedToThem: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Opening the page wakes the purchase route.
    await waitFor(() => expect(warmups).toBeGreaterThan(0));
    // $50 is the default choice.
    await expect(canvas.getByRole('button', { name: '$50' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(canvas.getByRole('button', { name: '$100' }));
    await fill(canvas, /Their name/, 'Olive Thompson');
    await fill(canvas, /Their email/, 'olive@example.com');
    await fill(canvas, /Your name/, 'Robin Ashfield');
    await fill(canvas, /Your email/, 'robin@example.com');
    await fill(canvas, /Message/, 'Happy birthday!');

    const button = await payButton(canvasElement);
    await expect(button).toHaveTextContent('Buy gift card: $100');
    await userEvent.click(button);

    await canvas.findByText('Your gift card is on its way');
    await expect(canvas.getByText('4242')).toBeInTheDocument();
    await expect(canvas.getByText(/We emailed it to olive@example\.com/)).toBeInTheDocument();
    await expect(canvasElement.textContent).not.toContain(CODE);

    await expect(purchaseBodies).toHaveLength(1);
    await expect(purchaseBodies[0]).toMatchObject({
      kind: 'amount',
      amountCents: 10000,
      buyerName: 'Robin Ashfield',
      buyerEmail: 'robin@example.com',
      recipientName: 'Olive Thompson',
      recipientEmail: 'olive@example.com',
      message: 'Happy birthday!',
      deliverTo: 'recipient',
      sourceId: 'cnon:story-nonce',
    });
    await expect(String(purchaseBodies[0]['idempotencyKey'])).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  },
};

/** "Me, so I can print it": their email becomes optional. */
export const ForMeToPrint: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Other amount' }));
    await fill(canvas, /Amount in dollars/, '35');
    await userEvent.click(canvas.getByLabelText('Me, so I can print it'));
    await fill(canvas, /Their name/, 'Olive Thompson');
    await fill(canvas, /Your name/, 'Robin Ashfield');
    await fill(canvas, /Your email/, 'robin@example.com');

    await userEvent.click(await payButton(canvasElement));

    await canvas.findByText('Your gift card is ready');
    await expect(canvas.getByText(/Print the email or write the code on a card/)).toBeInTheDocument();
    await expect(purchaseBodies[0]).toMatchObject({
      kind: 'amount',
      amountCents: 3500,
      deliverTo: 'buyer',
    });
    await expect(purchaseBodies[0]).not.toHaveProperty('recipientEmail');
  },
};

/** `?giftClass=` preselects "A class" with the class's name and price. */
export const ClassFromLink: Story = {
  parameters: { giftClass: POTTERY_CLASS.id },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Beginner Wheel');
    await expect(canvas.getByRole('button', { name: 'A class' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByText(/Good for this class or any Pottery class/)).toBeInTheDocument();

    await fill(canvas, /Their name/, 'Olive Thompson');
    await fill(canvas, /Their email/, 'olive@example.com');
    await fill(canvas, /Your name/, 'Robin Ashfield');
    await fill(canvas, /Your email/, 'robin@example.com');

    const button = await payButton(canvasElement);
    await expect(button).toHaveTextContent('Buy gift card: $65');
    await userEvent.click(button);

    await canvas.findByText('Your gift card is on its way');
    await expect(purchaseBodies[0]).toMatchObject({ kind: 'class', classId: POTTERY_CLASS.id });
    await expect(purchaseBodies[0]).not.toHaveProperty('amountCents');
  },
};

/** While the class loads, its place holds a skeleton, not "no class". */
export const ClassLoading: Story = {
  parameters: { giftClass: POTTERY_CLASS.id, classReply: 'never' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByLabelText('Loading the class')).toHaveAttribute('aria-busy', 'true');
    await expect(canvas.queryByRole('button', { name: 'A class' })).toBeNull();
    await expect(canvas.queryByText(/could not load that class/)).toBeNull();
  },
};

/** The class read fails: say so, and the amounts still work. */
export const ClassLoadFails: Story = {
  parameters: { giftClass: POTTERY_CLASS.id, classReply: 'error' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/could not load that class right now/);
    await expect(canvas.queryByRole('button', { name: 'A class' })).toBeNull();
    await expect(canvas.getByRole('button', { name: '$50' })).toHaveAttribute('aria-pressed', 'true');
  },
};

/** A private-hours class cannot be a gift certificate. */
export const ClassNotGiftable: Story = {
  parameters: { giftClass: POTTERY_CLASS.id, classReply: 'private-hours' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/cannot be given as a gift certificate/);
    await expect(canvas.queryByRole('button', { name: 'A class' })).toBeNull();
  },
};

/** Pay with the form half filled: field messages, and no call to the server. */
export const MissingDetails: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Other amount' }));
    await fill(canvas, /Amount in dollars/, '600');
    await fill(canvas, /Your email/, 'not-an-email');

    await userEvent.click(await payButton(canvasElement));

    await canvas.findByText('Please check the highlighted fields.');
    await expect(canvas.getByText('Your name is required')).toBeInTheDocument();
    await expect(canvas.getByText('Enter a valid email address')).toBeInTheDocument();
    await expect(canvas.getByText('Their email is required to send it to them')).toBeInTheDocument();
    await expect(canvas.getByText(/Choose a whole-dollar amount from \$10 to \$500/)).toBeInTheDocument();
    await expect(purchaseBodies).toHaveLength(0);
  },
};

/** A declined card: the message, the form still filled in, ready to retry. */
export const CardDeclined: Story = {
  parameters: { purchaseReply: 'declined' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await fill(canvas, /Their name/, 'Olive Thompson');
    await fill(canvas, /Their email/, 'olive@example.com');
    await fill(canvas, /Your name/, 'Robin Ashfield');
    await fill(canvas, /Your email/, 'robin@example.com');

    await userEvent.click(await payButton(canvasElement));

    await waitFor(() => expect(purchaseBodies).toHaveLength(1), { timeout: 5000 });
    await canvas.findByText(/Your card was declined/, undefined, { timeout: 5000 });
    await expect(canvas.getByLabelText(/Your name/)).toHaveValue('Robin Ashfield');
    await expect(canvas.queryByText('Your gift card is on its way')).toBeNull();

    // A retry goes out under a new key.
    await userEvent.click(await payButton(canvasElement));
    await waitFor(() => expect(purchaseBodies).toHaveLength(2));
    await expect(purchaseBodies[1]['idempotencyKey']).not.toBe(purchaseBodies[0]['idempotencyKey']);
  },
};
