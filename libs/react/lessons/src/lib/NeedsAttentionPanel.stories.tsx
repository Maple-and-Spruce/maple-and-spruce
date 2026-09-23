import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { NeedsAttentionPanel } from './NeedsAttentionPanel';
import { sortAttentionGroups, totalAttentionCount } from '@maple/ts/domain';
import type {
  NeedsAttentionGroup,
  NeedsAttentionKind,
  NeedsAttentionRow,
} from '@maple/ts/domain';

function row(
  kind: NeedsAttentionKind,
  id: string,
  label: string,
  detail: string
): NeedsAttentionRow {
  return {
    kind,
    id,
    label,
    detail,
    resolution: 'navigate',
    href: `/students/${id}`,
  };
}

const groups: NeedsAttentionGroup[] = sortAttentionGroups([
  {
    kind: 'lesson-unattributed',
    title: 'Lessons with no block',
    because:
      'They do not appear in the openings finder and skew the weekly view.',
    rows: [
      row(
        'lesson-unattributed',
        'lesson-9',
        'Rowan Fields',
        'Mon, Oct 5 sits in no block'
      ),
      row(
        'lesson-unattributed',
        'lesson-10',
        'Ada Okonkwo',
        'Mon, Oct 12 sits in no block'
      ),
    ],
  },
  {
    kind: 'invoice-overdue',
    title: 'Invoices unpaid for two weeks',
    because: 'Sent, and nobody is chasing them.',
    rows: [
      row('invoice-overdue', 'inv-1', 'Casey Rivers', '$41.25 sent Aug 12'),
      row('invoice-overdue', 'inv-2', 'Jordan Blake', '$75.00 sent Aug 14'),
      row('invoice-overdue', 'inv-3', 'Sam Perez', '$58.75 sent Aug 15'),
    ],
  },
  {
    kind: 'invoice-sync-failed',
    title: 'Invoices that never reached Square',
    because: 'The family was never asked to pay.',
    rows: [
      row(
        'invoice-sync-failed',
        'inv-9',
        'Rowan Fields',
        '$41.25 · Status code: 404'
      ),
    ],
  },
  {
    kind: 'hope-unsubmitted',
    title: 'Hope lessons not yet claimed',
    because: 'Taught, and the state has not been asked to pay for them.',
    rows: [
      row('hope-unsubmitted', 'l-1', 'Rowan Fields', 'Taught Jul 7, not yet claimed'),
    ],
  },
]);

const meta = {
  component: NeedsAttentionPanel,
  title: 'Lessons/NeedsAttentionPanel',
  parameters: { layout: 'padded' },
  args: {
    groups,
    total: totalAttentionCount(groups),
    scopedToSelf: false,
  },
} satisfies Meta<typeof NeedsAttentionPanel>;

export default meta;
type Story = StoryObj<typeof NeedsAttentionPanel>;

export const Populated: Story = {};

/**
 * The panel renders **nothing** when there is nothing to do — not an empty
 * card. A panel that is usually empty trains people to stop reading it, and
 * then it is worse than not existing.
 */
export const QuietWhenNothingIsWrong: Story = {
  args: { groups: [], total: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByText(/needs attention/i)).toBeNull();
    expect(canvasElement.textContent?.trim()).toBe('');
  },
};

/**
 * Ordered by the cost of ignoring, not by count — so the single invoice that
 * never reached Square sits above nine students with a flag off.
 */
export const WorstFirstNotBiggestFirst: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const headings = canvas
      .getAllByRole('button', { name: /^(show|hide) /i })
      .map((b) => b.getAttribute('aria-label') ?? '');

    expect(headings[0]).toMatch(/never reached square/i);
    // The most numerous group is not first.
    expect(headings[headings.length - 1]).toMatch(/no block/i);
  },
};


/**
 * A lesson teacher sees only their own students, and the panel says so —
 * otherwise an empty panel reads as "nothing is wrong" when it means
 * "nothing of yours is wrong".
 */
export const SaysWhenScopedToOneTeacher: Story = {
  args: { scopedToSelf: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText(/showing only your own students/i)
    ).toBeInTheDocument();
  },
};

/**
 * On the dashboard and above the student table the panel is a side note, not
 * the point of the page: it starts as one line with a count, and the groups
 * are one click away.
 */
export const StartsCollapsed: Story = {
  args: { defaultExpanded: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('button', {
      name: /expand needs attention/i,
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(canvas.getByText(/7 things/i)).toBeVisible();
    expect(
      canvas.queryByRole('button', { name: /never reached square/i })
    ).toBeNull();

    await userEvent.click(toggle);

    expect(
      await canvas.findByRole('button', {
        name: /collapse needs attention/i,
      })
    ).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => {
      expect(
        canvas.getByRole('button', { name: /never reached square/i })
      ).toBeVisible();
    });
  },
};
