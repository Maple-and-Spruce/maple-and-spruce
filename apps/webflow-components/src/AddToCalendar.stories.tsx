import { useState, type ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { AddToCalendarButton, AddToCalendarOptions } from './AddToCalendar';
import type { CalendarEvent } from './lib/add-to-calendar';

/**
 * The "Add to Calendar" choices on the registration confirmation.
 *
 * Chrome, Firefox and in-app browsers on iPhone save an .ics as a file rather
 * than opening it in Calendar, so the widget offers Google and Outlook links
 * too, and tells those visitors why Apple Calendar won't open.
 */

const EVENT: CalendarEvent = {
  start: '2030-05-14T22:00:00.000Z',
  end: '2030-05-15T01:00:00.000Z',
  title: 'Stained Glass Suncatchers',
  location: 'Maple & Spruce',
  description: 'Class at Maple & Spruce Folk Arts. Confirmation: MS-STORY1',
  uid: 'MS-STORY1@mapleandsprucefolkarts.com',
};

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1';

function Harness({ userAgent }: { userAgent: string }): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ textAlign: 'center' }}>
      <AddToCalendarButton open={open} onToggle={() => setOpen((o) => !o)} />
      <AddToCalendarOptions
        open={open}
        event={EVENT}
        userAgent={userAgent}
        maxTouchPoints={5}
      />
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Webflow/AddToCalendar',
  component: Harness,
};
export default meta;

type Story = StoryObj<typeof Harness>;

export const SafariOnIphone: Story = {
  args: { userAgent: IPHONE_SAFARI },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText('Google Calendar')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: /add to calendar/i }));

    await canvas.findByRole('button', { name: 'Apple Calendar' });
    const google = canvas.getByRole('link', { name: 'Google Calendar' });
    await expect(google.getAttribute('href')).toContain(
      'dates=20300514T220000Z%2F20300515T010000Z'
    );
    await expect(canvas.getByRole('link', { name: 'Outlook' })).toBeInTheDocument();
    // Safari opens the .ics fine, so no warning.
    await expect(canvas.queryByText(/only opens from Safari/)).toBeNull();
  },
};

export const ChromeOnIphone: Story = {
  args: { userAgent: IPHONE_CHROME },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /add to calendar/i }));
    await canvas.findByRole('link', { name: 'Google Calendar' });
    await expect(canvas.getByText(/only opens from Safari/)).toBeInTheDocument();
  },
};
