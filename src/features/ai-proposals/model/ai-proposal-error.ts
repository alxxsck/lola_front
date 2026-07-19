import { ApiError } from "@/shared/api/http/api-error";

export type AIProposalErrorKind =
  "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "UNAVAILABLE" | "UNKNOWN";

export function aiProposalErrorKind(cause: unknown): AIProposalErrorKind {
  if (!(cause instanceof ApiError)) return "UNKNOWN";
  if (cause.status === 409 || cause.code?.includes("VERSION"))
    return "CONFLICT";
  if (cause.status === 403) return "FORBIDDEN";
  if (cause.status === 404) return "NOT_FOUND";
  if (cause.status === 0 || cause.status >= 500) return "UNAVAILABLE";
  return "UNKNOWN";
}

export function aiProposalErrorMessage(cause: unknown): string {
  switch (aiProposalErrorKind(cause)) {
    case "CONFLICT":
      return "Предложение уже изменилось. Мы загрузили актуальное состояние.";
    case "FORBIDDEN":
      return "У вас больше нет доступа к предложениям этого проекта.";
    case "NOT_FOUND":
      return "Предложение больше недоступно.";
    case "UNAVAILABLE":
      return "Сервис предложений временно недоступен. Попробуйте ещё раз.";
    default:
      return "Не удалось выполнить действие. Попробуйте ещё раз.";
  }
}
