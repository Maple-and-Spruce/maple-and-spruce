/**
 * Time entry repository
 *
 * All Firestore operations for time entries. Entry documents are auto-IDed
 * (we don't reuse the employee UID — multiple entries per employee).
 */
import { db, toDate } from './utilities/database.config';
import type {
  TimeEntry,
  TimeEntryStatus,
  CreateTimeEntryInput,
  UpdateTimeEntryInput,
} from '@maple/ts/domain';

const COLLECTION = 'timeEntries';

export interface TimeEntryFilters {
  employeeId?: string;
  status?: TimeEntryStatus;
  /** YYYY-MM-DD inclusive */
  startDate?: string;
  /** YYYY-MM-DD inclusive */
  endDate?: string;
}

function docToTimeEntry(
  doc: FirebaseFirestore.DocumentSnapshot
): TimeEntry | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data();
  if (!data) return undefined;

  return {
    id: doc.id,
    employeeId: data['employeeId'],
    date: data['date'],
    hours: data['hours'],
    notes: data['notes'],
    status: data['status'],
    hourlyRateAtCreation: data['hourlyRateAtCreation'],
    paidAt: data['paidAt'] ? toDate(data['paidAt']) : undefined,
    paidBy: data['paidBy'],
    createdAt: toDate(data['createdAt']),
    updatedAt: toDate(data['updatedAt']),
  };
}

export const TimeEntryRepository = {
  async findById(id: string): Promise<TimeEntry | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToTimeEntry(doc);
  },

  async findAll(filters?: TimeEntryFilters): Promise<TimeEntry[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters?.employeeId) {
      query = query.where('employeeId', '==', filters.employeeId);
    }
    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }
    if (filters?.startDate) {
      query = query.where('date', '>=', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.where('date', '<=', filters.endDate);
    }

    query = query.orderBy('date', 'desc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToTimeEntry(doc))
      .filter((e): e is TimeEntry => e !== undefined);
  },

  async create(
    input: CreateTimeEntryInput & { hourlyRateAtCreation: number }
  ): Promise<TimeEntry> {
    const docRef = db.collection(COLLECTION).doc();
    const now = new Date();

    const data = {
      employeeId: input.employeeId,
      date: input.date,
      hours: input.hours,
      notes: input.notes,
      status: 'unpaid' as const,
      hourlyRateAtCreation: input.hourlyRateAtCreation,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(data);

    return {
      id: docRef.id,
      ...data,
    };
  },

  async update(input: UpdateTimeEntryInput): Promise<TimeEntry> {
    const { id, ...rest } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    await docRef.update({
      ...rest,
      updatedAt: new Date(),
    });

    const doc = await docRef.get();
    const entry = docToTimeEntry(doc);
    if (!entry) {
      throw new Error(`TimeEntry ${id} not found after update`);
    }
    return entry;
  },

  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },

  /**
   * Mark a batch of entries paid in a single Firestore commit.
   * Entries that are already paid are silently skipped — the caller
   * gets back the IDs that actually transitioned, plus the skip count.
   */
  async markPaid(
    ids: string[],
    paidBy: string
  ): Promise<{ updatedIds: string[]; alreadyPaidCount: number }> {
    if (ids.length === 0) {
      return { updatedIds: [], alreadyPaidCount: 0 };
    }

    const refs = ids.map((id) => db.collection(COLLECTION).doc(id));
    const snapshots = await db.getAll(...refs);
    const now = new Date();
    const batch = db.batch();
    const updatedIds: string[] = [];
    let alreadyPaidCount = 0;

    for (const snap of snapshots) {
      if (!snap.exists) continue;
      const data = snap.data();
      if (data?.['status'] === 'paid') {
        alreadyPaidCount += 1;
        continue;
      }
      batch.update(snap.ref, {
        status: 'paid',
        paidAt: now,
        paidBy,
        updatedAt: now,
      });
      updatedIds.push(snap.id);
    }

    if (updatedIds.length > 0) {
      await batch.commit();
    }

    return { updatedIds, alreadyPaidCount };
  },
};
