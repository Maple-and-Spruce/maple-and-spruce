/**
 * The `settings` router (#161): app-level lists the studio edits on Settings.
 */
import type { InstrumentOption } from '@maple/ts/domain';

export type GetInstrumentsRequest = Record<string, never>;

export interface GetInstrumentsResponse {
  instruments: InstrumentOption[];
}

export interface SaveInstrumentsRequest {
  instruments: InstrumentOption[];
}

export interface SaveInstrumentsResponse {
  instruments: InstrumentOption[];
}
