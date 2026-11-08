import { useState, type ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { classCalendarEntries, type ClassCalendarEntry } from '@maple/ts/domain';
import { AddToCalendarButton, AddToCalendarOptions } from './AddToCalendar';

/**
 * The "Add to Calendar" choices on the registration confirmation.
 *
 * Chrome, Firefox and in-app browsers on iPhone save an .ics as a file rather
 * than opening it in Calendar, so the widget offers Google, Outlook and
 * Microsoft 365 links too, and tells those visitors why Apple Calendar won't
 * open. A class that meets several times gets every session.
 */

const ONE_SESSION = classCalendarEntries({
  name: 'Stained Glass Suncatchers',
  sessions: [{ dateTime: '2030-05-14T22:00:00.000Z' }],
  durationMinutes: 180,
  location: 'Maple & Spruce',
  confirmationNumber: 'MS-STORY1',
});

const THREE_SESSIONS = classCalendarEntries({
  name: 'Wheel Throwing',
  sessions: [
    { dateTime: '2030-05-14T22:00:00.000Z' },
    { dateTime: '2030-05-21T22:00:00.000Z' },
    { dateTime: '2030-05-28T22:00:00.000Z' },
  ],
  durationMinutes: 120,
  location: 'Maple & Spruce',
  confirmationNumber: 'MS-STORY3',
});

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1';

function Harness({
  userAgent,
  entries,
}: {
  userAgent: string;
  entries: ClassCalendarEntry[];
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ textAlign: 'center' }}>
      <AddToCalendarButton open={open} onToggle={() => setOpen((o) => !o)} />
      <AddToCalendarOptions
        open={open}
        entries={entries}
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
  args: { userAgent: IPHONE_SAFARI, entries: ONE_SESSION },
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
    await expect(
      canvas.getByRole('link', { name: 'Microsoft 365' }).getAttribute('href')
    ).toContain('outlook.office.com');
    // Safari opens the .ics fine, so no warning.
    await expect(canvas.queryByText(/only opens from Safari/)).toBeNull();
  },
};

export const ChromeOnIphone: Story = {
  args: { userAgent: IPHONE_CHROME, entries: ONE_SESSION },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /add to calendar/i }));
    await canvas.findByRole('link', { name: 'Google Calendar' });
    await expect(canvas.getByText(/only opens from Safari/)).toBeInTheDocument();
  },
};

/** A class that meets three times: the .ics has all three, the links go per session. */
export const ThreeSessions: Story = {
  args: { userAgent: IPHONE_SAFARI, entries: THREE_SESSIONS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /add to calendar/i }));
    await canvas.findByRole('button', { name: 'Apple Calendar (all 3 sessions)' });

    const googleLinks = canvas.getAllByRole('link', { name: /^Google Calendar,/ });
    await expect(googleLinks).toHaveLength(3);
    await expect(googleLinks[2].getAttribute('href')).toContain(
      'dates=20300528T220000Z'
    );
    await expect(
      canvas.getByRole('link', { name: /^Outlook, Tue, May 21/ })
    ).toBeInTheDocument();
  },
};
