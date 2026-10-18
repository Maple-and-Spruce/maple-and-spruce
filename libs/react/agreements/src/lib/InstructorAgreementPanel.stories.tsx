import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { AgreementRequest, AgreementTemplate } from '@maple/ts/domain';
import { InstructorAgreementPanel } from './InstructorAgreementPanel';

const NOW = new Date('2026-10-17T16:00:00Z');

const contract: AgreementTemplate = {
  id: 'tpl-contract',
  name: 'Class Instructor Agreement (1099)',
  sections: [{ id: 'about', title: 'About', content: '<p>About</p>' }],
  classCategoryIds: [],
  autoAttach: false,
  signingRequirement: 'deferred',
  supportsMinor: false,
  version: 2,
  status: 'active',
  createdAt: new Date('2026-10-17T00:00:00Z'),
  updatedAt: new Date('2026-10-17T00:00:00Z'),
};

const waiver: AgreementTemplate = {
  ...contract,
  id: 'tpl-waiver',
  name: 'Studio Waiver',
};

function sent(overrides: Partial<AgreementRequest> = {}): AgreementRequest {
  return {
    id: 'req-1',
    templateId: contract.id,
    templateVersion: 2,
    signerEmail: 'robin@example.com',
    signerName: 'Robin Ashfield',
    deliveryMethod: 'email',
    instructorId: 'inst-1',
    signingToken: 'tok',
    expiresAt: new Date('2026-11-09T16:00:00Z'),
    status: 'pending',
    emailSentAt: new Date('2026-10-10T16:00:00Z'),
    createdAt: new Date('2026-10-10T16:00:00Z'),
    updatedAt: new Date('2026-10-10T16:00:00Z'),
    ...overrides,
  };
}

const meta = {
  title: 'Agreements/InstructorAgreementPanel',
  component: InstructorAgreementPanel,
  decorators: [
    (Story) => (
      <div style={{ width: 560 }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
  args: {
    signerName: 'Robin Ashfield',
    signerEmail: 'robin@example.com',
    requestsState: { status: 'success', data: [] },
    templatesState: { status: 'success', data: [contract, waiver] },
    onSend: fn(async () => undefined),
    onResend: fn(async () => undefined),
    now: NOW,
  },
} satisfies Meta<typeof InstructorAgreementPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing sent yet: choose the agreement and send it. */
export const NotSent: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const send = canvas.getByRole('button', { name: /send for signature/i });
    await expect(send).toBeDisabled();

    await userEvent.click(canvas.getByLabelText(/^agreement$/i));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole('option', { name: contract.name })
    );

    await expect(send).toBeEnabled();
    await userEvent.click(send);
    await waitFor(() => expect(args.onSend).toHaveBeenCalledWith(contract.id));
  },
};

/** With only one active template it is chosen already. */
export const OneTemplate: Story = {
  args: { templatesState: { status: 'success', data: [contract] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(contract.name)).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: /send for signature/i })
    ).toBeEnabled();
  },
};

/** Sent and waiting: says when, to whom, and offers a resend. */
export const Pending: Story = {
  args: { requestsState: { status: 'success', data: [sent()] } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/sent oct 10, 2026 to robin@example.com/i)).toBeInTheDocument();
    await expect(canvas.getByText(/expires nov 9, 2026/i)).toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: /send for signature/i })
    ).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: /resend email/i }));
    await waitFor(() => expect(args.onResend).toHaveBeenCalledWith('req-1'));
  },
};

/** The link ran out: say so, and offer to send again with the same agreement. */
export const Expired: Story = {
  args: {
    requestsState: {
      status: 'success',
      data: [sent({ expiresAt: new Date('2026-10-15T16:00:00Z') })],
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/expired before it was signed/i)).toBeInTheDocument();
    const again = canvas.getByRole('button', { name: /send again/i });
    await expect(again).toBeEnabled();
    await userEvent.click(again);
    await waitFor(() => expect(args.onSend).toHaveBeenCalledWith(contract.id));
  },
};

/** Signed: nothing left to do here. */
export const Signed: Story = {
  args: {
    requestsState: {
      status: 'success',
      data: [
        sent({
          status: 'signed',
          signedAgreementId: 'sa-1',
          updatedAt: new Date('2026-10-12T15:00:00Z'),
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/signed online oct 12, 2026/i)).toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

/** No email on file: explain instead of offering a send that can't work. */
export const NoEmail: Story = {
  args: { signerEmail: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/add an email for robin ashfield/i)
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: /send/i })
    ).not.toBeInTheDocument();
  },
};

/** A failed send says why and leaves the form in place. */
export const SendFails: Story = {
  args: {
    templatesState: { status: 'success', data: [contract] },
    onSend: fn(async () => {
      throw new Error('Instructor inst-1 not found');
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: /send for signature/i })
    );
    await expect(
      await canvas.findByText('Instructor inst-1 not found')
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: /send for signature/i })
    ).toBeEnabled();
  },
};

/** Loading is not "not sent": no send controls until the requests are known. */
export const Loading: Story = {
  args: { requestsState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText(/loading agreement status/i)).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expect(canvas.queryByText(/send it to sign online/i)).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

export const LoadError: Story = {
  args: { requestsState: { status: 'error', error: 'permission-denied' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/couldn't load the agreements sent to robin ashfield/i)
    ).toBeInTheDocument();
    await expect(canvas.queryByText(/send it to sign online/i)).not.toBeInTheDocument();
  },
};
