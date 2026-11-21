import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { mockPerClassStatementsResponse } from '@maple/react/storybook-fixtures';
import { InstructorYearTotals } from './InstructorYearTotals';

const EMPTY_MESSAGE = 'Nothing has been marked paid yet.';

const meta = {
  component: InstructorYearTotals,
  title: 'Payouts/InstructorYearTotals',
  parameters: { layout: 'padded' },
} satisfies Meta<typeof InstructorYearTotals>;

export default meta;
type Story = StoryObj<typeof InstructorYearTotals>;

export const Loading: Story = {
  args: { statementsState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByLabelText('Loading yearly totals')).toHaveAttribute('aria-busy', 'true');
    expect(canvas.queryByText(EMPTY_MESSAGE)).toBeNull();
  },
};

export const Idle: Story = {
  args: { statementsState: { status: 'idle' } },
  play: async ({ canvasElement }) => {
    // Not fetched yet is not "nothing paid".
    expect(within(canvasElement).queryByText(EMPTY_MESSAGE)).toBeNull();
  },
};

export const ErrorState: Story = {
  args: { statementsState: { status: 'error', error: 'Permission denied' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('alert')).toHaveTextContent('Failed to load yearly totals: Permission denied');
    expect(canvas.queryByText(EMPTY_MESSAGE)).toBeNull();
  },
};

export const Empty: Story = {
  args: {
    statementsState: {
      status: 'success',
      data: { statements: [], paidThisYearByInstructor: {}, paidByYearByInstructor: {} },
    },
  },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByText(EMPTY_MESSAGE)).toBeInTheDocument();
  },
};

/** One row per instructor, one column per year, newest year first. */
export const Totals: Story = {
  args: { statementsState: { status: 'success', data: mockPerClassStatementsResponse } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const headers = canvas.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Instructor', '2026', '2025']);
    const fern = canvas.getByRole('row', { name: /Fern Alder/ });
    // Two per-class payments in one month add up; nothing was paid the year before.
    expect(within(fern).getByText('$780.00')).toBeInTheDocument();
    expect(within(fern).getByText('$0.00')).toBeInTheDocument();
    const juniper = canvas.getByRole('row', { name: /Juniper Cole/ });
    expect(within(juniper).getByText('$288.00')).toBeInTheDocument();
    expect(within(juniper).getByText('$120.00')).toBeInTheDocument();
  },
};
