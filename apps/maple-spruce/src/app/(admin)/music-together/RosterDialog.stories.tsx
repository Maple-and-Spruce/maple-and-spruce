import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent, waitFor } from 'storybook/test';
import type {
  MusicTogetherRegistration,
  MusicTogetherScheduledCharge,
} from '@maple/ts/domain';
import type { GetMusicTogetherRosterResponse } from '@maple/ts/firebase/api-types';
import { RosterDialog } from './RosterDialog';

function reg(
  over: Partial<MusicTogetherRegistration>
): MusicTogetherRegistration {
  return {
    id: 'reg-1',
    sectionId: 'sec-1',
    adultFirstName: 'Jamie',
    adultLastName: 'Rivera',
    parentNames: ['Jamie Rivera'],
    children: [{ name: 'Sky', dob: new Date('2023-04-01T00:00:00Z') }],
    email: 'jamie@example.com',
    phone: '304-555-1212',
    address: '123 Spruce St, Morgantown, WV',
    paymentPlan: 'installments',
    policiesAcceptedAt: new Date('2030-01-01T00:00:00Z'),
    pricePaidCents: 13200,
    squarePaymentId: 'pay-1',
    status: 'confirmed',
    createdAt: new Date('2030-01-01T00:00:00Z'),
    updatedAt: new Date('2030-01-01T00:00:00Z'),
    ...over,
  };
}

function charge(
  status: MusicTogetherScheduledCharge['status']
): MusicTogetherScheduledCharge {
  return {
    id: `chg-${status}`,
    registrationId: 'reg-1',
    sectionId: 'sec-1',
    installmentNumber: 2,
    amountCents: 13200,
    dueAt: new Date('2030-04-30T14:00:00Z'),
    status,
    idempotencyKey: 'mt-charge-chg',
    createdAt: new Date('2030-01-01T00:00:00Z'),
    updatedAt: new Date('2030-01-01T00:00:00Z'),
  };
}

const withFamilies: GetMusicTogetherRosterResponse = {
  section: { id: 'sec-1', name: 'Spring 2026' } as never,
  waitlist: [
    {
      id: 'dana@example.com',
      sectionId: 'sec-1',
      name: 'Dana Brooks',
      email: 'dana@example.com',
      availability: 'Weekday mornings',
      createdAt: new Date('2030-01-02T00:00:00Z'),
    },
    {
      // Email-only "coming soon" capture — no name.
      id: 'notify@example.com',
      sectionId: 'sec-1',
      email: 'notify@example.com',
      createdAt: new Date('2030-01-03T00:00:00Z'),
    },
  ],
  entries: [
    {
      registration: reg({
        id: 'reg-1',
        parentNames: ['Jamie Rivera'],
        paymentPlan: 'installments',
      }),
      charges: [charge('scheduled')],
      pastDue: false,
    },
    {
      registration: reg({
        id: 'reg-2',
        adultFirstName: 'Pat',
        adultLastName: 'Lee',
        parentNames: ['Pat Lee', 'Sam Lee'],
        children: [
          { name: 'Wren', dob: new Date('2022-01-10T00:00:00Z') },
          { name: 'Ash', dob: new Date('2024-06-05T00:00:00Z') },
        ],
        accommodations: 'Wren has a peanut allergy.',
        notes: 'Prefers the Saturday class if a spot opens.',
        paymentPlan: 'installments',
      }),
      charges: [charge('failed')],
      pastDue: true,
    },
    {
      registration: reg({
        id: 'reg-3',
        parentNames: ['Robin Fox'],
        paymentPlan: 'full',
        pricePaidCents: 25200,
      }),
      charges: [],
      pastDue: false,
    },
  ],
};

const meta = {
  component: RosterDialog,
  title: 'MusicTogether/RosterDialog',
  parameters: { layout: 'centered', a11y: { disable: true } },
  args: { open: true, onClose: fn(), sectionName: 'Spring 2026' },
} satisfies Meta<typeof RosterDialog>;

