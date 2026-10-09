import { CalendarEmbedConfigRepository } from '@maple/firebase/database';
import type {
  GetCalendarEmbedConfigRequest,
  GetCalendarEmbedConfigResponse,
} from '@maple/ts/firebase/api-types';

export async function getCalendarEmbedConfig(
  _data: GetCalendarEmbedConfigRequest,
): Promise<GetCalendarEmbedConfigResponse> {
  const config = await CalendarEmbedConfigRepository.get();
  return { config };
}
