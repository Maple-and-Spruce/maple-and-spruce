import { CalendarEmbedConfigRepository } from '@maple/firebase/database';
import type {
  RemoveCalendarEmbedSourceRequest,
  RemoveCalendarEmbedSourceResponse,
} from '@maple/ts/firebase/api-types';

export async function removeCalendarEmbedSource(
  data: RemoveCalendarEmbedSourceRequest,
): Promise<RemoveCalendarEmbedSourceResponse> {
  if (!data.sourceId) {
    throw new Error('Source ID is required');
  }
  const config = await CalendarEmbedConfigRepository.removeSource(
    data.sourceId,
  );
  return { config };
}
