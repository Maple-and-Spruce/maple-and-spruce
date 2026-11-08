import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { GiftCardWidget } from './GiftCardWidget';

/**
 * The gift card buy page (#300, #309), driven end to end in a real browser.
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

const DEFAULT_AMOUNTS = { presetCents: [2500, 5000, 10000], minCents: 1000, maxCents: 50000 };
const CLASS_TYPES = [
  {
    id: 'cat-pottery',
    name: 'Pottery',
    priceCents: 7000,
    imageUrl:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" fill="%236B7B5E"/></svg>',
    imageAlt: 'A glazed bowl',
  },
  { id: 'cat-weaving', name: 'Weaving', priceCents: 4500 },
];

/** How `publicSite/getGiftCardOptions` answers. */
type OptionsReply = 'ok' | 'no-types' | 'one-type' | 'custom-amounts' | 'error' | 'never';
/** How `publicSite/getPublicClass` answers for a class link. */
type ClassReply = 'ok' | 'type-off' | 'error' | 'never';
type PurchaseReply = 'ok' | 'declined';

function optionsFor(reply: OptionsReply) {
  switch (reply) {
    case 'no-types':
      return { amounts: DEFAULT_AMOUNTS, classTypes: [] };
    case 'one-type':
      return { amounts: DEFAULT_AMOUNTS, classTypes: [CLASS_TYPES[1]] };
    case 'custom-amounts':
      return {
        amounts: { presetCents: [2000, 7500], minCents: 500, maxCents: 100000 },
        classTypes: CLASS_TYPES,
      };
    default:
      return { amounts: DEFAULT_AMOUNTS, classTypes: CLASS_TYPES };
  }
}

/** Bodies of every non-warmup purchase call, oldest first. */
let purchaseBodies: Array<Record<string, unknown>> = [];
let warmups = 0;

let optionsCalls = 0;

function installStubs(
  optionsReply: OptionsReply,
  classReply: ClassReply,
  purchaseReply: PurchaseReply
): void {
  optionsCalls = 0;
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

    if (url.includes('getGiftCardOptions')) {
      optionsCalls++;
      if (optionsReply === 'never') return new Promise<Response>(() => undefined);
      if (optionsReply === 'error' && optionsCalls === 1) {
        return json({ error: { message: 'Unavailable', status: 'UNAVAILABLE' } }, 503);
      }
      return json({ data: optionsFor(optionsReply) });
    }
    if (url.includes('getPublicClass')) {
      if (classReply === 'never') return new Promise<Response>(() => undefined);
      if (classReply === 'error') {
        return json({ error: { message: 'Unavailable', status: 'UNAVAILABLE' } }, 503);
      }
      const cls =
        classReply === 'type-off'
          ? { ...POTTERY_CLASS, categoryId: 'cat-woodworking', categoryName: 'Woodworking' }
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
      const type = CLASS_TYPES.find((t) => t.id === data['classCategoryId']);
      const toThem = data['deliverTo'] === 'recipient';
      return json({
        data: {
          giftCardId: 'gftc:story-1',
          last4: CODE.slice(-4),
          kind: data['kind'],
          valueCents: isClass ? type?.priceCents : data['amountCents'],
          className: isClass ? type?.name : undefined,
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
  optionsReply?: OptionsReply;
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
    installStubs(params.optionsReply ?? 'ok', params.classReply ?? 'ok', params.purchaseReply ?? 'ok');
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

/** The options load before the amounts appear. */
async function amountButton(canvas: ReturnType<typeof within>, name: string) {
  return canvas.findByRole('button', { name });
}

async function fillPeople(canvas: ReturnType<typeof within>) {
  await fill(canvas, /Their name/, 'Olive Thompson');
  await fill(canvas, /Their email/, 'olive@example.com');
  await fill(canvas, /Your name/, 'Robin Ashfield');
  await fill(canvas, /Your email/, 'robin@example.com');
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
    // The page heading, intro and fine print come from Webflow props.
    await expect(canvas.getByRole('heading', { level: 1, name: 'Give the gift of making' })).toBeInTheDocument();
    await expect(canvas.getByText(/good for handmade goods from local artists/)).toBeInTheDocument();
    await expect(canvas.getByText(/Gift cards never expire/)).toBeInTheDocument();
    // $50, the middle amount, is the default choice.
    await expect(await amountButton(canvas, '$50')).toHaveAttribute('aria-pressed', 'true');

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
    // The heading stays; the intro and fine print go.
    await expect(canvas.getByRole('heading', { level: 1, name: 'Give the gift of making' })).toBeInTheDocument();
    await expect(canvas.queryByText(/good for handmade goods/)).toBeNull();
    await expect(canvas.queryByText(/Gift cards never expire/)).toBeNull();
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
    await userEvent.click(await amountButton(canvas, 'Other amount'));
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

/** Webflow props replace the heading, intro and fine print. */
export const CustomCopy: Story = {
  args: {
    heading: 'Gift cards for the holidays',
    intro: 'Give a class or a little something handmade.',
    finePrint: 'Good at the shop on High Street.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 1, name: 'Gift cards for the holidays' })).toBeInTheDocument();
    await expect(canvas.getByText('Give a class or a little something handmade.')).toBeInTheDocument();
    await expect(canvas.getByText('Good at the shop on High Street.')).toBeInTheDocument();
    await expect(canvas.queryByText(/Gift cards never expire/)).toBeNull();
  },
};

/** Katie's own amounts from Settings: the buttons and the custom range follow them. */
export const AmountsFromSettings: Story = {
  parameters: { optionsReply: 'custom-amounts' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await amountButton(canvas, '$75')).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: '$20' })).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: '$50' })).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: 'Other amount' }));
    await expect(canvas.getByText('Whole dollars, $5 to $1000')).toBeInTheDocument();
    await fill(canvas, /Amount in dollars/, '800');
    await fillPeople(canvas);
    const button = await payButton(canvasElement);
    await expect(button).toHaveTextContent('Buy gift card: $800');
    await userEvent.click(button);
    await canvas.findByText('Your gift card is on its way');
    await expect(purchaseBodies[0]).toMatchObject({ kind: 'amount', amountCents: 80000 });
  },
};

