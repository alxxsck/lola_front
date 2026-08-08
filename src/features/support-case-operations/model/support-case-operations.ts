import type {
  SupportRoutingContext,
  SupportSlaClock,
  SupportSlaClockKind,
  SupportWorkspaceSlaSignal,
} from "@/features/support-workspace/api/support-workspace-source";

export function formatBusinessDuration(milliseconds: number): string {
  const overdue = milliseconds < 0;
  const totalMinutes = Math.max(1, Math.floor(Math.abs(milliseconds) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const duration = [hours ? `${hours} ч` : "", minutes ? `${minutes} мин` : ""]
    .filter(Boolean)
    .join(" ");
  return overdue ? `просрочено на ${duration}` : duration;
}

export function slaKindLabel(kind: SupportSlaClockKind): string {
  return {
    FIRST_HUMAN_RESPONSE: "первого ответа",
    NEXT_HUMAN_RESPONSE: "следующего ответа",
    RESOLUTION: "решения",
  }[kind];
}

export function slaSignalLabel(signal: SupportWorkspaceSlaSignal): string {
  if (signal.state === "DISABLED") return "SLA отключён";
  if (signal.state === "NO_ACTIVE_CLOCK") return "Нет активного SLA";
  const prefix = {
    SLA_BREACHED: "Нарушен срок",
    SLA_AT_RISK: "Риск",
    SLA_PAUSED: "Пауза",
    SLA_DUE: "До",
  }[signal.signalCode];
  const duration = formatBusinessDuration(signal.remainingBusinessMs);
  return `${prefix} ${slaKindLabel(signal.kind)} · ${duration} · теневой прогноз`;
}

export function slaClockStatus(clock: SupportSlaClock): string {
  if (clock.outcome === "MET") return "Выполнено в срок";
  if (clock.outcome === "CANCELLED") return "Отменено";
  if (clock.outcome === "MIGRATED") return "Перенесено";
  if (clock.timing === "PAUSED") {
    return clock.pauseReason === "WAITING_END_USER"
      ? "Пауза: ждём пользователя"
      : "Пауза: ждём систему";
  }
  if (clock.risk === "BREACHED") return "Срок нарушен";
  if (clock.risk === "AT_RISK") return "Под риском";
  return "В пределах срока";
}

export function routingReasonLabel(
  value: Extract<SupportRoutingContext, { state: "AVAILABLE" }>["reasonCode"],
): string {
  return (
    {
      ROUTING_OFFER_ACTIVE: "Оператору отправлено предложение",
      ROUTING_OFFER_ACCEPTED: "Предложение принято",
      ROUTING_AUTO_ASSIGNED: "Назначено автоматически",
      ROUTING_EVALUATION_PENDING: "Подбираем оператора",
      ROUTING_FALLBACK_PENDING: "Запланирован повторный подбор",
      ROUTING_FALLBACK_EXHAUSTED: "Варианты подбора исчерпаны",
      ROUTING_WORKER_DEGRADED: "Сервис маршрутизации ограничен",
      WINNER: "Найден подходящий оператор",
      NO_ELIGIBLE_OPERATOR: "Нет подходящего оператора",
      CAPACITY_GAP: "Не хватает свободной ёмкости",
      CONFIGURATION_REQUIRED: "Нужно настроить маршрутизацию",
      STALE_INPUT: "Данные маршрутизации устарели",
      DEGRADED: "Маршрутизация временно работает с ограничениями",
    } as const
  )[value];
}

export function assignmentStateLabel(
  value: Extract<
    SupportRoutingContext,
    { state: "AVAILABLE" }
  >["assignmentState"],
): string {
  return {
    UNASSIGNED: "Не назначен",
    RESERVED: "Зарезервирован",
    ASSIGNED: "Назначен",
  }[value];
}
