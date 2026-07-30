import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent, waitFor } from 'storybook/test';
import type {
  GetMusicTogetherDemoRsvpsResponse,
  MusicTogetherDemo,
} from '@maple/ts/firebase/api-types';
import { DemoRsvpsDialog } from './DemoRsvpsDialog';

const libraryDemo: MusicTogetherDemo = {
  id: 'demo-1',
  dateTime: new Date('2030-08-03T14:00:00Z'),
  location: 'Morgantown Public Library',
  capacityFamilies: 2,
  durationMinutes: 45,
  visible: true,
  createdAt: new Date('2030-07-01T00:00:00Z'),
};

const studioDemo: MusicTogetherDemo = {
  id: 'demo-2',
  dateTime: new Date('2030-08-04T13:00:00Z'),
  location: 'Maple & Spruce Studio',
  capacityFamilies: 8,
  visible: true,
  createdAt: new Date('2030-07-01T00:00:00Z'),
};

const withRsvps: GetMusicTogetherDemoRsvpsResponse = {
  demos: [
    {
      demo: libraryDemo,
      confirmed: [
        {
          id: 'jamie@example.com',
          demoId: 'demo-1',
          name: 'Jamie Rivera',
          email: 'jamie@example.com',
          status: 'confirmed',
          createdAt: new Date('2030-07-01T00:00:00Z'),
        },
        {
          id: 'dana@example.com',
          demoId: 'demo-1',
          name: 'Dana Brooks',
          email: 'dana@example.com',
          status: 'confirmed',
          createdAt: new Date('2030-07-02T00:00:00Z'),
        },
      ],
      waitlisted: [
        {
          id: 'sky@example.com',
          demoId: 'demo-1',
          name: 'Sky Nguyen',
          email: 'sky@example.com',
          status: 'waitlisted',
          createdAt: new Date('2030-07-03T00:00:00Z'),
        },
      ],
    },
    {
      demo: studioDemo,
      confirmed: [
        {
          id: 'pat@example.com',
          demoId: 'demo-2',
          name: 'Pat Lee',
          email: 'pat@example.com',
          status: 'confirmed',
          createdAt: new Date('2030-07-03T00:00:00Z'),
        },
      ],
      waitlisted: [],
    },
  ],
};

const meta = {
  component: DemoRsvpsDialog,
  title: 'MusicTogether/DemoRsvpsDialog',
  parameters: { layout: 'centered', a11y: { disable: true } },
  args: { open: true, onClose: fn() },
} satisfies Meta<typeof DemoRsvpsDialog>;

export default meta;
type Story = StoryObj<typeof DemoRsvpsDialog>;

const body = () => within(document.body);

export const WithRsvps: Story = {
  args: { demoRsvpsState: { status: 'success', data: withRsvps } },
};

export const Empty: Story = {
  args: {
    demoRsvpsState: { status: 'success', data: { demos: [] } },
  },
};

export const Loading: Story = {
  args: { demoRsvpsState: { status: 'loading' } },
};

export const ErrorState: Story = {
  args: {
    demoRsvpsState: { status: 'error', error: 'Failed to fetch demo RSVPs' },
  },
};

/**
 * Renders demos grouped with confirmed + waitlisted counts and copies a
 * group's emails to the clipboard.
 */
export const GroupsAndCopiesEmails: Story = {
  args: { demoRsvpsState: { status: 'success', data: withRsvps } },
  play: async () => {
    const canvas = body();
    await waitFor(() =>
      expect(canvas.getByRole('dialog')).toBeInTheDocument()
    );

    // Two demo groups labelled by date + location.
    await expect(
      canvas.getByText(/Morgantown Public Library/)
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/Maple & Spruce Studio/)
    ).toBeInTheDocument();
    // Confirmed / waitlist counts.
    await expect(canvas.getByText(/2 \/ 2 confirmed/)).toBeInTheDocument();
    await expect(canvas.getByText(/1 waitlisted/)).toBeInTheDocument();
    await expect(canvas.getByText('Jamie Rivera')).toBeInTheDocument();
    await expect(canvas.getByText('Sky Nguyen')).toBeInTheDocument();
    await expect(canvas.getByText('Pat Lee')).toBeInTheDocument();

    // Copy emails writes the first demo's addresses (confirmed + waitlisted).
    // `navigator.clipboard` is a getter-only property in the test browser, so
    // define it (Object.assign throws "Cannot set property clipboard").
    const writeText = fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const copyButtons = canvas.getAllByRole('button', { name: /copy emails/i });
    await userEvent.click(copyButtons[0]);
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'jamie@example.com, dana@example.com, sky@example.com'
      )
    );
  },
};

export const EmptyState: Story = {
  args: { demoRsvpsState: { status: 'success', data: { demos: [] } } },
  play: async () => {
    const canvas = body();
    await waitFor(() =>
      expect(canvas.getByRole('dialog')).toBeInTheDocument()
    );
    await expect(canvas.getByText(/No RSVPs yet\./i)).toBeInTheDocument();
  },
};
