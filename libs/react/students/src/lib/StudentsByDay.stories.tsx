import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, within, screen } from 'storybook/test';
import type { Instructor, Student, StudentLessonSchedule } from '@maple/ts/domain';
import { StudentsByDay } from './StudentsByDay';

const NOW = new Date('2026-10-01T12:00:00Z');

const student = (id: string, name: string, over: Partial<Student> = {}): Student => ({
  id,
  name,
  instrument: 'violin',
  registeredLessonLength: '30-min-full',
  isAdultStudent: false,
  primaryTeacherId: 'katie',
  isHopeScholarship: false,
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const weekly = (
  studentId: string,
  dayOfWeek: number,
  startMinutes: number,
  teacherId = 'katie'
): StudentLessonSchedule => ({
  id: `sched-${studentId}`,
  studentId,
  teacherId,
  blockId: 'block',
  dayOfWeek,
  startMinutes,
  durationMinutes: 30,
  startsOn: NOW,
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW,
});

const students = [
  student('s1', 'Test Student One'),
  student('s2', 'Test Student Two', { instrument: 'cello', isHopeScholarship: true }),
  student('s3', 'Test Student Three', { primaryTeacherId: 'nathan', instrument: 'guitar' }),
  student('s4', 'Test Student Four'),
  student('s5', 'Test Student Five', { status: 'inactive' }),
];
const schedules = [
  weekly('s1', 2, 17 * 60),
  weekly('s2', 2, 16 * 60),
  weekly('s3', 4, 15 * 60, 'nathan'),
];
const instructors = [
  { id: 'katie', name: 'Katie' },
  { id: 'nathan', name: 'Nathan' },
] as Instructor[];

const meta: Meta<typeof StudentsByDay> = {
  title: 'Students/StudentsByDay',
  component: StudentsByDay,
  parameters: { layout: 'padded' },
  args: {
    studentsState: { status: 'success', data: students },
    schedulesState: { status: 'success', data: schedules },
    instructors,
    teacherId: 'katie',
    showTeacher: false,
    todayWeekday: 2,
    hrefFor: (s: Student) => `/students/${s.id}`,
    onEdit: fn(),
    onDelete: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof StudentsByDay>;

/** Katie's own students, by day, earliest first; today is marked. */
export const MyWeek: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const headings = canvas.getAllByRole('heading', { level: 2 });
    await expect(headings.map((h) => h.textContent)).toEqual([
      'Tuesday',
      'No regular time',
      'Inactive',
    ]);
    await expect(canvas.getByText('Today')).toBeInTheDocument();

    const tuesday = within(canvas.getByRole('list', { name: 'Tuesday' }));
    const rows = tuesday.getAllByRole('link');
    await expect(rows[0]).toHaveTextContent('4:00 PM');
    await expect(rows[0]).toHaveTextContent('Test Student Two');
    await expect(rows[1]).toHaveTextContent('Test Student One');
    // Nathan's student is not Katie's.
    await expect(canvas.queryByText('Test Student Three')).not.toBeInTheDocument();
  },
};

/** A row opens the student page. */
export const RowOpensTheStudent: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: /Test Student One/ })).toHaveAttribute(
      'href',
      '/students/s1'
    );
  },
};

/** Everyone's students, with the teacher named on each. */
export const Everyone: Story = {
  args: { teacherId: undefined, showTeacher: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Thursday' })).toBeInTheDocument();
    await expect(canvas.getByText(/Guitar · 30 min \(full\) · Nathan/)).toBeInTheDocument();
  },
};

/** The menu holds only what the student page does not: edit and delete. */
export const EditAndDelete: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Actions for Test Student One' }));
    const items = await screen.findAllByRole('menuitem');
    await expect(items.map((i) => i.textContent)).toEqual(['Edit student…', 'Delete']);
    await userEvent.click(items[0]);
    await expect(args.onEdit).toHaveBeenCalledWith(students[0]);
  },
};

export const NoneOfMine: Story = {
  args: {
    studentsState: { status: 'success', data: [students[2]] },
    schedulesState: { status: 'success', data: [schedules[2]] },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/Show everyone’s to see the rest/)
    ).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { schedulesState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    await expect(within(canvasElement).queryByText('No students yet')).not.toBeInTheDocument();
  },
};

export const LoadFailed: Story = {
  args: { studentsState: { status: 'error', error: 'network down' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Could not load students: network down')).toBeInTheDocument();
    await expect(canvas.queryByText('No students yet')).not.toBeInTheDocument();
  },
};
