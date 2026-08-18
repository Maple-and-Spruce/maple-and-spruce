import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  collection: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  getDb: () => ({ collection: mocks.collection }),
}));

import { queueMail } from './mail.utility';

describe('queueMail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.collection.mockReturnValue({ add: mocks.add });
    mocks.add.mockResolvedValue({ id: 'mail-1' });
  });

  it('writes to the mail collection the Trigger Email extension watches', async () => {
    const queued = await queueMail({
      to: 'family@example.com',
      templateName: 'music-together-reminder',
      data: { sectionName: 'Tuesdays 10am' },
      sender: 'maple-spruce',
    });

    expect(queued).toBe(true);
    expect(mocks.collection).toHaveBeenCalledWith('mail');
    expect(mocks.add).toHaveBeenCalledWith({
      to: 'family@example.com',
      template: {
        name: 'music-together-reminder',
        data: { sectionName: 'Tuesdays 10am' },
      },
    });
  });

  it('routes Music Together replies to the Music Together inbox', async () => {
    await queueMail({
      to: 'family@example.com',
      templateName: 'music-together-demo-rsvp-confirmed',
      data: {},
      sender: 'music-together',
    });

    expect(mocks.add.mock.calls[0][0].replyTo).toBe(
      'musictogether@mapleandsprucefolkarts.com'
    );
  });

  it('omits from/replyTo for Maple & Spruce rather than sending empty strings', async () => {
    await queueMail({
      to: 'family@example.com',
      templateName: 'registration-confirmation',
      data: {},
      sender: 'maple-spruce',
    });

    const doc = mocks.add.mock.calls[0][0];
    expect(doc).not.toHaveProperty('replyTo');
    expect(doc).not.toHaveProperty('from');
  });

  it('never sets `from` today — Gmail SMTP would reject an unauthorized sender', async () => {
    // Guards the #775 migration seam: when a provider that supports arbitrary
    // validated senders lands, THIS is the assertion that should change.
    for (const sender of ['maple-spruce', 'music-together'] as const) {
      await queueMail({ to: 'a@b.com', templateName: 't', data: {}, sender });
    }

    for (const call of mocks.add.mock.calls) {
      expect(call[0]).not.toHaveProperty('from');
    }
  });

  it.each([
    'e2e+alpha@example.com',
    'e2e-decline+beta@example.com',
    'someone@maplespruce.test',
  ])('drops the E2E test recipient %s without writing mail', async (to) => {
    const queued = await queueMail({
      to,
      templateName: 'music-together-reminder',
      data: {},
      sender: 'music-together',
    });

    expect(queued).toBe(false);
    expect(mocks.add).not.toHaveBeenCalled();
  });
});