/** "A class" lists the switched-on class types with their prices. */
export const ClassTypePicker: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await amountButton(canvas, 'A class'));
    const pottery = canvas.getByRole('radio', { name: /Pottery/ });
    const weaving = canvas.getByRole('radio', { name: /Weaving/ });
    await expect(pottery).not.toBeChecked();
    await expect(weaving).not.toBeChecked();
    await expect(canvas.getByText('$70')).toBeInTheDocument();
    await expect(canvas.getByText('$45')).toBeInTheDocument();
    await expect(canvas.getByAltText('A glazed bowl')).toBeInTheDocument();

    await userEvent.click(weaving);
    await expect(canvas.getByText(/Good for one Weaving class/)).toBeInTheDocument();
    await fillPeople(canvas);
    const button = await payButton(canvasElement);
    await expect(button).toHaveTextContent('Buy gift card: $45');
    await userEvent.click(button);

    await canvas.findByText('Your gift card is on its way');
    await expect(canvas.getByText(/One Weaving class gift card/)).toBeInTheDocument();
    await expect(purchaseBodies[0]).toMatchObject({ kind: 'class', classCategoryId: 'cat-weaving' });
    await expect(purchaseBodies[0]).not.toHaveProperty('classId');
    await expect(purchaseBodies[0]).not.toHaveProperty('amountCents');
  },
};

/** "A class" with no type chosen yet: nothing to pay for, so Pay stays off. */
export const ClassTypeRequired: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await amountButton(canvas, 'A class'));
    await fillPeople(canvas);
    // No type picked yet: the Pay button has no price to show and stays off.
    const button = (await within(canvasElement.ownerDocument.body).findByRole('button', {
      name: /Buy gift card/,
    })) as HTMLButtonElement;
    await expect(button).toBeDisabled();
    await expect(purchaseBodies).toHaveLength(0);
  },
};

