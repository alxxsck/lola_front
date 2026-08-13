import { paginateByCursor } from '@/shared/lib/paged-search';
import type { EventPickerOption, EventPickerPage, EventPickerRequest } from './EventPicker.vue';

export function createLocalEventPickerLoader(
  options: () => EventPickerOption[],
): (request: EventPickerRequest) => Promise<EventPickerPage> {
  return async (request) => {
    const query = request.query.trim().toLocaleLowerCase('ru-RU');
    const filtered = options().filter(
      (option) =>
        (!request.ingestion || option.ingestion === request.ingestion) &&
        (!query ||
          option.name.toLocaleLowerCase('ru-RU').includes(query) ||
          option.code.toLocaleLowerCase('ru-RU').includes(query) ||
          option.description?.toLocaleLowerCase('ru-RU').includes(query)),
    );
    const page = paginateByCursor(filtered, request.cursor, request.limit);
    return { items: page.items, nextCursor: page.nextCursor };
  };
}
