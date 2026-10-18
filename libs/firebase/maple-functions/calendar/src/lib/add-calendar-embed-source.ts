import { CalendarEmbedConfigRepository } from '@maple/firebase/database';
import type {
  AddCalendarEmbedSourceRequest,
  AddCalendarEmbedSourceResponse,
} from '@maple/ts/firebase/api-types';

export async function addCalendarEmbedSource(
  data: AddCalendarEmbedSourceRequest,
): Promise<AddCalendarEmbedSourceResponse> {
  if (!data.label || !data.url) {
    throw new Error('Label and URL are required');
  }
  const config = await CalendarEmbedConfigRepository.addSource(data);
  return { config };
}
