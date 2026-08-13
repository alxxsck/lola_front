import type {
  ReportingCatalogDatasetDto,
  ReportingCatalogMetricDto,
} from '@/shared/api/generated/models';

export type SupportAnalyticsView = 'overview' | 'flow' | 'quality' | 'team' | 'automation';

export type CuratedWidgetRecipe = Readonly<{
  id: string;
  title: string;
  context: string;
  datasetCode: string;
  metricCandidates: readonly string[];
  tone: 'neutral' | 'positive' | 'attention' | 'critical';
}>;

type CuratedView = Readonly<{
  title: string;
  question: string;
  widgets: readonly CuratedWidgetRecipe[];
}>;

const widget = (
  id: string,
  title: string,
  context: string,
  datasetCode: string,
  metricCandidates: string[],
  tone: CuratedWidgetRecipe['tone'] = 'neutral',
): CuratedWidgetRecipe => ({ id, title, context, datasetCode, metricCandidates, tone });

export const CURATED_SUPPORT_VIEWS: Record<SupportAnalyticsView, CuratedView> = {
  overview: {
    title: 'Сейчас',
    question: 'Где поток поддержки замедлился и что требует внимания сейчас?',
    widgets: [
      widget('received', 'Поступило', 'Новые и повторно открытые обращения', 'SUPPORT_CASE', [
        'case_event_count',
      ]),
      widget('assigned', 'Назначено', 'Движение работы к командам', 'SUPPORT_ASSIGNMENT', [
        'assignment_event_count',
      ]),
      widget('responded', 'Отвечено', 'Типичное время до первого ответа', 'SUPPORT_CONVERSATION', [
        'first_response_ms_p50',
        'first_response_ms_average',
      ]),
      widget(
        'resolved',
        'Решено',
        'Время до полного решения, p90',
        'SUPPORT_CONVERSATION',
        ['resolution_ms_p90', 'resolution_ms_average'],
        'positive',
      ),
      widget(
        'stable',
        'Не вернулось',
        'Текущий размер очереди',
        'SUPPORT_QUEUE',
        ['queue_backlog_snapshot', 'queue_entry_count'],
        'attention',
      ),
      widget(
        'verified',
        'Проверено',
        'Оценки контроля качества',
        'SUPPORT_QUALITY',
        ['quality_review_count'],
        'positive',
      ),
    ],
  },
  flow: {
    title: 'Поток и сроки',
    question: 'Сколько работы приходит, где она ждёт и укладываемся ли мы в сроки?',
    widgets: [
      widget('flow-volume', 'Обращения', 'Создано и переоткрыто', 'SUPPORT_CASE', [
        'case_event_count',
      ]),
      widget(
        'flow-backlog',
        'В очереди',
        'Снимок незавершённой работы',
        'SUPPORT_QUEUE',
        ['queue_backlog_snapshot'],
        'attention',
      ),
      widget(
        'flow-wait',
        'Ожидание p90',
        'Долгий хвост очереди',
        'SUPPORT_QUEUE',
        ['queue_dwell_ms_p90'],
        'attention',
      ),
      widget('flow-first', 'Первый ответ p90', 'Скорость реакции', 'SUPPORT_CONVERSATION', [
        'first_response_ms_p90',
      ]),
      widget('flow-resolution', 'Решение p90', 'Полный цикл обращения', 'SUPPORT_CONVERSATION', [
        'resolution_ms_p90',
      ]),
      widget(
        'flow-sla',
        'События SLA',
        'Применения и изменения SLA',
        'SUPPORT_SLA',
        ['sla_event_count'],
        'critical',
      ),
    ],
  },
  quality: {
    title: 'Качество и клиенты',
    question: 'Достаточно ли проверок и какие сигналы требуют разбора с командой?',
    widgets: [
      widget('quality-volume', 'Проверено', 'Отправленные оценки', 'SUPPORT_QUALITY', [
        'quality_review_count',
      ]),
      widget(
        'quality-score',
        'Медиана качества',
        'Устойчивая центральная оценка',
        'SUPPORT_QUALITY',
        ['quality_score_p50', 'quality_score_average'],
        'positive',
      ),
      widget('quality-tail', 'Нижний сигнал', 'Средняя оценка для сверки', 'SUPPORT_QUALITY', [
        'quality_score_average',
      ]),
      widget(
        'quality-critical',
        'Критические ошибки',
        'Проверки с критическим исходом',
        'SUPPORT_QUALITY',
        ['quality_critical_failure_count'],
        'critical',
      ),
      widget(
        'quality-disputes',
        'Апелляции',
        'Открытые разногласия',
        'SUPPORT_QUALITY',
        ['quality_dispute_opened_count', 'quality_dispute_rate'],
        'attention',
      ),
      widget('quality-calibration', 'Согласованность', 'Сходимость калибровок', 'SUPPORT_QUALITY', [
        'quality_calibration_agreement_average',
        'quality_calibration_agreement_p50',
      ]),
    ],
  },
  team: {
    title: 'Команда и нагрузка',
    question: 'Где сосредоточена работа и не создаёт ли распределение перегрузку?',
    widgets: [
      widget(
        'team-assignments',
        'Назначения',
        'События распределения работы',
        'SUPPORT_ASSIGNMENT',
        ['assignment_event_count'],
      ),
      widget(
        'team-load',
        'Активная нагрузка',
        'Работа на исполнителях',
        'SUPPORT_ASSIGNMENT',
        ['assignment_load_count'],
        'attention',
      ),
      widget(
        'team-queue',
        'В очередях',
        'Текущий снимок ожидания',
        'SUPPORT_QUEUE',
        ['queue_backlog_snapshot'],
        'attention',
      ),
      widget('team-wait', 'Ожидание p90', 'Хвост времени в очереди', 'SUPPORT_QUEUE', [
        'queue_dwell_ms_p90',
      ]),
      widget(
        'team-throughput',
        'Выходы из очереди',
        'Завершённое движение',
        'SUPPORT_QUEUE',
        ['queue_exit_count'],
        'positive',
      ),
    ],
  },
  automation: {
    title: 'Автоматизация и расходы',
    question: 'Какая автоматизация используется, сколько она стоит и где возникают сбои?',
    widgets: [
      widget(
        'auto-operations',
        'Операции AI',
        'Объём автоматизированной работы',
        'SUPPORT_AI_USAGE',
        ['ai_operation_count'],
      ),
      widget(
        'auto-latency',
        'Задержка AI p95',
        'Долгий хвост обработки',
        'SUPPORT_AI_USAGE',
        ['ai_latency_ms_p95'],
        'attention',
      ),
      widget('auto-cost', 'Стоимость', 'Сумма по доступной валюте', 'SUPPORT_AI_USAGE', [
        'ai_cost_sum',
      ]),
      widget(
        'auto-content',
        'Контент',
        'Использование макросов и знаний',
        'SUPPORT_CONTENT_USAGE',
        ['content_usage_count'],
      ),
      widget(
        'auto-external',
        'Внешние задачи',
        'События интеграций',
        'SUPPORT_EXTERNAL_WORK',
        ['external_work_event_count'],
        'attention',
      ),
      widget('auto-delivery', 'Доставка', 'События отправки и чтения', 'SUPPORT_DELIVERY', [
        'delivery_event_count',
      ]),
    ],
  },
};

export type ResolvedCuratedWidget = CuratedWidgetRecipe &
  Readonly<{
    state: 'READY' | 'UNAVAILABLE' | 'FORBIDDEN';
    dataset?: ReportingCatalogDatasetDto;
    metric?: ReportingCatalogMetricDto;
  }>;

export function resolveCuratedWidgets(
  catalog: ReportingCatalogDatasetDto[],
  view: SupportAnalyticsView,
  permissions: string[],
): ResolvedCuratedWidget[] {
  return CURATED_SUPPORT_VIEWS[view].widgets.map((recipe) => {
    const dataset = catalog.find(({ datasetCode }) => datasetCode === recipe.datasetCode);
    const metric = recipe.metricCandidates
      .map((code) => dataset?.metrics.find((candidate) => candidate.code === code))
      .find((candidate): candidate is ReportingCatalogMetricDto => Boolean(candidate));
    if (!dataset || dataset.readiness.status !== 'READY' || !metric)
      return { ...recipe, state: 'UNAVAILABLE', dataset, metric };
    if (!metric.requiredPermissionCodes.every((code) => permissions.includes(code)))
      return { ...recipe, state: 'FORBIDDEN', dataset, metric };
    return { ...recipe, state: 'READY', dataset, metric };
  });
}
