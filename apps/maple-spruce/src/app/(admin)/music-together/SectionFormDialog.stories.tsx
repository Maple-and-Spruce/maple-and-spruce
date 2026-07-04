import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import type { MusicTogetherSection } from '@maple/ts/domain';
import { SectionFormDialog } from './SectionFormDialog';

const mockSection: MusicTogetherSection = {
  id: 'sec-1',
  name: 'Spring 2026 — Tuesdays 10am',
  description: 'A joyful early-childhood music term.',
  sessions: [
    { dateTime: new Date('2030-04-02T14:00:00Z') },
    { dateTime: new Date('2030-04-09T14:00:00Z') },
  ],
  capacityFamilies: 8,
  priceFullCents: 25200,
  installmentPlan: [
    { amountCents: 13200, dueAt: new Date('2030-04-02T14:00:00Z') },
    { amountCents: 13200, dueAt: new Date('2030-04-30T14:00:00Z') },
  ],
  status: 'open',
  location: 'Studio',
  room: 'spruce',
  createdAt: new Date('2030-01-01T00:00:00Z'),
  updatedAt: new Date('2030-01-01T00:00:00Z'),
};

const meta = {
  component: SectionFormDialog,
  title: 'MusicTogether/SectionFormDialog',
  parameters: { layout: 'centered', a11y: { disable: true } },
  args: {
    open: true,
    onClose: fn(),
    onSubmit: fn(),
    isSubmitting: false,
  },
} satisfies Meta<typeof SectionFormDialog>;

export default meta;
type Story = StoryObj<typeof SectionFormDialog>;

/** New section — defaults prefilled ($252 full, capacity 8), empty schedule. */
export const Create: Story = {};

/** Editing an existing section — all fields + a 2× installment plan populated. */
export const Edit: Story = {
  args: { section: mockSection },
};

export const Submitting: Story = {
  args: { section: mockSection, isSubmitting: true },
};
