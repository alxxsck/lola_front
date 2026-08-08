import { paginateByCursor } from "@/shared/lib/paged-search";
import type { EntityKind, UiElement } from "@/shared/types/domain";
import type {
  CatalogPickerOption,
  CatalogPickerPage,
  CatalogPickerRequest,
} from "@/shared/ui/CatalogPicker.vue";

const KIND_PRESENTATION: Record<
  EntityKind,
  { label: string; icon: string }
> = {
  PAGE: { label: "Страница", icon: "pi pi-file" },
  MODAL: { label: "Модальное окно", icon: "pi pi-window-maximize" },
  BUTTON: { label: "Кнопка", icon: "pi pi-play" },
  ELEMENT: { label: "Элемент", icon: "pi pi-box" },
  HANDLER: { label: "Обработчик", icon: "pi pi-code" },
};

export function uiElementKindLabel(kind: EntityKind): string {
  return KIND_PRESENTATION[kind].label;
}

export function uiElementKindIcon(kind: EntityKind): string {
  return KIND_PRESENTATION[kind].icon;
}

export function toUiElementPickerOption(
  element: UiElement,
): CatalogPickerOption {
  return {
    value: element.code,
    name: element.name,
    code: element.code,
    description:
      element.aiDescription ??
      element.route ??
      element.modalName ??
      element.selector ??
      undefined,
    meta: [
      {
        label: uiElementKindLabel(element.kind),
        icon: uiElementKindIcon(element.kind),
      },
      ...(element.aiEnabled
        ? [{ label: "Доступно Retenive", icon: "pi pi-sparkles" }]
        : []),
      ...(!element.enabled
        ? [{ label: "Выключено", icon: "pi pi-ban" }]
        : []),
    ],
    data: element,
  };
}

export function createLocalUiElementPickerLoader(
  elements: () => UiElement[],
  allowedKinds: () => readonly EntityKind[],
): (request: CatalogPickerRequest) => Promise<CatalogPickerPage> {
  return async (request) => {
    const query = request.query.trim().toLocaleLowerCase("ru-RU");
    const allowed = new Set(allowedKinds());
    const items = elements()
      .filter(
        (element) =>
          element.enabled &&
          (!allowed.size || allowed.has(element.kind)) &&
          (!request.filter || element.kind === request.filter) &&
          (!query ||
            [
              element.name,
              element.code,
              element.aiDescription,
              ...element.aiAliases,
              element.route,
              element.modalName,
              element.selector,
            ].some((value) =>
              value?.toLocaleLowerCase("ru-RU").includes(query),
            )),
      )
      .sort((left, right) =>
        left.name.localeCompare(right.name, "ru-RU", { sensitivity: "base" }),
      )
      .map(toUiElementPickerOption);
    const page = paginateByCursor(items, request.cursor, request.limit);
    return { items: page.items, nextCursor: page.nextCursor };
  };
}
