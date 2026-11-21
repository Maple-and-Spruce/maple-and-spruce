import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { RequestState } from '@maple/ts/domain';
import type { PreviewClassInstructorPayoutsResponse } from '@maple/ts/firebase/api-types';
import {
  mockPreviewAlreadyStated,
  mockPreviewHazel,
  mockPreviewJuniper,
  mockPreviewMissingRate,
  mockPreviewPaidUp,
  mockPreviewSecondClassOwed,
} from '@maple/react/storybook-fixtures';
import { ClassInstructorPayoutPreview } from './ClassInstructorPayoutPreview';

type State = RequestState<PreviewClassInstructorPayoutsResponse>;
const EMPTY_MESSAGE = 'No class sessions to pay yet.';

const meta = {
  component: ClassInstructorPayoutPreview,
  title: 'Payouts/ClassInstructorPayoutPreview',
  parameters: { layout: 'padded' },
  args: {
    onGenerate: fn(async () => undefined),
    onMarkPaid: fn(),
    statementHref: (id: string) => `/payouts/instructor-statements/${id}`,
  },
} satisfies Meta<typeof ClassInstructorPayoutPreview>;

export default meta;
type Story = StoryObj<typeof ClassInstructorPayoutPreview>;

const success = (
  previews: PreviewClassInstructorPayoutsResponse['previews'],
  throughDate?: string
): State => ({
  status: 'success',
  data: { previews, ...(throughDate && { throughDate }) },
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
    // What is owed and not yet paid, per instructor.
    expect(canvas.getByText('Owed $80.00')).toBeInTheDocument();
    expect(canvas.getByText('Owed $288.00')).toBeInTheDocument();
    // A two-session class shows which of its sessions this statement would pay for.
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

/**
 * Paying per class (#344): the first class this month is already paid, and
 * the second has just finished. Only the second is owed, and a statement can
 * be generated for it straight away, without waiting for the month to end.
 */
export const SecondClassOfTheMonth: Story = {
  args: { previewState: success([mockPreviewSecondClassOwed]) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('Owed $390.00')).toBeInTheDocument();
    expect(canvas.getByText('Paid this year $390.00')).toBeInTheDocument();
    expect(canvas.getByText('Felted Ornaments')).toBeInTheDocument();
    expect(canvas.queryByText('Evergreen Wreaths')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Generate statement ($390.00)' }));
    await waitFor(() => expect(args.onGenerate).toHaveBeenCalledWith('instructor-fern'));
  },
};

/** After both payments are recorded the instructor still shows, owed nothing. */
export const PaidUp: Story = {
  args: { previewState: success([mockPreviewPaidUp]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('Owed $0.00')).toBeInTheDocument();
    expect(canvas.getByText('Paid this year $780.00')).toBeInTheDocument();
    expect(canvas.getByText('Nothing owed. Every finished class has been paid.')).toBeInTheDocument();
    expect(canvas.queryByRole('button', { name: /Generate statement/ })).toBeNull();
  },
};

/** A cutoff day is spelled out, so a short list is not mistaken for everything. */
export const ThroughAnEarlierDay: Story = {
  args: { previewState: success([mockPreviewJuniper], '2026-10-10') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/Showing classes held through Oct 10, 2026/)).toBeInTheDocument();
    expect(canvas.getByRole('button', { name: /Generate statement/ })).toBeEnabled();
  },
};

/** A double click asks for one statement, not two. */
export const DoubleClickGeneratesOnce: Story = {
  args: {
    previewState: success([mockPreviewJuniper]),
    onGenerate: fn(() => new Promise<void>((resolve) => setTimeout(resolve, 50))),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: /Generate statement/ });
    await userEvent.click(button);
    await userEvent.click(button).catch(() => undefined);
    await waitFor(() => expect(canvas.getByRole('button', { name: /Generate statement/ })).toBeEnabled());
    expect(args.onGenerate).toHaveBeenCalledTimes(1);
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

export const RefundsCancelOutWhatIsOwed: Story = {
  args: {
    previewState: success([
      {
        ...mockPreviewHazel,
        classes: [],
        grossCents: 0,
        shareCents: 0,
        totalOwedCents: -4000,
        owedCents: -4000,
      },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/carry to the next statement/)).toBeInTheDocument();
    expect(canvas.getByRole('button', { name: /Generate statement/ })).toBeDisabled();
  },
};

export const WaitingToBeMarkedPaid: Story = {
  args: { previewState: success([mockPreviewAlreadyStated]) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    // Generated but not yet marked paid still counts as owed.
    expect(canvas.getByText('Owed $288.00')).toBeInTheDocument();
    expect(canvas.queryByRole('button', { name: /Generate statement/ })).toBeNull();
    expect(
      canvas.getByRole('link', { name: 'Classes held Oct 10, 2026: $288.00' })
    ).toHaveAttribute('href', '/payouts/instructor-statements/stmt-juniper-oct');
    expect(canvas.getByText('Every finished class is on a statement.')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Mark paid' }));
    expect(args.onMarkPaid).toHaveBeenCalledWith('stmt-juniper-oct');
  },
};

export const NotCleared: Story = {
  args: {
    previewState: success([
      { ...mockPreviewJuniper, readinessMissing: ['background-check', 'payment-setup'] },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.getByLabelText('Not cleared to teach: missing background check and payment setup')
    ).toBeInTheDocument();
    // A warning only: the statement can still be generated.
    expect(canvas.getByRole('button', { name: /Generate statement/ })).toBeEnabled();
  },
};

export const NotClearedRateOnlyIsNotRepeated: Story = {
  args: {
    previewState: success([{ ...mockPreviewMissingRate, readinessMissing: ['pay-rate'] }]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // "Rate not set" already says it; no second chip for the same gap.
    expect(canvas.getByText('Rate not set')).toBeInTheDocument();
    expect(canvas.queryByText('Not cleared')).toBeNull();
  },
};
