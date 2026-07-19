import type { ProfileFieldValueResponseDto } from "@/shared/api/generated/models";

export function formatProfileValue(
  field: ProfileFieldValueResponseDto,
  locale = "ru-RU",
): string {
  if (field.type === "BOOLEAN") return field.value ? "Да" : "Нет";
  if (field.type === "DATE" && typeof field.value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(field.value);
    if (match) return `${match[3]}.${match[2]}.${match[1]}`;
  }
  if (field.type === "DATETIME" && typeof field.value === "string") {
    const instant = new Date(field.value);
    if (!Number.isNaN(instant.valueOf()))
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(instant);
  }
  return String(field.value);
}

export function profileValueStateLabel(state: string): string {
  return (
    {
      AVAILABLE: "Доступно",
      MISSING: "Не передано",
      STALE: "Устарело",
      DENIED: "Скрыто политикой",
      INVALID: "Некорректно",
    }[state] ?? state
  );
}