/** With one type switched on, "A class" picks it straight away. */
export const OneClassType: Story = {
  parameters: { optionsReply: 'one-type' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await amountButton(canvas, 'A class'));
    await expect(canvas.getByRole('radio', { name: /Weaving/ })).toBeChecked();
    await expect(await payButton(canvasElement)).toHaveTextContent('Buy gift card: $45');
  },
};

/** No class types switched on: no "A class" at all. */
export const NoClassTypes: Story = {
  parameters: { optionsReply: 'no-types' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await amountButton(canvas, '$50');
    await expect(canvas.queryByRole('button', { name: 'A class' })).toBeNull();
  },
};

/** `?giftClass=` preselects that class's type when it is switched on. */
export const ClassLinkPreselectsType: Story = {
  parameters: { giftClass: POTTERY_CLASS.id },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await amountButton(canvas, 'A class')).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('radio', { name: /Pottery/ })).toBeChecked();
    await expect(canvas.getByText(/Good for one Pottery class/)).toBeInTheDocument();

    await fillPeople(canvas);
    const button = await payButton(canvasElement);
    await expect(button).toHaveTextContent('Buy gift card: $70');
    await userEvent.click(button);

    await canvas.findByText('Your gift card is on its way');
    await expect(purchaseBodies[0]).toMatchObject({
      kind: 'class',
      classCategoryId: 'cat-pottery',
      classId: POTTERY_CLASS.id,
    });
  },
};

/** A link to a class whose type is off opens the picker instead. */
export const ClassLinkTypeOff: Story = {
  parameters: { giftClass: POTTERY_CLASS.id, classReply: 'type-off' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await amountButton(canvas, 'A class')).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByText(/That class is not sold as a gift certificate, but these are/)).toBeInTheDocument();
    await expect(canvas.getByRole('radio', { name: /Pottery/ })).not.toBeChecked();
    await expect(canvas.getByRole('radio', { name: /Weaving/ })).not.toBeChecked();
  },
};

/** A class link that cannot be read still lands on the picker. */
export const ClassLinkLoadFails: Story = {
  parameters: { giftClass: POTTERY_CLASS.id, classReply: 'error' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await amountButton(canvas, 'A class')).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('radio', { name: /Weaving/ })).toBeInTheDocument();
  },
};

/** A class link when nothing is switched on: say so, and sell an amount. */
export const ClassLinkNoTypesOn: Story = {
  parameters: { giftClass: POTTERY_CLASS.id, optionsReply: 'no-types' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/cannot be given as a gift certificate/);
    await expect(canvas.queryByRole('button', { name: 'A class' })).toBeNull();
    await expect(canvas.getByRole('button', { name: '$50' })).toHaveAttribute('aria-pressed', 'true');
  },
};

/** While the options load, the choices hold a skeleton, not "nothing to buy". */
export const OptionsLoading: Story = {
  parameters: { optionsReply: 'never' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByLabelText('Loading gift card options')).toHaveAttribute('aria-busy', 'true');
    await expect(canvas.queryByRole('button', { name: 'Other amount' })).toBeNull();
    await expect(canvas.queryByText(/could not load/)).toBeNull();
  },
};

/** The class link is still loading: the choices wait for it too. */
export const ClassLinkLoading: Story = {
  parameters: { giftClass: POTTERY_CLASS.id, classReply: 'never' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByLabelText('Loading gift card options')).toHaveAttribute('aria-busy', 'true');
    await expect(canvas.queryByRole('button', { name: 'A class' })).toBeNull();
  },
};

/** The options fail to load: an error and a way to retry, not an empty form. */
export const OptionsLoadFails: Story = {
  parameters: { optionsReply: 'error' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/We could not load the gift card options/);
    await expect(canvas.getByRole('heading', { level: 1 })).toBeInTheDocument();
    await expect(canvas.queryByLabelText(/Your name/)).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }));
    await expect(await amountButton(canvas, '$50')).toBeInTheDocument();
    await expect(optionsCalls).toBe(2);
  },
};

/** Pay with the form half filled: field messages, and no call to the server. */
export const MissingDetails: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await amountButton(canvas, 'Other amount'));
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
    await amountButton(canvas, '$50');
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
