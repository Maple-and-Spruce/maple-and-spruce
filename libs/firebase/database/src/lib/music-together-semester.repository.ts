/**
 * Music Together Semester Repository
 *
 * Firestore operations for Music Together semesters (one term of the program
 * year). All database access goes through this repository (deny-all rules;
 * Admin SDK). Sections reference a semester via `section.semesterId`.
 */
import { getDb, toDate } from './utilities/database.config';
import {
  mtSemesterSortValue,
  type MusicTogetherSemester,
  type MusicTogetherSemesterBreak,
  type MusicTogetherSemesterStatus,
  type MusicTogetherSeason,
  type CreateMusicTogetherSemesterInput,
  type UpdateMusicTogetherSemesterInput,
} from '@maple/ts/domain';

const COLLECTION = 'musicTogetherSemesters';

function parseBreaks(raw: unknown): MusicTogetherSemesterBreak[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: MusicTogetherSemesterBreak[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { label?: unknown; startDate?: unknown; endDate?: unknown };
    if (typeof e.label !== 'string' || e.startDate == null || e.endDate == null) {
      continue;
    }
    out.push({
      label: e.label,
      startDate: toDate(e.startDate),
      endDate: toDate(e.endDate),
    });
  }
  return out.length > 0 ? out : undefined;
}

function parseDates(raw: unknown): Date[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out = raw.filter((d) => d != null).map((d) => toDate(d));
  return out.length > 0 ? out : undefined;
}

function docToSemester(
  doc: FirebaseFirestore.DocumentSnapshot
): MusicTogetherSemester | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    name: data.name,
    season: data.season as MusicTogetherSeason,
    year: data.year,
    startDate: data.startDate ? toDate(data.startDate) : undefined,
    endDate: data.endDate ? toDate(data.endDate) : undefined,
    weeks: data.weeks,
    breaks: parseBreaks(data.breaks),
    weatherMakeupDates: parseDates(data.weatherMakeupDates),
    enrollmentOpensAt: data.enrollmentOpensAt
      ? toDate(data.enrollmentOpensAt)
      : undefined,
    status: data.status as MusicTogetherSemesterStatus,
    notes: data.notes,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/**
 * Build the persisted payload, denormalizing `sortValue` as an indexed sort
 * key so semesters list in chronological program-year order (mirrors the
 * section repo's `firstSessionAt`). The field is write-only, not on the domain
 * interface.
 */
function toPersisted(
  input:
    | CreateMusicTogetherSemesterInput
    | Omit<UpdateMusicTogetherSemesterInput, 'id'>
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...input };
  if (input.season !== undefined && input.year !== undefined) {
    data.sortValue = mtSemesterSortValue({
      season: input.season,
      year: input.year,
      startDate: input.startDate,
    });
  }
  return data;
}

export interface MusicTogetherSemesterFilters {
  status?: MusicTogetherSemesterStatus;
}

export const MusicTogetherSemesterRepository = {
  async findAll(
    filters?: MusicTogetherSemesterFilters
  ): Promise<MusicTogetherSemester[]> {
    let query: FirebaseFirestore.Query = getDb().collection(COLLECTION);

    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }

    query = query.orderBy('sortValue', 'asc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToSemester(doc))
      .filter((s): s is MusicTogetherSemester => s !== undefined);
  },

  async findById(id: string): Promise<MusicTogetherSemester | undefined> {
    const doc = await getDb().collection(COLLECTION).doc(id).get();
    return docToSemester(doc);
  },

  async create(
    input: CreateMusicTogetherSemesterInput
  ): Promise<MusicTogetherSemester> {
    const docRef = getDb().collection(COLLECTION).doc();
    const now = new Date();
    const data = { ...toPersisted(input), createdAt: now, updatedAt: now };
    await docRef.set(data);
    const created = await docRef.get();
    const semester = docToSemester(created);
    if (!semester) {
      throw new Error(`Semester ${docRef.id} not found after create`);
    }
    return semester;
  },

  async update(
    input: UpdateMusicTogetherSemesterInput
  ): Promise<MusicTogetherSemester> {
    const { id, ...updates } = input;
    const docRef = getDb().collection(COLLECTION).doc(id);
    await docRef.update({ ...toPersisted(updates), updatedAt: new Date() });
    const updated = await docRef.get();
    const semester = docToSemester(updated);
    if (!semester) {
      throw new Error(`Semester ${id} not found after update`);
    }
    return semester;
  },

  async delete(id: string): Promise<void> {
    await getDb().collection(COLLECTION).doc(id).delete();
  },
};
