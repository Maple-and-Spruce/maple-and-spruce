import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { RequestState } from '@maple/ts/domain';
import type { PreviewClassInstructorPayoutsResponse } from '@maple/ts/firebase/api-types';
import {
  mockPreviewAlreadyStated,
  mockPreviewHazel,
  mockPreviewJuniper,
  mockPreviewMissingRate,
} from '@maple/react/storybook-fixtures';
import { ClassInstructorPayoutPreview } from './ClassInstructorPayoutPreview';

type State = RequestState<PreviewClassInstructorPayoutsResponse>;
const EMPTY_MESSAGE = 'No class sessions to pay for this month.';

const meta = {
  component: ClassInstructorPayoutPreview,
  title: 'Payouts/ClassInstructorPayoutPreview',
  parameters: { layout: 'padded' },
  args: {
    onGenerate: fn(async () => undefined),
    statementHref: (id: string) => `/payouts/instructor-statements/${id}`,
  },
} satisfies Meta<typeof ClassInstructorPayoutPreview>;

export default meta;
type Story = StoryObj<typeof ClassInstructorPayoutPreview>;

const success = (previews: PreviewClassInstructorPayoutsResponse['previews'], monthIsOver = true): State => ({
  status: 'success',
  data: { previews, monthIsOver },
});

export const Loading: Story = {
  args: { previewState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByLabelText('Loading payouts')).toHaveAttribute('aria-busy', 'true');
    expect(canvas.queryByText(EMPTY_MESSAGE)).toBeNull();
  },
};

export const Idle: Story = {
  args: { previewState: { status: 'idle' } },
  play: async ({ canvasElement }) => {
    // Not fetched yet is not "nothing to pay".
    expect(within(canvasElement).queryByText(EMPTY_MESSAGE)).toBeNull();
  },
};

export const ErrorState: Story = {
  args: { previewState: { status: 'error', error: 'Network unavailable' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('alert')).toHaveTextContent('Failed to load class payouts: Network unavailable');
    expect(canvas.queryByText(EMPTY_MESSAGE)).toBeNull();
  },
};

export const Empty: Story = {
  args: { previewState: success([]) },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByText(EMPTY_MESSAGE)).toBeInTheDocument();
  },
};

export const Instructors: Story = {
  args: { previewState: success([mockPreviewHazel, mockPreviewJuniper]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('Hazel Marsh')).toBeInTheDocument();
    // A two-session class shows which of its sessions this month pays for.
    expect(canvas.getByText(/1 of 2 sessions/)).toBeInTheDocument();
    // A refund after a paid statement is a negative line, netted into the total.
    expect(canvas.getByText(/Refund after payout: Hand-Built Clay/)).toBeInTheDocument();
    expect(canvas.getByText('−$40.00')).toBeInTheDocument();
    expect(canvas.getByRole('button', { name: 'Generate statement ($80.00)' })).toBeEnabled();
    expect(canvas.getByRole('button', { name: 'Generate statement ($288.00)' })).toBeEnabled();
  },
};

export const GenerateCallsBack: Story = {
  args: { previewState: success([mockPreviewJuniper]) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Generate statement/ }));
    await waitFor(() => expect(args.onGenerate).toHaveBeenCalledWith('instructor-juniper'));
  },
};

export const GenerateFailureIsShown: Story = {
  args: {
    previewState: success([mockPreviewJuniper]),
    onGenerate: fn(async () => {
      throw new Error('Some of these sessions were just put on another statement; refresh and try again');
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Generate statement/ }));
    await waitFor(() => expect(canvas.getByRole('alert')).toHaveTextContent('refresh and try again'));
    expect(canvas.getByRole('button', { name: /Generate statement/ })).toBeEnabled();
  },
};

export const MonthNotOver: Story = {
  args: { previewState: success([mockPreviewJuniper], false) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/statements can be generated once it ends/)).toBeInTheDocument();
    expect(canvas.getByRole('button', { name: /Generate statement/ })).toBeDisabled();
  },
};

export const MissingRate: Story = {
  args: { previewState: success([mockPreviewMissingRate]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('Rate not set')).toBeInTheDocument();
    expect(canvas.getByText(/Set a percentage pay rate/)).toBeInTheDocument();
    expect(canvas.getByRole('button', { name: /Generate statement/ })).toBeDisabled();
  },
};

export const RefundsCancelOutTheMonth: Story = {
  args: {
    previewState: success([
      { ...mockPreviewHazel, classes: [], grossCents: 0, shareCents: 0, totalOwedCents: -4000 },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/carry to the next statement/)).toBeInTheDocument();
    expect(canvas.getByRole('button', { name: /Generate statement/ })).toBeDisabled();
  },
};

export const AlreadyOnAStatement: Story = {
  args: { previewState: success([mockPreviewAlreadyStated]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByRole('button', { name: /Generate statement/ })).toBeNull();
    expect(canvas.getByText('Statement pending')).toBeInTheDocument();
    expect(canvas.getByRole('link', { name: /view statement/ })).toHaveAttribute(
      'href',
      '/payouts/instructor-statements/stmt-juniper-oct'
    );
    expect(canvas.getByText('Everything this month is on the statement.')).toBeInTheDocument();
  },
};
