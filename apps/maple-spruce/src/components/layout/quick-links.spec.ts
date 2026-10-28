import { describe, expect, it } from 'vitest';
import { splitPinnedLinks } from '@maple/react/layout';
import { buildQuickLinks } from './quick-links';

const labels = (xs: Array<{ label: string }>) => xs.map((x) => x.label);

describe('buildQuickLinks', () => {
  it('pins Square, Wave and Tally, and keeps the rest in the old Home order', () => {
    const { pinned, more } = splitPinnedLinks(buildQuickLinks(['admin']));
    expect(labels(pinned)).toEqual(['Square', 'Wave', 'Tally']);
    expect(labels(more)).toEqual([
      'MailerLite',
      'Google Drive',
      'Facebook Ads',
      'Webflow',
      'Firebase',
      'Vercel',
      'Google Voice',
      'Hope Scholarship',
      'WV MyTaxes',
      'Apple Business',
    ]);
  });

  it('is admin only, like the old Home grid', () => {
    expect(buildQuickLinks(['clerk'])).toEqual([]);
    expect(buildQuickLinks(['mt-teacher'])).toEqual([]);
    expect(buildQuickLinks(['lesson-teacher'])).toEqual([]);
    expect(buildQuickLinks(['clerk', 'lesson-teacher', 'mt-teacher'])).toEqual([]);
    expect(buildQuickLinks([])).toEqual([]);
  });

  it('every link is an https URL with a hex colour and no roles leak through', () => {
    for (const link of buildQuickLinks(['admin'])) {
      expect(link.href).toMatch(/^https:\/\//);
      expect(link.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect('roles' in link).toBe(false);
    }
  });
});
