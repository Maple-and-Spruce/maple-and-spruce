import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { TeacherPayoutsList } from './TeacherPayoutsList';
import {
  mockTeacherPayouts,
  mockPayoutPrimary,
  mockPayoutSubstitute,
  mockPayoutMissingRate,
  mockPayoutUnpricedHope,
  mockPayoutUnpricedHopeFlat,
} from '@maple/react/storybook-fixtures';
import type { RequestState, TeacherPayout } from '@maple/ts/domain';

const meta = {
  component: TeacherPayoutsList,
  title: 'Payouts/TeacherPayoutsList',
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TeacherPayoutsList>;

export default meta;
type Story = StoryObj<typeof TeacherPayoutsList>;

// ============================================================
// VISUAL STATES
// ============================================================

export const Loading: Story = {
  args: {
    payoutsState: { status: 'loading' } as RequestState<TeacherPayout[]>,
  },
};

export const ErrorState: Story = {
  args: {
    payoutsState: {
      status: 'error',
      error: 'Failed to fetch payouts.',
    } as RequestState<TeacherPayout[]>,
  },
};

export const Empty: Story = {
  args: {
    payoutsState: {
      status: 'success',
      data: [],
    } as RequestState<TeacherPayout[]>,
  },
};

export const Mixed: Story = {
  args: {
    payoutsState: {
      status: 'success',
      data: mockTeacherPayouts,
    } as RequestState<TeacherPayout[]>,
  },
};

// ============================================================
// INTERACTION TESTS
// ============================================================

export const TotalsRendered: Story = {
  args: {
    payoutsState: {
      status: 'success',
      data: [mockPayoutPrimary],
    } as RequestState<TeacherPayout[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvas.getByText(mockPayoutPrimary.teacherName)).toBeInTheDocument();
      // $150 total formatted as $150.00
      expect(canvas.getByText('$150.00')).toBeInTheDocument();
    });
  },
};

export const ExpandingAccordionRevealsLineItems: Story = {
  args: {
    payoutsState: {
      status: 'success',
      data: [mockPayoutPrimary],
    } as RequestState<TeacherPayout[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Table is not rendered until the accordion is expanded
    expect(canvas.queryByRole('table')).toBeNull();

    const summary = canvas.getByRole('button', {
      name: new RegExp(mockPayoutPrimary.teacherName),
    });
    await userEvent.click(summary);

    await waitFor(() => {
      expect(canvas.getByRole('table')).toBeInTheDocument();
      // The Hope line's student name should be visible now
      expect(canvas.getByText('Felix Rivera')).toBeInTheDocument();
    });
  },
};

export const SubstituteBadgeAppearsOnSubLine: Story = {
  args: {
    payoutsState: {
      status: 'success',
      data: [mockPayoutSubstitute],
    } as RequestState<TeacherPayout[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', {
        name: new RegExp(mockPayoutSubstitute.teacherName),
      })
    );

    await waitFor(() => {
      expect(canvas.getByText(/^Sub$/i)).toBeInTheDocument();
    });
  },
};

export const MissingRateConfigBadge: Story = {
  args: {
    payoutsState: {
      status: 'success',
      data: [mockPayoutMissingRate],
    } as RequestState<TeacherPayout[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvas.getByText(/rate not set/i)).toBeInTheDocument();
    });
  },
};

/**
 * A Hope student on no EMA product (#83), percentage teacher: the lesson is
 * listed, marked as needing a product, and the share is left out of the total
 * rather than guessed at.
 */
export const UnpricedHopeLessonFlagged: Story = {
  args: {
    payoutsState: {
      status: 'success',
      data: [mockPayoutUnpricedHope],
    } as RequestState<TeacherPayout[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const summary = canvas.getByRole('button', {
      name: new RegExp(mockPayoutUnpricedHope.teacherName),
    });
    // The flag is on the summary, so it shows without expanding.
    await expect(
      within(summary).getByText('1 Hope lesson unpriced')
    ).toBeInTheDocument();
    // Only the priced lesson is in the total: $18.00, not $36.00.
    await expect(within(summary).getByText('$18.00')).toBeInTheDocument();
    await expect(canvas.queryByText('$36.00')).toBeNull();
    // A pay-rate problem is a different thing and is not claimed here.
    await expect(canvas.queryByText(/rate not set/i)).toBeNull();

    await userEvent.click(summary);
    await waitFor(() => {
      expect(canvas.getByText(/1 Hope lesson has no price/)).toBeInTheDocument();
    });
    await expect(canvas.getByText(/share is not in the total yet/)).toBeInTheDocument();
    const rows = canvas.getAllByRole('row');
    const unpricedRow = rows.find((r) => within(r).queryByText('Test Student'));
    await expect(unpricedRow).toBeDefined();
    await expect(
      within(unpricedRow as HTMLElement).getByText('Needs EMA product')
    ).toBeInTheDocument();
    await expect(within(unpricedRow as HTMLElement).getByText('—')).toBeInTheDocument();
    // The priced line still shows its product price.
    await expect(canvas.getByText('$30.00')).toBeInTheDocument();
  },
};

/**
 * Flat-rate teacher, unpriced Hope lesson (#83): pay is owed and in the total,
 * and the lesson is still flagged as needing a product. The warning must not
 * say pay is held back, because it isn't.
 */
export const UnpricedHopeLessonFlatRatePaid: Story = {
  args: {
    payoutsState: {
      status: 'success',
      data: [mockPayoutUnpricedHopeFlat],
    } as RequestState<TeacherPayout[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const summary = canvas.getByRole('button', {
      name: new RegExp(mockPayoutUnpricedHopeFlat.teacherName),
    });
    await expect(
      within(summary).getByText('1 Hope lesson unpriced')
    ).toBeInTheDocument();
    await expect(within(summary).getByText('$25.00')).toBeInTheDocument();

    await userEvent.click(summary);
    await waitFor(() => {
      expect(canvas.getByText(/Pay for it is included/)).toBeInTheDocument();
    });
    await expect(canvas.queryByText(/not in the total/)).toBeNull();
    const row = canvas
      .getAllByRole('row')
      .find((r) => within(r).queryByText('Test Student'));
    await expect(
      within(row as HTMLElement).getByText('Needs EMA product')
    ).toBeInTheDocument();
    await expect(within(row as HTMLElement).getByText('$25.00')).toBeInTheDocument();
  },
};

export const HopeVsPrivateBadgeInLineItems: Story = {
  args: {
    payoutsState: {
      status: 'success',
      data: [mockPayoutPrimary],
    } as RequestState<TeacherPayout[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', {
        name: new RegExp(mockPayoutPrimary.teacherName),
      })
    );

    await waitFor(() => {
      // Primary payout has 2 private-paid + 1 Hope lines
      const hopeChips = canvas.getAllByText(/^Hope$/i);
      const privateChips = canvas.getAllByText(/^Private$/i);
      expect(hopeChips.length).toBeGreaterThanOrEqual(1);
      expect(privateChips.length).toBeGreaterThanOrEqual(2);
    });
  },
};

export const EmptyStateMessage: Story = {
  args: {
    payoutsState: {
      status: 'success',
      data: [],
    } as RequestState<TeacherPayout[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvas.getByText(/No payouts for this period/i)).toBeInTheDocument();
    });
  },
};
