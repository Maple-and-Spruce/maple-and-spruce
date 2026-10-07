/**
 * Instruments Config Repository (#161)
 *
 * Single config doc (`appConfig/instruments`) holding the instruments the
 * studio teaches. Until someone edits the list it reads as the default
 * (violin, fiddle, guitar, harp), so nothing has to be seeded.
 */
import { db, toDate } from './utilities/database.config';
import { DEFAULT_INSTRUMENT_OPTIONS } from '@maple/ts/domain';
import type { InstrumentOption, InstrumentsConfig } from '@maple/ts/domain';

const CONFIG_COLLECTION = 'appConfig';
const CONFIG_DOC = 'instruments';

function docRef() {
  return db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC);
}

export const InstrumentsConfigRepository = {
  async get(): Promise<InstrumentsConfig> {
    const doc = await docRef().get();
    const data = doc.exists ? doc.data() : undefined;
    const stored = (data?.['instruments'] ?? []) as InstrumentOption[];
    return {
      instruments:
        stored.length > 0
          ? stored.map((o) => ({ key: o.key, label: o.label }))
          : DEFAULT_INSTRUMENT_OPTIONS,
      updatedAt: data?.['updatedAt'] ? toDate(data['updatedAt']) : undefined,
      updatedByUid: data?.['updatedByUid'] ?? undefined,
    };
  },

  async setInstruments(
    instruments: InstrumentOption[],
    updatedByUid?: string
  ): Promise<InstrumentsConfig> {
    await docRef().set(
      {
        instruments: instruments.map((o) => ({ key: o.key, label: o.label })),
        updatedAt: new Date(),
        updatedByUid: updatedByUid ?? null,
      },
      { merge: true }
    );
    return this.get();
  },
};