export default meta;
type Story = StoryObj<typeof RosterDialog>;

/** Three families incl. a past-due one; licensee CSV enabled for the 3 confirmed. */
export const WithFamilies: Story = {
  args: { rosterState: { status: 'success', data: withFamilies } },
};

export const Empty: Story = {
  args: {
    rosterState: {
      status: 'success',
      data: { section: withFamilies.section, entries: [], waitlist: [] },
    },
  },
};

/**
 * While loading, a table-shaped skeleton stands in for the roster so the dialog
 * doesn't collapse to a bare spinner — the column headers stay put and the body
 * fills with shimmer rows. Asserts the skeleton renders and the empty/success
 * copy is absent.
 */
export const Loading: Story = {
  args: { rosterState: { status: 'loading' } },
  play: async () => {
    const canvas = body();
    await waitFor(() =>
      expect(canvas.getByRole('dialog')).toBeInTheDocument()
    );
    // Header structure is preserved during load…
    await expect(canvas.getByText('Parent(s)')).toBeInTheDocument();
    // …and the skeleton placeholder is rendered (MUI Skeleton = .MuiSkeleton-root).
    await expect(
      document.querySelectorAll('.MuiSkeleton-root').length
    ).toBeGreaterThan(0);
    // Not the empty-state nor a real family row.
    await expect(
      canvas.queryByText(/No families enrolled yet/i)
    ).not.toBeInTheDocument();
  },
};

export const ErrorState: Story = {
  args: {
    rosterState: { status: 'error', error: 'Failed to fetch roster' },
  },
};

// ============================================================
// INTERACTIONS (exercised automatically in CI)
// ============================================================

const body = () => within(document.body);

/**
 * Renders the roster and drives the licensee-CSV download. Verifies the
 * past-due badge, a child's DOB, the confirmed count on the button, and that
 * clicking the download triggers an anchor download without error.
 */
