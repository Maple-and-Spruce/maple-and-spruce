/**
 * Calendar Embed Config Repository
 *
 * Singleton document at config/calendarEmbed. Seeds defaults on first read.
 */
import { db, toDate } from './utilities/database.config';
import type {
  CalendarEmbedConfig,
  CalendarEmbedSource,
  UpdateCalendarEmbedSettingsInput,
  CreateCalendarEmbedSourceInput,
  UpdateCalendarEmbedSourceInput,
} from '@maple/ts/domain';

const COLLECTION = 'config';
const DOC_ID = 'calendarEmbed';

function generateId(): string {
  return db.collection('_').doc().id;
}

const DEFAULT_SYSTEM_SOURCES: CalendarEmbedSource[] = [
  {
    id: 'system-classes',
    label: 'Classes & Workshops',
    url: '/calendar/classes.ics',
    color: '6B7B5E',
    isSystem: true,
    enabled: true,
  },
  {
    id: 'system-music',
    label: 'Music Lessons',
    url: '/calendar/music.ics',
    color: '4A3728',
    isSystem: true,
    enabled: true,
  },
  {
    id: 'system-events',
    label: 'Events & Jams',
    url: '/calendar/events.ics',
    color: 'C17817',
    isSystem: true,
    enabled: true,
  },
  {
    id: 'system-hours',
    label: 'Store Hours',
    url: '/calendar/hours.ics',
    color: '7A7A6E',
    isSystem: true,
    enabled: true,
  },
];

function buildDefaultConfig(): Omit<CalendarEmbedConfig, 'updatedAt'> {
  return {
    owcBaseUrl: 'https://open-web-calendar-thz2.vercel.app',
    defaultTab: 'month',
    tabs: ['month', 'week', 'agenda'],
    skin: 'material',
    startOfWeek: 'su',
    timezone: 'America/New_York',
    title: 'Maple & Spruce Calendar',
    cssUrl: '',
    sources: DEFAULT_SYSTEM_SOURCES,
  };
}

function docToConfig(
  doc: FirebaseFirestore.DocumentSnapshot
): CalendarEmbedConfig | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    owcBaseUrl: data.owcBaseUrl,
    defaultTab: data.defaultTab,
    tabs: data.tabs,
    skin: data.skin,
    startOfWeek: data.startOfWeek,
    timezone: data.timezone,
    title: data.title,
    cssUrl: data.cssUrl ?? '',
    sources: data.sources ?? [],
    updatedAt: toDate(data.updatedAt),
  };
}

export const CalendarEmbedConfigRepository = {
  async get(): Promise<CalendarEmbedConfig> {
    const docRef = db.collection(COLLECTION).doc(DOC_ID);
    const doc = await docRef.get();

    if (doc.exists) {
      return docToConfig(doc)!;
    }

    // Seed on first read
    const now = new Date();
    const defaults = buildDefaultConfig();
    const data = { ...defaults, updatedAt: now };
    await docRef.set(data);
    return { ...data, updatedAt: now };
  },

  async update(
    input: UpdateCalendarEmbedSettingsInput
  ): Promise<CalendarEmbedConfig> {
    const docRef = db.collection(COLLECTION).doc(DOC_ID);
    // Ensure doc exists
    await this.get();

    const { ...updates } = input;
    await docRef.update({ ...updates, updatedAt: new Date() });

    const updated = await docRef.get();
    return docToConfig(updated)!;
  },

  async addSource(
    input: CreateCalendarEmbedSourceInput
  ): Promise<CalendarEmbedConfig> {
    const config = await this.get();
    const newSource: CalendarEmbedSource = {
      ...input,
      id: generateId(),
      isSystem: false,
    };

    const sources = [...config.sources, newSource];
    const docRef = db.collection(COLLECTION).doc(DOC_ID);
    await docRef.update({ sources, updatedAt: new Date() });

    const updated = await docRef.get();
    return docToConfig(updated)!;
  },

  async updateSource(
    input: UpdateCalendarEmbedSourceInput
  ): Promise<CalendarEmbedConfig> {
    const config = await this.get();
    const sourceIndex = config.sources.findIndex((s) => s.id === input.id);
    if (sourceIndex === -1) {
      throw new Error(`Source ${input.id} not found`);
    }

    const existing = config.sources[sourceIndex];
    const { id, ...updates } = input;

    // System sources: only allow color and enabled changes
    const updatedSource = existing.isSystem
      ? {
          ...existing,
          ...(updates.color !== undefined && { color: updates.color }),
          ...(updates.enabled !== undefined && { enabled: updates.enabled }),
        }
      : { ...existing, ...updates };

    const sources = [...config.sources];
    sources[sourceIndex] = updatedSource;

    const docRef = db.collection(COLLECTION).doc(DOC_ID);
    await docRef.update({ sources, updatedAt: new Date() });

    const updated = await docRef.get();
    return docToConfig(updated)!;
  },

  async removeSource(sourceId: string): Promise<CalendarEmbedConfig> {
    const config = await this.get();
    const source = config.sources.find((s) => s.id === sourceId);
    if (!source) {
      throw new Error(`Source ${sourceId} not found`);
    }
    if (source.isSystem) {
      throw new Error('Cannot remove system calendar source');
    }

    const sources = config.sources.filter((s) => s.id !== sourceId);
    const docRef = db.collection(COLLECTION).doc(DOC_ID);
    await docRef.update({ sources, updatedAt: new Date() });

    const updated = await docRef.get();
    return docToConfig(updated)!;
  },
};
