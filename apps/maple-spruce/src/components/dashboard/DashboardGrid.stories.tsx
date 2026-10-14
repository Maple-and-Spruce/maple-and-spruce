import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { DashboardGrid } from './DashboardGrid';
import { TodayCard } from './TodayCard';
import { RecentRegistrationsCard } from './RecentRegistrationsCard';
import { ClassesThisWeekCard } from './ClassesThisWeekCard';
import { DASHBOARD_CARD_HEIGHT } from './DashboardCard';
import {
  FIXTURE_NOW,
  fixtureClasses,
  fixtureRegistrations,
  fixtureStudioDay,
} from './dashboard-fixtures';

const classesState = { status: 'success', data: fixtureClasses } as const;
const registrationsState = { status: 'success', data: fixtureRegistrations } as const;

/** The admin Home grid (#235) as an admin sees it. All people are invented. */
const meta = {
  component: DashboardGrid,
  title: 'Dashboard/DashboardGrid',
  parameters: { layout: 'padded', nextjs: { appDirectory: true } },
  args: {
    children: (
      <>
        <TodayCard
          lessonsState={{ status: 'success', data: fixtureStudioDay }}
          classesState={classesState}
          registrationsState={registrationsState}
          now={FIXTURE_NOW}
        />
        <RecentRegistrationsCard
          registrationsState={registrationsState}
          classesState={classesState}
          now={FIXTURE_NOW}
        />
        <ClassesThisWeekCard
          classesState={classesState}
          registrationsState={registrationsState}
          now={FIXTURE_NOW}
        />
      </>
    ),
  },
} satisfies Meta<typeof DashboardGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Admin: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const headings = canvas.getAllByRole('heading', { level: 2 });
    await expect(headings.map((h) => h.textContent)).toEqual([
      'Today',
      'Recent registrations',
      'Classes this week',
    ]);
    // Every card is the same fixed height.
    for (const h of headings) {
      const card = h.closest('section') as HTMLElement;
      await expect(card.getBoundingClientRect().height).toBe(DASHBOARD_CARD_HEIGHT);
    }
  },
};
