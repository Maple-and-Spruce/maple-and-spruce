import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
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
    parentNames: ['Jamie Rivera'],
    children: [{ name: 'Sky', dob: new Date('2023-04-01T00:00:00Z') }],
    email: 'jamie@example.com',
    phone: '304-555-1212',
    address: '123 Spruce St, Morgantown, WV',
    paymentPlan: 'installments',
    policiesAcceptedAt: new Date('2030-01-01T00:00:00Z'),
    pricePaidCents: 13200,
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
        parentNames: ['Pat Lee', 'Sam Lee'],
        children: [
          { name: 'Wren', dob: new Date('2022-01-10T00:00:00Z') },
          { name: 'Ash', dob: new Date('2024-06-05T00:00:00Z') },
        ],
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
      data: { section: withFamilies.section, entries: [] },
    },
  },
};

export const Loading: Story = {
  args: { rosterState: { status: 'loading' } },
};

export const ErrorState: Story = {
  args: {
    rosterState: { status: 'error', error: 'Failed to fetch roster' },
  },
};
