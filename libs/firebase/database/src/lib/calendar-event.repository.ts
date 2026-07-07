/**
 * Calendar Event Repository
 *
 * Handles all Firestore operations for calendar events.
 * All database access should go through this repository.
 */
import { db, toDate } from './utilities/database.config';
import type {
  CalendarEvent,
  CalendarEventType,
  CreateCalendarEventInput,
  Room,
  UpdateCalendarEventInput,
} from '@maple/ts/domain';

const COLLECTION = 'calendarEvents';

/**
 * Convert Firestore document to CalendarEvent
 */
function docToCalendarEvent(
  doc: FirebaseFirestore.DocumentSnapshot
): CalendarEvent | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    title: data.title,
    description: data.description,
    startDateTime: toDate(data.startDateTime),
    endDateTime: toDate(data.endDateTime),
    recurrenceRule: data.recurrenceRule ?? null,
    location: data.location,
    type: data.type,
    public: data.public,
    room: data.room ?? null,
    sourceRef: data.sourceRef ?? null,
    createdBy: data.createdBy,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/**
 * Filters for querying calendar events
 */
export interface CalendarEventFilters {
  type?: CalendarEventType;
  /** Only return public events */
  publicOnly?: boolean;
  /** Only return private (public == false) events */
  privateOnly?: boolean;
}

/**
 * Calendar Event Repository - handles all Firestore operations for calendar events
 */
export const CalendarEventRepository = {
  /**
   * Find all calendar events with optional filters
   */
  async findAll(filters?: CalendarEventFilters): Promise<CalendarEvent[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters?.type) {
      query = query.where('type', '==', filters.type);
    }

    if (filters?.publicOnly) {
      query = query.where('public', '==', true);
    }

    if (filters?.privateOnly) {
      query = query.where('public', '==', false);
    }

    query = query.orderBy('startDateTime', 'asc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToCalendarEvent(doc))
      .filter((e): e is CalendarEvent => e !== undefined);
  },

  /**
   * Find a calendar event by ID
   */
  async findById(id: string): Promise<CalendarEvent | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToCalendarEvent(doc);
  },

  /**
   * Find all public calendar events
   */
  async findPublic(): Promise<CalendarEvent[]> {
    return this.findAll({ publicOnly: true });
  },

  /**
   * Find all private (public == false) calendar events.
   *
   * Backs the unauthenticated /calendar/private.ics planning feed. These are
   * the room-occupying events that never reach the public feeds — lessons
   * (auto-titled "Music Lesson", no student names) and ad-hoc private blocks.
   */
  async findPrivate(): Promise<CalendarEvent[]> {
    return this.findAll({ privateOnly: true });
  },

  /**
   * Find public calendar events by type
   */
  async findPublicByType(type: CalendarEventType): Promise<CalendarEvent[]> {
    return this.findAll({ type, publicOnly: true });
  },

  /**
   * Find all events occupying a room that overlap the given time range.
   *
   * Firestore only allows a range filter on one field, so the query bounds
   * `startDateTime` and the `endDateTime > rangeStart` overlap condition is
   * applied in memory. A 24-hour lookback before `rangeStart` catches events
   * that started before the range but spill into it — no room event is
   * expected to span longer than a day.
   */
  async findByRoomInRange(
    room: Room,
    rangeStart: Date,
    rangeEnd: Date
  ): Promise<CalendarEvent[]> {
    const lookback = new Date(rangeStart.getTime() - 24 * 60 * 60 * 1000);

    const snapshot = await db
      .collection(COLLECTION)
      .where('room', '==', room)
      .where('startDateTime', '>=', lookback)
      .where('startDateTime', '<', rangeEnd)
      .orderBy('startDateTime', 'asc')
      .get();

    return snapshot.docs
      .map((doc) => docToCalendarEvent(doc))
      .filter((e): e is CalendarEvent => e !== undefined)
      .filter((e) => e.endDateTime.getTime() > rangeStart.getTime());
  },

  /**
   * Find the first calendar event by source reference (e.g. "classes/abc123").
   *
   * For sources that may map to multiple events (e.g. a multi-session class),
   * prefer `findAllBySourceRef`.
   */
  async findBySourceRef(sourceRef: string): Promise<CalendarEvent | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('sourceRef', '==', sourceRef)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return undefined;
    }

    return docToCalendarEvent(snapshot.docs[0]);
  },

  /**
   * Find all calendar events for a given source reference.
   * Used by reconcilers that may create multiple events per source
   * (e.g. one event per session of a multi-session class).
   */
  async findAllBySourceRef(sourceRef: string): Promise<CalendarEvent[]> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('sourceRef', '==', sourceRef)
      .get();

    return snapshot.docs
      .map((doc) => docToCalendarEvent(doc))
      .filter((e): e is CalendarEvent => e !== undefined);
  },

  /**
   * Create or replace a calendar event at a caller-supplied document ID.
   * Useful for reconcilers that need stable, deterministic IDs.
   */
  async upsertWithId(
    id: string,
    input: CreateCalendarEventInput
  ): Promise<CalendarEvent> {
    const docRef = db.collection(COLLECTION).doc(id);
    const existing = await docRef.get();
    const now = new Date();

    const data = {
      ...input,
      startDateTime: new Date(input.startDateTime),
      endDateTime: new Date(input.endDateTime),
      createdAt: existing.exists ? toDate(existing.data()?.createdAt) : now,
      updatedAt: now,
    };

    await docRef.set(data);

    return { id, ...data };
  },

  /**
   * Create a new calendar event
   */
  async create(input: CreateCalendarEventInput): Promise<CalendarEvent> {
    const docRef = db.collection(COLLECTION).doc();
    const now = new Date();

    const data = {
      ...input,
      startDateTime: new Date(input.startDateTime),
      endDateTime: new Date(input.endDateTime),
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(data);

    return {
      id: docRef.id,
      ...data,
    };
  },

  /**
   * Update an existing calendar event
   */
  async update(input: UpdateCalendarEventInput): Promise<CalendarEvent> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    const dataWithTimestamp = {
      ...updates,
      ...(updates.startDateTime ? { startDateTime: new Date(updates.startDateTime) } : {}),
      ...(updates.endDateTime ? { endDateTime: new Date(updates.endDateTime) } : {}),
      updatedAt: new Date(),
    };

    await docRef.update(dataWithTimestamp);

    const updated = await docRef.get();
    const event = docToCalendarEvent(updated);

    if (!event) {
      throw new Error(`Calendar event ${id} not found after update`);
    }

    return event;
  },

  /**
   * Delete a calendar event
   */
  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },
};
