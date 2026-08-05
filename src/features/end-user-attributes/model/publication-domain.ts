import type { AttributePublicationChangesResponseDto } from "@/shared/api/generated/models";

export interface PublicationImpact {
  contractChanged: boolean;
  severity: "success" | "warn" | "error";
  title: string;
  description: string;
}

export interface AttributePublicationFormCommand {
  breakingChangePlan: string | null;
  compatibilityGraceDays: number | undefined;
  readinessEvidenceId: string | null;
  reason: string;
  securityConfirmations: string[];
}

export function publicationImpact(
  changes: AttributePublicationChangesResponseDto,
): PublicationImpact {
  if (!changes.contractChanged) {
    return {
      contractChanged: false,
      severity: "success",
      title: "Интеграция продукта не изменится",
      description:
        "Настройки Retenive применятся после публикации. Версия контракта и сохранённые профили останутся прежними.",
    };
  }
  if (changes.contractCompatibility === "INITIAL") {
    return {
      contractChanged: true,
      severity: "warn",
      title: "Будет создан первый контракт",
      description:
        "Команде продукта нужно начать передавать профиль с версией контракта v1. Перехода со старой версии нет.",
    };
  }
  if (changes.contractCompatibility === "BREAKING") {
    return {
      contractChanged: true,
      severity: "error",
      title: "Интеграцию продукта нужно обновить",
      description:
        "Публикация создаст новую несовместимую версию контракта. Подготовьте переход и повторную синхронизацию затронутых профилей.",
    };
  }
  return {
    contractChanged: true,
    severity: "warn",
    title: "Появится новая версия контракта",
    description:
      "Команде продукта нужно принять новую версию контракта. Текущая версия продолжит работать в течение переходного периода.",
  };
}

export function publicationChangeLabels(
  changes: AttributePublicationChangesResponseDto,
): string[] {
  const historicalFlags = [
    changes.metadataChanged,
    changes.policyChanged,
    changes.lifecycleChanged,
  ];
  if (historicalFlags.some((value) => value === null))
    return ["Состав изменений неизвестен (миграция)"];

  const labels: string[] = [];
  if (changes.contractChanged) labels.push("Контракт");
  if (changes.metadataChanged) labels.push("Описание");
  if (changes.policyChanged) labels.push("Доступ");
  if (changes.lifecycleChanged) labels.push("Жизненный цикл");
  return labels.length ? labels : ["Без изменений"];
}

export function actorLabel(
  actorType: "CMS_USER" | "SYSTEM" | "BREAK_GLASS",
  actorId: string,
): string {
  const typeLabel = {
    CMS_USER: "Пользователь CMS",
    SYSTEM: "Система",
    BREAK_GLASS: "Аварийный доступ",
  }[actorType];
  return `${typeLabel} · ${actorId}`;
}
