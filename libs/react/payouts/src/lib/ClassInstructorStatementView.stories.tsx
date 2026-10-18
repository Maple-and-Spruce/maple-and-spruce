import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import {
  mockStatementPaid,
  mockStatementPending,
  mockStatementVoid,
} from '@maple/react/storybook-fixtures';
import { ClassInstructorStatementView } from './ClassInstructorStatementView';

const meta = {
  component: ClassInstructorStatementView,
  title: 'Payouts/ClassInstructorStatementView',
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ClassInstructorStatementView>;

export default meta;
type Story = StoryObj<typeof ClassInstructorStatementView>;

export const Loading: Story = {
  args: { statementState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByLabelText('Loading statement')).toHaveAttribute('aria-busy', 'true');
    expect(canvas.queryByRole('article')).toBeNull();
  },
};

export const ErrorState: Story = {
  args: { statementState: { status: 'error', error: 'Statement stmt-x not found' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('alert')).toHaveTextContent('Failed to load statement: Statement stmt-x not found');
    expect(canvas.queryByRole('article')).toBeNull();
  },
};

export const Pending: Story = {
  args: { statementState: { status: 'success', data: { statement: mockStatementPending, staleReasons: [] } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('heading', { name: 'Hazel Marsh' })).toBeInTheDocument();
    expect(canvas.getByText('Classes held in October 2026')).toBeInTheDocument();
    expect(canvas.getByText('Share (80%)')).toBeInTheDocument();
    expect(canvas.getByText('−$40.00')).toBeInTheDocument();
    expect(canvas.getByText('$368.00')).toBeInTheDocument();
    expect(canvas.queryByText('Paid')).toBeNull();
  },
};

export const Paid: Story = {
  args: { statementState: { status: 'success', data: { statement: mockStatementPaid, staleReasons: [] } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('Paid')).toBeInTheDocument();
    expect(canvas.getByText('Paid Oct 3, 2026 by Square Payroll (ref. PR-2026-10-A).')).toBeInTheDocument();
  },
};

export const Stale: Story = {
  args: {
    statementState: {
      status: 'success',
      data: {
        statement: mockStatementPending,
        staleReasons: [
          { kind: 'registration-no-longer-earns', classId: 'class-glass', registrationId: 'reg-001', status: 'refunded' },
          { kind: 'sessions-changed', classId: 'class-weave', was: 1, now: 2 },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const warning = canvas.getByRole('alert');
    expect(warning).toHaveTextContent('Void it and generate it again before paying');
    expect(warning).toHaveTextContent('A registration on this statement is now refunded.');
    expect(warning).toHaveTextContent("A class's sessions changed from 1 to 2");
    // The warning is for David, not the instructor's copy.
    expect(warning).toHaveAttribute('data-print-hide');
  },
};

export const Voided: Story = {
  args: { statementState: { status: 'success', data: { statement: mockStatementVoid, staleReasons: [] } } },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByText(/voided and is kept for the record/)).toBeInTheDocument();
  },
};
