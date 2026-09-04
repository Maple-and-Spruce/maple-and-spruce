import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
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
  detail: string,
  resolution: NeedsAttentionRow['resolution'] = 'navigate'
): NeedsAttentionRow {
  return {
    kind,
    id,
    label,
    detail,
    resolution,
    href: resolution === 'navigate' ? `/students/${id}` : undefined,
  };
}

const groups: NeedsAttentionGroup[] = sortAttentionGroups([
  {
    kind: 'student-autoinvoice-off',
    title: 'Students who will not bill automatically',
    because: 'Every future lesson for them has to be invoiced by hand.',
    rows: [
      row(
        'student-autoinvoice-off',
        'student-1',
        'Rowan Fields',
        'Lessons will not bill automatically',
        'inline'
      ),
      row(
        'student-autoinvoice-off',
        'student-2',
        'Ada Okonkwo',
        'Lessons will not bill automatically',
        'inline'
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
    resolving: new Set<string>(),
    onResolve: fn(),
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
    expect(headings[headings.length - 1]).toMatch(/not bill automatically/i);
  },
};

/** The one row the panel can fix itself: a single boolean. */
export const ResolvesInline: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    // Open the group that holds the inline action.
    await userEvent.click(
      canvas.getByRole('button', { name: /show students who will not bill/i })
    );
    const turnOn = await canvas.findAllByRole('button', { name: /turn on/i });
    await userEvent.click(turnOn[0]);

    await waitFor(() => {
      expect(args.onResolve).toHaveBeenCalledTimes(1);
    });
    const [resolved] = (args.onResolve as ReturnType<typeof fn>).mock.calls[0];
    expect(resolved.kind).toBe('student-autoinvoice-off');
  },
};

/** A row being fixed shows progress; the others stay live. */
export const ResolvingOneRow: Story = {
  args: { resolving: new Set(['student-1']) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: /show students who will not bill/i })
    );

    expect(await canvas.findByRole('button', { name: /saving/i })).toBeDisabled();
    const others = canvas.getAllByRole('button', { name: /^turn on$/i });
    expect(others[0]).not.toBeDisabled();
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
