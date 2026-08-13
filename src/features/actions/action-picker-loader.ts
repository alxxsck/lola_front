import { paginateByCursor } from '@/shared/lib/paged-search';
import type { ActionExecutor } from '@/shared/types/domain';
import type {
  CatalogPickerOption,
  CatalogPickerPage,
  CatalogPickerRequest,
} from '@/shared/ui/CatalogPicker.vue';

export type ActionPickerCategory = 'logic' | 'wait' | 'action';

export interface ActionPickerItem {
  id: string;
  type: string;
  name: string;
  description: string | null;
  executor: ActionExecutor;
  enabled: boolean;
}

const LOGIC_ACTIONS = new Set(['ASK_CHOICE', 'CONDITION']);
const WAIT_ACTIONS = new Set(['WAIT_FOR', 'WAIT_FOR_GOAL']);
const CATEGORY_META: Record<ActionPickerCategory, { label: string; icon: string }> = {
  logic: { label: 'Логика', icon: 'pi pi-code' },
  wait: { label: 'Ожидания', icon: 'pi pi-clock' },
  action: { label: 'Действия', icon: 'pi pi-bolt' },
};
const EXECUTOR_META: Record<ActionExecutor, { label: string; icon: string }> = {
  FRONTEND: { label: 'В интерфейсе', icon: 'pi pi-desktop' },
  SERVER: { label: 'На сервере', icon: 'pi pi-server' },
};

interface LocalCatalogPickerLoaderOptions<T> {
  items: () => readonly T[];
  include?: (item: T) => boolean;
  filterValue: (item: T) => string;
  searchValues: (item: T) => readonly (string | null | undefined)[];
  compare: (left: T, right: T) => number;
  toOption: (item: T) => CatalogPickerOption;
}

export function actionPickerCategory(type: string): ActionPickerCategory {
  if (LOGIC_ACTIONS.has(type)) return 'logic';
  if (WAIT_ACTIONS.has(type)) return 'wait';
  return 'action';
}

export function actionPickerCategoryLabel(category: ActionPickerCategory): string {
  return CATEGORY_META[category].label;
}

export function actionPickerCategoryIcon(category: ActionPickerCategory): string {
  return CATEGORY_META[category].icon;
}

export function actionExecutorLabel(executor: ActionExecutor): string {
  return EXECUTOR_META[executor].label;
}

export function actionExecutorIcon(executor: ActionExecutor): string {
  return EXECUTOR_META[executor].icon;
}

export function toActionPickerOption(action: ActionPickerItem): CatalogPickerOption {
  const category = actionPickerCategory(action.type);
  return {
    value: action.type,
    name: action.name,
    code: action.type,
    description: action.description ?? 'Описание пока не добавлено',
    meta: [
      {
        label: actionPickerCategoryLabel(category),
        icon: actionPickerCategoryIcon(category),
      },
      {
        label: actionExecutorLabel(action.executor),
        icon: actionExecutorIcon(action.executor),
      },
    ],
    data: action,
  };
}

export function createLocalCatalogPickerLoader<T>(
  options: LocalCatalogPickerLoaderOptions<T>,
): (request: CatalogPickerRequest) => Promise<CatalogPickerPage> {
  return async (request) => {
    const query = request.query.trim().toLocaleLowerCase('ru-RU');
    const items = options
      .items()
      .filter(
        (item) =>
          (!options.include || options.include(item)) &&
          (!request.filter || options.filterValue(item) === request.filter) &&
          (!query ||
            options
              .searchValues(item)
              .some((value) => value?.toLocaleLowerCase('ru-RU').includes(query))),
      )
      .sort(options.compare)
      .map(options.toOption);
    const page = paginateByCursor(items, request.cursor, request.limit);
    return { items: page.items, nextCursor: page.nextCursor };
  };
}

export function createLocalActionPickerLoader(
  catalog: () => readonly ActionPickerItem[],
  allowedTypes: () => readonly string[],
): (request: CatalogPickerRequest) => Promise<CatalogPickerPage> {
  return createLocalCatalogPickerLoader({
    items: catalog,
    include: (action) => {
      const allowed = new Set(allowedTypes());
      return action.enabled && (!allowed.size || allowed.has(action.type));
    },
    filterValue: (action) => actionPickerCategory(action.type),
    searchValues: (action) => [action.name, action.type, action.description],
    compare: (left, right) => left.name.localeCompare(right.name, 'ru-RU', { sensitivity: 'base' }),
    toOption: toActionPickerOption,
  });
}
