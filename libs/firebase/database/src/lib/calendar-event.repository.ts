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
   * Find public calendar events by type
   */
  async findPublicByType(type: CalendarEventType): Promise<CalendarEvent[]> {
    return this.findAll({ type, publicOnly: true });
  },

  /**
   * Find calendar event by source reference (e.g. "classes/abc123")
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
