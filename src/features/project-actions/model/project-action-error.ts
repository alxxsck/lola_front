import { normalizeApiError } from "@/shared/api/http/api-error";

export type ProjectActionErrorKind =
  | "validation"
  | "permission"
  | "conflict"
  | "network"
  | "not-found"
  | "unknown";

export interface ProjectActionError {
  kind: ProjectActionErrorKind;
  code: string;
  message: string;
  status: number;
  details?: unknown;
  requestId?: string;
}

const messages: Readonly<Record<string, string>> = {
  PROJECT_ACTION_NOT_FOUND: "Действие проекта не найдено.",
  PROJECT_ACTION_ARCHIVED: "Архивное действие нельзя изменить.",
  PROJECT_ACTION_IN_USE:
    "Действие используется активным сценарием и пока не может быть архивировано.",
  INTEGRATION_ACTION_PROJECT_MISMATCH:
    "Подключённое действие относится к другому проекту.",
  ACTION_SURFACE_UNSUPPORTED:
    "Это действие нельзя использовать выбранным способом.",
  AI_ACTION_DESCRIPTION_INVALID:
    "Подсказка для Lola должна содержать от 20 до 2000 символов.",
  AI_ACTION_DESCRIPTION_UNSAFE:
    "Уберите из подсказки адреса, ключи доступа и программный код.",
  PROJECT_ACTION_CONFIGURATION_INVALID:
    "Проверьте обязательные поля в настройках действия.",
  AI_ACTION_AUDIT_REASON_REQUIRED:
    "Объясните, зачем Lola нужен доступ к этому действию.",
  AI_ACTION_AUDIT_REASON_UNSAFE:
    "Уберите из причины адреса, ключи доступа и программный код.",
  AI_ACTION_TARGET_CATALOG_EMPTY:
    "Откройте раздел «Интерфейс», добавьте нужную страницу, окно или элемент, разрешите его использование и опубликуйте изменения.",
  AI_ACTION_ACTOR_REQUIRED:
    "Не удалось подтвердить владельца проекта. Обновите страницу и войдите снова.",
};

export function toProjectActionError(cause: unknown): ProjectActionError {
  const error = normalizeApiError(cause);
  const code =
    error.code ??
    (error.status === 403
      ? "PROJECT_ACTION_OWNER_REQUIRED"
      : "PROJECT_ACTION_REQUEST_FAILED");

  return {
    kind: errorKind(error.status),
    code,
    message:
      messages[code] ??
      (error.status === 403
        ? "Изменять и архивировать действия может только владелец проекта."
        : error.status === 0
          ? "Не удалось связаться с сервером. Проверьте подключение и повторите попытку."
          : "Не удалось выполнить действие. Повторите попытку или сообщите администратору код обращения."),
    status: error.status,
    ...(error.details === undefined ? {} : { details: error.details }),
    ...(error.requestId ? { requestId: error.requestId } : {}),
  };
}

function errorKind(status: number): ProjectActionErrorKind {
  if (status === 0) return "network";
  if (status === 400 || status === 422) return "validation";
  if (status === 401 || status === 403) return "permission";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  return "unknown";
}
