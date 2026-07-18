import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { TeacherPayoutsList } from './TeacherPayoutsList';
import {
  mockTeacherPayouts,
  mockPayoutPrimary,
  mockPayoutSubstitute,
  mockPayoutMissingRate,
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
