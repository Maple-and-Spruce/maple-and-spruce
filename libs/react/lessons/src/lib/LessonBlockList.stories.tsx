import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { LessonBlockList } from './LessonBlockList';
import {
  mockInstructor,
  mockInstructor2,
  mockLessonBlocks,
} from '@maple/react/storybook-fixtures';

const instructors = [mockInstructor, mockInstructor2];

const meta = {
  component: LessonBlockList,
  title: 'Lessons/LessonBlockList',
  parameters: { layout: 'padded' },
  args: {
    instructors,
    onEdit: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof LessonBlockList>;

export default meta;
type Story = StoryObj<typeof LessonBlockList>;

export const Populated: Story = {
  args: {
    lessonBlocksState: { status: 'success', data: mockLessonBlocks },
  },
};

export const Empty: Story = {
  args: { lessonBlocksState: { status: 'success', data: [] } },
};

export const Loading: Story = {
  args: { lessonBlocksState: { status: 'loading' } },
};

export const ErrorState: Story = {
  args: {
    lessonBlocksState: { status: 'error', error: 'Could not load blocks.' },
  },
};
