import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { Registration } from '@maple/ts/domain';
import { mockClassPrivateHours } from '@maple/react/storybook-fixtures';
import { PrivateHourRoster } from './PrivateHourRoster';

/** A booking for one hour; invented people only. */
function booking(
  id: string,
  slotStart: Date,
  overrides: Partial<Registration> = {}
): Registration {
  return {
    id,
    classId: mockClassPrivateHours.id,
    customerName: 'Robin Ashfield',
    customerEmail: 'robin@example.com',
    quantity: 1,
    slotStart,
    groupSize: 8,
    pricePaidCents: 6360,
    subtotalCents: 6000,
    taxAmountCents: 360,
    taxRatePercent: 6,
    status: 'confirmed',
    source: 'web',
    createdAt: new Date('2030-11-01T12:00:00Z'),
    updatedAt: new Date('2030-11-01T12:00:00Z'),
    ...overrides,
  };
}

const [first, second, , fourth] = mockClassPrivateHours.sessions.map((s) => s.dateTime);

const bookings: Registration[] = [
  booking('reg-1', first),
  booking('reg-2', second, {
    customerName: 'Olive Thompson',
    customerEmail: 'olive@example.com',
    groupSize: 5,
    status: 'pending',
  }),
  // Cancelled: its hour reads as open again.
  booking('reg-3', fourth, {
    customerName: 'Wren Calloway',
    customerEmail: 'wren@example.com',
    status: 'cancelled',
  }),
];

const meta = {
  component: PrivateHourRoster,
  title: 'Registrations/PrivateHourRoster',
  parameters: { layout: 'padded' },
  args: {
    classItem: mockClassPrivateHours,
    registrationsState: { status: 'success', data: bookings },
    onViewDetail: fn(),
  },
} satisfies Meta<typeof PrivateHourRoster>;

export default meta;
type Story = StoryObj<typeof PrivateHourRoster>;

/** Hours by day: two held (one still checking out), the rest open. */
export const WithBookings: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Sat, Dec 7')).toBeInTheDocument();
    await expect(canvas.getByText('2 of 2 booked')).toBeInTheDocument();
    await expect(canvas.getByText('Olive Thompson')).toBeInTheDocument();
    await expect(canvas.getByText('Checking out')).toBeInTheDocument();
    await expect(canvas.queryByText('Wren Calloway')).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: /View booking for 10:00–11:00 AM/ }));
    await expect(args.onViewDetail).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reg-1' })
    );
  },
};

/** No bookings yet: every hour open. */
export const AllOpen: Story = {
  args: { registrationsState: { status: 'success', data: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText('Open')).toHaveLength(6);
  },
};

/** While bookings load, a skeleton, never "Open" for every hour. */
export const Loading: Story = {
  args: { registrationsState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText('Open')).toBeNull();
  },
};

export const LoadError: Story = {
  args: { registrationsState: { status: 'error', error: 'Network error' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Couldn.t load the bookings/)).toBeInTheDocument();
    await expect(canvas.queryByText('Open')).toBeNull();
  },
};
