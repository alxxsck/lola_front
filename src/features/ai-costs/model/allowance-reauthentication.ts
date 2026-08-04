import { ApiError } from "@/shared/api/http/api-error";

export const ALLOWANCE_REAUTHENTICATION_MESSAGE =
  "Срок свежей авторизации истёк. Войдите заново с passkey, затем повторите действие вручную. Изменения не применены и не будут повторены автоматически.";

export function isAllowanceReauthenticationRequired(cause: unknown): boolean {
  return (
    cause instanceof ApiError && cause.code === "REAUTHENTICATION_REQUIRED"
  );
}
