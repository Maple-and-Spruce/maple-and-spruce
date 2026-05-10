import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ClassTable } from './ClassTable';
import {
  mockClasses,
  mockClass,
  mockClassDraft,
  mockClassCancelled,
  mockClassCompleted,
  mockClassCategories,
  mockActiveInstructors,
} from '../../../../../apps/maple-spruce/.storybook/fixtures';
import type { Class, RequestState } from '@maple/ts/domain';

const meta = {
  component: ClassTable,
  title: 'Classes/ClassTable',
  parameters: { layout: 'padded' },
  args: {
    onEdit: fn(),
    onDelete: fn(),
    onDuplicate: fn(),
    onViewRoster: fn(),
    instructors: mockActiveInstructors,
    categories: mockClassCategories,
  },
} satisfies Meta<typeof ClassTable>;

export default meta;
type Story = StoryObj<typeof ClassTable>;

export const Loading: Story = {
  args: {
    classesState: { status: 'loading' } as RequestState<Class[]>,
  },
};

export const Empty: Story = {
  args: {
    classesState: { status: 'success', data: [] } as RequestState<Class[]>,
  },
};

export const WithData: Story = {
  args: {
    classesState: {
      status: 'success',
      data: mockClasses,
    } as RequestState<Class[]>,
    registrationCounts: new Map([
      [mockClass.id, 3],
      [mockClassCompleted.id, mockClassCompleted.capacity],
    ]),
  },
};

export const FullClassHighlighted: Story = {
  args: {
    classesState: {
      status: 'success',
      data: [mockClass],
    } as RequestState<Class[]>,
    registrationCounts: new Map([[mockClass.id, mockClass.capacity]]),
  },
};

export const MixedStatuses: Story = {
  args: {
    classesState: {
      status: 'success',
      data: [mockClass, mockClassDraft, mockClassCancelled, mockClassCompleted],
    } as RequestState<Class[]>,
  },
};

export const ErrorState: Story = {
  args: {
    classesState: {
      status: 'error',
      error: 'Failed to load classes from the server.',
    } as RequestState<Class[]>,
  },
};
