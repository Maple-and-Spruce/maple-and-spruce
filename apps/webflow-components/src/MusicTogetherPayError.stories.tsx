import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  MT_ALREADY_ENROLLED_MESSAGE,
  MT_SIGNUP_IN_PROGRESS_MESSAGE,
} from '@maple/ts/domain';
import {
  MusicTogetherPayError,
  MusicTogetherRegisterAgainNote,
} from './MusicTogetherPayError';

/**
 * The Music Together signup's answer to a repeat signup (a second press of
 * pay, a reload or a second tab during a slow checkout).
 *
 * These render the error on its own, because the full widget's pay button
 * sits inside the Square card form, which cannot load in Storybook. The jsdom
 * widget spec drives the whole flow with the card form stubbed.
 */
const meta: Meta<typeof MusicTogetherPayError> = {
  title: 'Webflow/MusicTogetherPayError',
  component: MusicTogetherPayError,
  parameters: { layout: 'padded' },
  args: { onRegisterAgain: fn() },
};
export default meta;

type Story = StoryObj<typeof MusicTogetherPayError>;

/** Already signed up: the refusal offers Register again and says what it means. */
export const AlreadySignedUp: Story = {
  args: { message: MT_ALREADY_ENROLLED_MESSAGE },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/already signed up for this section/i)
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/paid for separately/i)
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', { name: /^Register again$/ })
    );
    await expect(args.onRegisterAgain).toHaveBeenCalledTimes(1);
  },
};

/** Still going through: waiting is the only safe answer, so no button. */
export const PaymentStillGoingThrough: Story = {
  args: { message: MT_SIGNUP_IN_PROGRESS_MESSAGE },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/still going through/i)).toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: /Register again/i })
    ).not.toBeInTheDocument();
  },
};

/** Any other failure is just its message. */
export const OtherFailure: Story = {
  args: { message: 'This section is full.' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'This section is full.'
    );
    await expect(
      canvas.queryByRole('button', { name: /Register again/i })
    ).not.toBeInTheDocument();
  },
};

/**
 * The way the widget uses the two together: choosing Register again clears
 * the error and puts a plain warning by the pay button.
 */
export const ChoosingRegisterAgain: Story = {
  args: { message: MT_ALREADY_ENROLLED_MESSAGE },
  render: function Render({ message }) {
    const [chosen, setChosen] = useState(false);
    return chosen ? (
      <MusicTogetherRegisterAgainNote />
    ) : (
      <MusicTogetherPayError
        message={message}
        onRegisterAgain={() => setChosen(true)}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: /^Register again$/ })
    );
    await expect(
      canvas.queryByText(/already signed up for this section/i)
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole('status')).toHaveTextContent(
      /Paying now makes a second registration and a second charge/
    );
  },
};
