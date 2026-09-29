import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import LoginPage from './page';

/**
 * The admin sign-in page.
 *
 * There is deliberately no sign-up: email sign-up is disabled on the Firebase
 * project, and staff are added in the Console, then set a password through
 * "Forgot password?". Firebase is only touched on submit, so the page renders
 * here without mocks.
 */
const meta = {
  component: LoginPage,
  title: 'Auth/LoginPage',
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/login' },
    },
  },
} satisfies Meta<typeof LoginPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignInOnly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole('heading', { name: 'Sign In' })
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Sign In' })
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Forgot password?' })
    ).toBeInTheDocument();
    await expect(
      canvas.getByText('Accounts are created by an administrator.')
    ).toBeInTheDocument();

    // No way to create an account from here.
    await expect(canvas.queryByText(/sign up/i)).not.toBeInTheDocument();
    await expect(canvas.queryByText(/create account/i)).not.toBeInTheDocument();
    await expect(
      canvas.queryByText(/don't have an account/i)
    ).not.toBeInTheDocument();
  },
};

export const ForgotPasswordNeedsEmail: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole('button', { name: 'Forgot password?' })
    );

    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Please enter your email address first'
    );
  },
};
