import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { AgreementSection } from '@maple/ts/domain';
import { SigningForm } from './SigningForm';

/**
 * The public signing page's form. A contractor agreement lists each required
 * acknowledgment as its own checkbox; signing is refused until all are ticked.
 */
const sections: AgreementSection[] = [
  {
    id: 'contractor',
    title: '1. Independent contractor',
    content: '<p>By checking each box below, you acknowledge that you:</p>',
    responseType: 'acknowledgment',
    acknowledgmentItems: [
      'Provide services as an independent contractor.',
      'Will not be treated as an employee.',
      "Will not receive workers' compensation or unemployment benefits through Maple & Spruce.",
      'Are responsible for your own income taxes, and nothing will be withheld.',
      'Are responsible for your own supplies and expenses.',
    ],
  },
  { id: 'pay', title: '3. Pay', content: '<p>You receive 75% of what students pay.</p>' },
  {
    id: 'safety',
    title: '6. Safety and conduct',
    content: '<p>Follow the posted studio rules.</p>',
    responseType: 'acknowledgment',
  },
];

const meta = {
  title: 'Agreements/SigningForm',
  component: SigningForm,
  parameters: { layout: 'padded' },
  args: {
    templateName: 'Class Instructor Agreement (1099)',
    sections,
    supportsMinor: false,
    signerName: 'Robin Ashfield',
    signerEmail: 'robin@example.com',
    onSubmit: fn(async () => undefined),
  },
} satisfies Meta<typeof SigningForm>;

export default meta;
type Story = StoryObj<typeof meta>;

async function sign(canvasElement: HTMLElement): Promise<void> {
  const canvas = canvasElement.querySelector('canvas');
  if (!canvas) throw new Error('no signature canvas');
  const rect = canvas.getBoundingClientRect();
  const at = (dx: number, dy: number) => ({
    clientX: rect.left + dx,
    clientY: rect.top + dy,
    bubbles: true,
    pointerId: 1,
    buttons: 1,
  });
  canvas.dispatchEvent(new PointerEvent('pointerdown', at(20, 20)));
  canvas.dispatchEvent(new PointerEvent('pointermove', at(80, 60)));
  canvas.dispatchEvent(new PointerEvent('pointermove', at(140, 30)));
  canvas.dispatchEvent(new PointerEvent('pointerup', at(140, 30)));
  canvas.dispatchEvent(new MouseEvent('mousedown', at(20, 20)));
  canvas.dispatchEvent(new MouseEvent('mousemove', at(80, 60)));
  canvas.dispatchEvent(new MouseEvent('mouseup', at(80, 60)));
}

/** Each statement is its own checkbox, plus one for a section with none. */
export const Acknowledgments: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const boxes = canvas.getAllByRole('checkbox');
    await expect(boxes).toHaveLength(6);
    await expect(
      canvas.getByRole('checkbox', { name: /will not be treated as an employee/i })
    ).not.toBeChecked();
    await expect(
      canvas.getByRole('checkbox', { name: /i have read and agree to this section/i })
    ).toBeInTheDocument();
  },
};

/** Signing with a box unticked is refused, and says why. */
export const MissingAcknowledgment: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const boxes = canvas.getAllByRole('checkbox');
    for (const box of boxes.slice(0, 5)) await userEvent.click(box);
    await sign(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /sign agreement/i }));
    await expect(
      await canvas.findByText(/please check each statement above to continue/i)
    ).toBeInTheDocument();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/** All ticked and signed: every checkbox key goes to the server. */
export const AllAcknowledged: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    for (const box of canvas.getAllByRole('checkbox')) await userEvent.click(box);
    await sign(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /sign agreement/i }));
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalled());
    const [data] = (args.onSubmit as ReturnType<typeof fn>).mock.calls[0];
    await expect([...data.acknowledgments].sort()).toEqual(
      [
        'contractor:0',
        'contractor:1',
        'contractor:2',
        'contractor:3',
        'contractor:4',
        'safety:section',
      ].sort()
    );
    await expect(data.printedName).toBe('Robin Ashfield');
  },
};
