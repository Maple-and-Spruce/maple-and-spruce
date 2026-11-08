import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { Class, Registration } from '@maple/ts/domain';
import { RegistrationList } from './RegistrationList';

/** A class registration; invented people only. */
function registration(
  id: string,
  overrides: Partial<Registration> = {}
): Registration {
  return {
    id,
    classId: 'cls-wreath',
    customerName: 'Robin Ashfield',
    customerEmail: 'robin@example.com',
    quantity: 1,
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

const LONG_NOTE =
  'My son has a severe latex allergy, so please no latex gloves or balloons near his seat. ' +
  'He also uses a wheelchair, so a table near the door would be ideal. Thank you!';

const registrations: Registration[] = [
  registration('reg-1', { notes: LONG_NOTE }),
  registration('reg-2', {
    customerName: 'Olive Thompson',
    customerEmail: 'olive@example.com',
  }),
  registration('reg-3', {
    customerName: 'Wren Calloway',
    customerEmail: 'wren@example.com',
    notes: 'Left-handed',
    source: 'pos',
  }),
  // Whitespace only: nothing to read.
  registration('reg-4', {
    customerName: 'Fern Abernathy',
    customerEmail: 'fern@example.com',
    notes: '   ',
  }),
];

const classes = [{ id: 'cls-wreath', name: 'Wreath Making' }] as Class[];

const meta = {
  component: RegistrationList,
  title: 'Registrations/RegistrationList',
  parameters: { layout: 'padded' },
  args: {
    registrationsState: { status: 'success', data: registrations },
    classes,
    onViewDetail: fn(),
  },
} satisfies Meta<typeof RegistrationList>;

export default meta;
type Story = StoryObj<typeof RegistrationList>;

/** Customer notes show under the name, so they are read without opening each one. */
export const WithNotes: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const notes = canvas.getAllByRole('note');
    await expect(notes).toHaveLength(2);
    await expect(notes[0]).toHaveAccessibleName(`Customer note: ${LONG_NOTE}`);
    await expect(notes[1]).toHaveTextContent('Left-handed');

    const olive = canvas.getByText('Olive Thompson').closest('tr') as HTMLElement;
    await expect(within(olive).queryByRole('note')).toBeNull();
    const fern = canvas.getByText('Fern Abernathy').closest('tr') as HTMLElement;
    await expect(within(fern).queryByRole('note')).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: 'View Wren Calloway' }));
    await expect(args.onViewDetail).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reg-3' })
    );
  },
};

export const Loading: Story = {
  args: { registrationsState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText('No registrations found')).toBeNull();
    await expect(canvas.queryByRole('note')).toBeNull();
  },
};

export const LoadError: Story = {
  args: { registrationsState: { status: 'error', error: 'Network down' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Failed to load registrations: Network down/)).toBeInTheDocument();
    await expect(canvas.queryByText('No registrations found')).toBeNull();
  },
};

export const Empty: Story = {
  args: { registrationsState: { status: 'success', data: [] } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No registrations found')).toBeInTheDocument();
  },
};
