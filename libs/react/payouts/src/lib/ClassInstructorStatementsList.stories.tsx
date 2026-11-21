import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  mockPerClassStatementsResponse,
  mockStatementPaid,
  mockStatementPending,
  mockStatementsResponse,
} from '@maple/react/storybook-fixtures';
import { ClassInstructorStatementsList } from './ClassInstructorStatementsList';

const EMPTY_MESSAGE = 'No statements yet.';

const meta = {
  component: ClassInstructorStatementsList,
  title: 'Payouts/ClassInstructorStatementsList',
  parameters: { layout: 'padded' },
  args: {
    onMarkPaid: fn(),
    onVoid: fn(),
    statementHref: (id: string) => `/payouts/instructor-statements/${id}`,
  },
} satisfies Meta<typeof ClassInstructorStatementsList>;

export default meta;
type Story = StoryObj<typeof ClassInstructorStatementsList>;

export const Loading: Story = {
  args: { statementsState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByLabelText('Loading statements')).toHaveAttribute('aria-busy', 'true');
    expect(canvas.queryByText(EMPTY_MESSAGE)).toBeNull();
  },
};

export const ErrorState: Story = {
  args: { statementsState: { status: 'error', error: 'Permission denied' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('alert')).toHaveTextContent('Failed to load statements: Permission denied');
    expect(canvas.queryByText(EMPTY_MESSAGE)).toBeNull();
  },
};

export const Empty: Story = {
  args: { statementsState: { status: 'success', data: { statements: [], paidThisYearByInstructor: {}, paidByYearByInstructor: {} } } },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByText(EMPTY_MESSAGE)).toBeInTheDocument();
  },
};

export const Statements: Story = {
  args: { statementsState: { status: 'success', data: mockStatementsResponse } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Void statements are hidden by default.
    expect(canvas.getAllByRole('row')).toHaveLength(3);
    expect(canvas.getByText('Oct 3, 2026 · Square Payroll · PR-2026-10-A')).toBeInTheDocument();
    expect(canvas.getByRole('link', { name: 'Oct 10 to Oct 28, 2026' })).toHaveAttribute(
      'href',
      '/payouts/instructor-statements/stmt-hazel-oct'
    );
    // Year-to-date paid, per instructor, for the 1099 threshold.
    expect(canvas.getAllByText('$288.00')).toHaveLength(2);
    // Only the pending statement can be paid or voided.
    expect(canvas.getAllByRole('button', { name: 'Mark paid' })).toHaveLength(1);
  },
};

/** Paid per class (#344): one instructor, two statements in the same month. */
export const TwoStatementsInOneMonth: Story = {
  args: { statementsState: { status: 'success', data: mockPerClassStatementsResponse } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Each is told apart by the day its class was held, and carries its own payment.
    expect(canvas.getByRole('link', { name: 'Nov 8, 2026' })).toHaveAttribute(
      'href',
      '/payouts/instructor-statements/stmt-fern-wreath'
    );
    expect(canvas.getByRole('link', { name: 'Nov 21, 2026' })).toBeInTheDocument();
    expect(canvas.getByText('Nov 11, 2026 · Square Payroll · PR-2026-11-A')).toBeInTheDocument();
    expect(canvas.getByText('Nov 22, 2026 · Square Payroll · PR-2026-11-B')).toBeInTheDocument();
    // Both payments add up in the year-to-date figure.
    expect(canvas.getAllByText('$780.00')).toHaveLength(2);
    expect(canvas.queryByRole('button', { name: 'Mark paid' })).toBeNull();
  },
};

export const IncludingVoid: Story = {
  args: { statementsState: { status: 'success', data: mockStatementsResponse }, includeVoid: true },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByText('void')).toBeInTheDocument();
  },
};

export const ActionsCallBack: Story = {
  args: {
    statementsState: {
      status: 'success',
      data: {
        statements: [mockStatementPending, mockStatementPaid],
        paidThisYearByInstructor: {},
        paidByYearByInstructor: {},
      },
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Mark paid' }));
    expect(args.onMarkPaid).toHaveBeenCalledWith(mockStatementPending);
    await userEvent.click(canvas.getByRole('button', { name: 'Void' }));
    expect(args.onVoid).toHaveBeenCalledWith(mockStatementPending);
  },
};
