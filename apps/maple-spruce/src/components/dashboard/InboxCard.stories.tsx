import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Box } from '@mui/material';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { InboxItem, RequestState } from '@maple/ts/domain';
import { InboxCard, type InboxCardProps } from './InboxCard';
import { DASHBOARD_CARD_HEIGHT } from './DashboardCard';
import { FIXTURE_NOW, fixtureInboxItems } from './dashboard-fixtures';

/**
 * The card with "Mark done" wired the way `useInbox` does it: the row leaves
 * at once. All people here are invented.
 */
function InboxCardWithState(props: InboxCardProps) {
  const [state, setState] = useState<RequestState<InboxItem[]>>(props.inboxState);
  return (
    <InboxCard
      {...props}
      inboxState={state}
      onDismiss={(key) => {
        props.onDismiss(key);
        setState((s) =>
          s.status === 'success'
            ? { status: 'success', data: s.data.filter((i) => i.key !== key) }
            : s
        );
      }}
    />
  );
}

/** The Home inbox (#235). */
const meta = {
  component: InboxCard,
  title: 'Dashboard/InboxCard',
  parameters: { layout: 'padded', nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <Box sx={{ maxWidth: 420 }}>
        <Story />
      </Box>
    ),
  ],
  render: (args) => <InboxCardWithState {...args} />,
  args: {
    inboxState: { status: 'success', data: fixtureInboxItems },
    now: FIXTURE_NOW,
    onDismiss: fn(),
  },
} satisfies Meta<typeof InboxCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const rowTitles = (canvas: ReturnType<typeof within>) =>
  canvas
    .getAllByRole('listitem')
    .map((li: HTMLElement) => li.querySelector('p')?.textContent);

export const Data: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    await expect(canvas.getByText('7 to do')).toBeInTheDocument();

    // Four rows, most urgent first, and the rest counted in the footer.
    await expect(rowTitles(canvas)).toEqual([
      'Iris Calloway · $35',
      '2 for tonight’s Stained Glass',
      'Priya Okafor',
      'Mara Linden',
    ]);
    await expect(canvas.getByText('3 more in the inbox')).toBeInTheDocument();

    // Eyebrow: kind and age, a deadline as time until.
    await expect(canvas.getByText('Class in 3 hours')).toBeInTheDocument();
    await expect(canvas.getByText('2 hours ago')).toBeInTheDocument();

    // Each action goes where the item is resolved.
    await expect(canvas.getByRole('link', { name: 'Retry charge' })).toHaveAttribute(
      'href',
      '/students/stu-iris'
    );
    await expect(canvas.getByRole('link', { name: 'Send reminder' })).toHaveAttribute(
      'href',
      '/agreements'
    );
    await expect(canvas.getAllByRole('link', { name: 'Reply' })[0]).toHaveAttribute(
      'href',
      '/leads'
    );

    // Mark the failed charge done: it goes, and the next one moves up.
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Mark done: Charge failed, Iris Calloway · $35',
      })
    );
    await expect(args.onDismiss).toHaveBeenCalledWith(
      'charge-failed:chg-iris:1760400000000'
    );
    await expect(canvas.queryByText('Iris Calloway · $35')).not.toBeInTheDocument();
    await expect(rowTitles(canvas)).toEqual([
      '2 for tonight’s Stained Glass',
      'Priya Okafor',
      'Mara Linden',
      'Wren Abernathy',
    ]);
    await expect(canvas.getByText('6 to do')).toBeInTheDocument();
    await expect(canvas.getByText('2 more in the inbox')).toBeInTheDocument();

    // Fixed height, like every dashboard card.
    const card = canvas.getByRole('heading', { name: 'Inbox' }).closest('section');
    await expect(card?.getBoundingClientRect().height).toBe(DASHBOARD_CARD_HEIGHT);
  },
};

export const FewItems: Story = {
  args: { inboxState: { status: 'success', data: fixtureInboxItems.slice(2, 4) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('listitem')).toHaveLength(2);
    // Nothing hidden, so no footer.
    await expect(canvas.queryByText(/more in the inbox/)).not.toBeInTheDocument();
  },
};

/** A class registration refunded in part in the Square dashboard (#144). */
export const PartRefund: Story = {
  args: {
    inboxState: {
      status: 'success',
      data: [
        {
          key: 'refund-partial:reg-wren:2000',
          kind: 'refund-partial',
          title: 'Wheel Pottery',
          detail: '$20.00 of $63.60 refunded in Square · Wren Abernathy',
          href: '/classes/cls-pottery/roster',
          actionLabel: 'Review',
          occurredAt: FIXTURE_NOW.toISOString(),
          urgent: false,
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Part refund')).toBeInTheDocument();
    await expect(
      canvas.getByText('$20.00 of $63.60 refunded in Square · Wren Abernathy')
    ).toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: 'Review' })).toHaveAttribute(
      'href',
      '/classes/cls-pottery/roster'
    );
  },
};

export const Empty: Story = {
  args: { inboxState: { status: 'success', data: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('All caught up')).toBeInTheDocument();
    await expect(
      canvas.getByText('New inquiries, failed charges and unsigned agreements land here.')
    ).toBeInTheDocument();
    await expect(canvas.getByText('0 to do')).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { inboxState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    await expect(canvas.queryByText('All caught up')).not.toBeInTheDocument();
    await expect(canvas.queryByText(/to do/)).not.toBeInTheDocument();
  },
};

export const Idle: Story = {
  args: { inboxState: { status: 'idle' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    await expect(canvas.queryByText('All caught up')).not.toBeInTheDocument();
  },
};

export const LoadError: Story = {
  name: 'Error',
  args: { inboxState: { status: 'error', error: 'unavailable' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('unavailable');
    await expect(canvas.queryByText('All caught up')).not.toBeInTheDocument();
  },
};

export const DismissFailed: Story = {
  args: {
    dismissError: "Couldn't mark that done. It's back in the list; try again.",
    onClearDismissError: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent("Couldn't mark that done");
    await userEvent.click(canvas.getByRole('button', { name: 'Close' }));
    await expect(args.onClearDismissError).toHaveBeenCalled();
  },
};

/**
 * A contract instructor teaching Saturday without being cleared: a deadline
 * row, counted down to the class, that opens their form.
 */
export const InstructorNotCleared: Story = {
  args: {
    inboxState: {
      status: 'success',
      data: [
        {
          key: 'instructor-not-ready:ins-olive:1760792400000',
          kind: 'instructor-not-ready',
          title: 'Olive Thompson for Saturday’s Block Printing',
          detail: 'Missing background check and payment setup',
          href: '/instructors?edit=ins-olive',
          actionLabel: 'Update',
          occurredAt: new Date(2026, 9, 4, 10).toISOString(),
          dueAt: new Date(2026, 9, 17, 10).toISOString(),
          urgent: true,
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [row] = canvas.getAllByRole('listitem');
    await expect(row).toHaveTextContent('Olive Thompson for Saturday’s Block Printing');
    await expect(row).toHaveTextContent('Missing background check and payment setup');
    await expect(row).toHaveTextContent(/Not cleared/i);
    await expect(row).toHaveTextContent('Class in 3 days');
    await expect(
      within(row).getByRole('link', { name: /update/i })
    ).toHaveAttribute('href', '/instructors?edit=ins-olive');
  },
};