export const RostersAndDownloadsCsv: Story = {
  args: { rosterState: { status: 'success', data: withFamilies } },
  play: async ({ args }) => {
    const canvas = body();
    await waitFor(() =>
      expect(canvas.getByRole('dialog')).toBeInTheDocument()
    );

    // Renders enrolled families with past-due, child DOBs, and the internal
    // accommodations/notes column.
    await expect(canvas.getByText('Past due')).toBeInTheDocument();
    await expect(
      canvas.getByText(/Wren \(2022-01-10\)/)
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/peanut allergy/i)
    ).toBeInTheDocument();

    // Both export buttons count the 3 confirmed families and are enabled.
    const licensee = canvas.getByRole('button', {
      name: /licensee csv[^(]*\(3\)/i,
    });
    const internal = canvas.getByRole('button', {
      name: /internal roster \(3\)/i,
    });
    await expect(licensee).toBeEnabled();
    await expect(internal).toBeEnabled();

    // Clicking either triggers a blob download via a temporary anchor — assert
    // the anchor is created + clicked (spy the prototype so no file saves).
    const clickSpy = fn();
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = clickSpy;
    try {
      await userEvent.click(licensee);
      await userEvent.click(internal);
      await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(2));
    } finally {
      HTMLAnchorElement.prototype.click = orig;
    }

    await userEvent.click(canvas.getByRole('button', { name: /close/i }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

/**
 * Drives the admin cancel/refund flow: open the confirm dialog for a family,
 * override the prefilled policy amount with a partial refund, confirm, and
 * assert the callback fires with the chosen cents. The amount field prefills
 * with the policy refund (paid − $25 fee) since the mock section is pre-class.
 */
export const CancelsWithPartialRefund: Story = {
  args: {
    rosterState: { status: 'success', data: withFamilies },
    onCancelRegistration: fn(async () => ({
      registrationId: 'reg-1',
      status: 'refunded' as const,
      refundCents: 5000,
      refundId: 'ref-1',
      cancelledChargeCount: 1,
    })),
  },
  play: async ({ args }) => {
    const canvas = body();
    await waitFor(() =>
      expect(canvas.getByRole('dialog')).toBeInTheDocument()
    );

    // Open the cancel dialog for the first family.
    await userEvent.click(
      canvas.getByRole('button', {
        name: /cancel registration for Jamie Rivera/i,
      })
    );

    // The amount field prefills with the policy refund ($132.00 − $25 fee).
    const amount = (await waitFor(() =>
      canvas.getByLabelText(/refund amount/i)
    )) as HTMLInputElement;
    await expect(amount).toHaveValue(107);

    // Override with a partial refund of $50.00.
    await userEvent.clear(amount);
    await userEvent.type(amount, '50');

    await userEvent.click(
      canvas.getByRole('button', { name: /confirm cancel/i })
    );

    await waitFor(() =>
      expect(args.onCancelRegistration).toHaveBeenCalledWith('reg-1', 5000)
    );
  },
};

/**
 * The refund field rejects an amount above what was captured, disabling the
 * confirm button so an over-refund can't be submitted.
 */
export const RejectsOverRefund: Story = {
  args: {
    rosterState: { status: 'success', data: withFamilies },
    onCancelRegistration: fn(async () => ({
      registrationId: 'reg-1',
      status: 'refunded' as const,
      refundCents: 0,
      cancelledChargeCount: 0,
    })),
  },
  play: async ({ args }) => {
    const canvas = body();
    await waitFor(() =>
      expect(canvas.getByRole('dialog')).toBeInTheDocument()
    );

    await userEvent.click(
      canvas.getByRole('button', {
        name: /cancel registration for Jamie Rivera/i,
      })
    );
    const amount = (await waitFor(() =>
      canvas.getByLabelText(/refund amount/i)
    )) as HTMLInputElement;

    // $200 exceeds the $132 captured on this registration.
    await userEvent.clear(amount);
    await userEvent.type(amount, '200');

    // The confirm button is disabled, so the over-refund can't be submitted.
    const confirm = canvas.getByRole('button', { name: /confirm cancel/i });
    await expect(confirm).toBeDisabled();
    await expect(args.onCancelRegistration).not.toHaveBeenCalled();
  },
};

/**
 * The waitlist section lists interested families (a named signup + an
 * email-only "coming soon" capture) and copies their emails to the clipboard.
 */
export const WaitlistAndCopyEmails: Story = {
  args: { rosterState: { status: 'success', data: withFamilies } },
  play: async () => {
    const canvas = body();
    await waitFor(() =>
      expect(canvas.getByRole('dialog')).toBeInTheDocument()
    );

    // Both waitlist entries render (named + email-only), with the count.
    await expect(
      canvas.getByText(/Waitlist \/ Interested families \(2\)/i)
    ).toBeInTheDocument();
    await expect(canvas.getByText('Dana Brooks')).toBeInTheDocument();
    await expect(canvas.getByText('notify@example.com')).toBeInTheDocument();

    // Copy emails writes both addresses to the clipboard. `navigator.clipboard`
    // is a getter-only property in the test browser, so define it (Object.assign
    // throws "Cannot set property clipboard").
    const writeText = fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    await userEvent.click(
      canvas.getByRole('button', { name: /copy emails/i })
    );
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'dana@example.com, notify@example.com'
      )
    );
  },
};

/** Empty roster disables the CSV export. */
export const EmptyDisablesExport: Story = {
  args: {
    rosterState: {
      status: 'success',
      data: { section: withFamilies.section, entries: [], waitlist: [] },
    },
  },
  play: async () => {
    const canvas = body();
    await waitFor(() =>
      expect(canvas.getByRole('dialog')).toBeInTheDocument()
    );
    await expect(
      canvas.getByRole('button', { name: /licensee csv[^(]*\(0\)/i })
    ).toBeDisabled();
    await expect(
      canvas.getByRole('button', { name: /internal roster \(0\)/i })
    ).toBeDisabled();
  },
};
