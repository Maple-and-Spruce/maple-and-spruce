import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, waitFor } from 'storybook/test';
import type { GetMusicTogetherInterestResponse } from '@maple/ts/firebase/api-types';
import { InterestListDialog } from './InterestListDialog';

const data: GetMusicTogetherInterestResponse = {
  sectionNames: {
    'sec-thu': 'Thursdays 10am',
    'sec-sat': 'Saturdays 9am',
  },
  demand: [
    { sectionId: 'sec-thu', count: 3 },
    { sectionId: 'sec-sat', count: 1 },
  ],
  entries: [
    {
      id: 'jamie@example.com',
      name: 'Jamie Rivera',
      email: 'jamie@example.com',
      interestedSectionIds: ['sec-thu', 'sec-sat'],
      preferenceNote: 'Thursdays if I had to pick one.',
      alternateTimesNote: 'Weekday afternoons also work.',
      notes: 'Two children, ages 2 and 4.',
      createdAt: new Date('2026-06-01T12:00:00Z'),
      updatedAt: new Date('2026-06-01T12:00:00Z'),
    },
    {
      id: 'pat@example.com',
      name: 'Pat Lee',
      email: 'pat@example.com',
      interestedSectionIds: ['sec-thu'],
      alternateTimesNote: 'Only Thursdays work for us.',
      createdAt: new Date('2026-06-02T12:00:00Z'),
      updatedAt: new Date('2026-06-02T12:00:00Z'),
    },
    {
      id: 'robin@example.com',
      name: 'Robin Fox',
      email: 'robin@example.com',
      interestedSectionIds: [],
      alternateTimesNote: 'Nothing posted works — Sunday mornings would be ideal.',
      notes: 'New to the area.',
      createdAt: new Date('2026-06-03T12:00:00Z'),
      updatedAt: new Date('2026-06-03T12:00:00Z'),
    },
  ],
};

const meta = {
  component: InterestListDialog,
  title: 'MusicTogether/InterestListDialog',
  parameters: { layout: 'centered', a11y: { disable: true } },
  args: { open: true, onClose: fn() },
} satisfies Meta<typeof InterestListDialog>;

export default meta;
type Story = StoryObj<typeof InterestListDialog>;

export const WithDemand: Story = {
  args: { interestState: { status: 'success', data } },
};

export const Empty: Story = {
  args: {
    interestState: {
      status: 'success',
      data: { entries: [], demand: [], sectionNames: {} },
    },
  },
};

export const Loading: Story = {
  args: { interestState: { status: 'loading' } },
};

export const ErrorState: Story = {
  args: {
    interestState: { status: 'error', error: 'Failed to fetch interest list' },
  },
};

// ============================================================
// INTERACTION (exercised automatically in CI)
// ============================================================

/**
 * Renders the demand ranking (Thursdays top with 3) and the per-family
 * submissions incl. their preference + alternate-time answers, then closes.
 */
export const ShowsDemandAndSubmissions: Story = {
  args: { interestState: { status: 'success', data } },
  play: async ({ args }) => {
    const canvas = within(document.body);
    await waitFor(() =>
      expect(canvas.getByRole('dialog')).toBeInTheDocument()
    );

    // Demand ranking shows section names + counts; Thursdays leads with 3.
    await expect(canvas.getByText('Demand by section')).toBeInTheDocument();
    await expect(canvas.getAllByText('Thursdays 10am').length).toBeGreaterThan(
      0
    );

    // A submission's preference + alternate-time answers render.
    await expect(
      canvas.getByText(/Thursdays if I had to pick one/i)
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/Sunday mornings would be ideal/i)
    ).toBeInTheDocument();

    // Submissions header counts all three families.
    await expect(canvas.getByText(/Submissions \(3\)/)).toBeInTheDocument();
  },
};
