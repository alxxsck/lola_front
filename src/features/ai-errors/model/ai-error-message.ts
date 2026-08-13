const AI_ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  AI_STRUCTURED_OUTPUT_TOKEN_LIMIT_EXCEEDED:
    'Ответ AI достиг настроенного лимита выходных токенов, включая токены рассуждения. Сузьте запрос или попросите администратора увеличить лимит этой AI-функции.',
  PROJECT_ANALYSIS_PROVIDER_OUTPUT_LIMIT:
    'Ответ AI достиг настроенного лимита выходных токенов, включая токены рассуждения. Сузьте запрос или увеличьте лимит Project Analysis.',
  PROJECT_ANALYSIS_PROVIDER_INPUT_LIMIT:
    'Контекст AI-анализа достиг настроенного лимита. Сузьте период или набор данных либо увеличьте лимит входного контекста.',
  PROJECT_ANALYSIS_MODEL_ROUND_LIMIT:
    'AI-анализ достиг настроенного лимита шагов. Сузьте запрос или увеличьте лимит шагов анализа.',
  PROJECT_ANALYSIS_PROVIDER_TIMEOUT: 'AI-провайдер не успел завершить анализ. Повторите запрос.',
  PROJECT_ANALYSIS_PROVIDER_DISCONNECTED: 'Связь с AI-провайдером прервалась. Повторите запрос.',
  PROJECT_ANALYSIS_PROVIDER_INCOMPLETE:
    'AI-провайдер вернул незавершённый анализ. Повторите запрос.',
  PROJECT_ANALYSIS_RESULT_INVALID:
    'AI-провайдер вернул результат неверного формата. Повторите запрос.',
  CMS_AGENT_EXECUTION_DISABLED: 'Выполнение запросов AI-агентом отключено.',
  PROJECT_AI_ANALYSIS_EXECUTION_DISABLED: 'Выполнение AI-анализа отключено.',
  TRANSLATION_PROVIDER_OUTPUT_TOKEN_LIMIT_EXCEEDED:
    'Перевод достиг настроенного лимита выходных токенов, включая токены рассуждения. Увеличьте лимит перевода или сократите текст.',
});

const AI_LIMITATION_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  CLARIFICATION_REQUIRED: 'Для продолжения анализа нужно уточнить, какие данные использовать.',
  EVENT_RETENTION_LIMIT_REACHED:
    'Запрошенный период начинается раньше доступной истории событий, поэтому итог неполный.',
  NONCONFORMING_VALUES_EXCLUDED: 'Некорректные значения отдельных событий исключены из расчёта.',
  RESULT_BYTE_LIMIT_REACHED: 'Результат сокращён до разрешённого размера.',
  RESULT_GROUP_LIMIT_REACHED: 'Показана только часть групп из-за установленного лимита.',
  SOURCE_SCAN_LIMIT_REACHED:
    'Просмотрено максимально разрешённое число событий, поэтому итог может быть неполным.',
  SUBJECT_SCOPE_LIMIT_REACHED:
    'В выборку вошло максимально разрешённое число пользователей, поэтому итог может быть неполным.',
  NO_FX_CONVERSION:
    'Суммы в разных валютах показаны отдельно: источник валютных курсов для пересчёта не подключён.',
});

export function aiErrorMessage(code: string | null | undefined, fallback: string): string {
  return code ? (AI_ERROR_MESSAGES[code] ?? fallback) : fallback;
}

export function aiLimitationMessage(
  code: string | null | undefined,
  fallback?: string | null,
): string {
  if (code && AI_LIMITATION_MESSAGES[code]) {
    return AI_LIMITATION_MESSAGES[code];
  }
  if (fallback && /[А-Яа-яЁё]/u.test(fallback) && (!code || !fallback.includes(code))) {
    return fallback;
  }
  return 'Результат получен с ограничениями и может быть неполным.';
}
