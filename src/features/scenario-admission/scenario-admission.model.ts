import type { CreateScenarioAuthoringMetadataDtoImportanceClass } from '@/shared/api/generated/models';

export type ScenarioImportanceClass = CreateScenarioAuthoringMetadataDtoImportanceClass;

export const importanceClassOptions: ReadonlyArray<{
  value: ScenarioImportanceClass;
  title: string;
  description: string;
}> = [
  {
    value: 'SECURITY',
    title: 'Безопасность',
    description:
      'Критическое сообщение о защите пользователя или аккаунта. Игнорирует общую частоту и тихие часы; требует специальных прав.',
  },
  {
    value: 'ACTION_RESPONSE',
    title: 'Реакция на действие',
    description:
      'Непосредственный ответ на действие пользователя. В V1 класс служит для отображения; порядок задаёт priority.',
  },
  {
    value: 'REMINDER',
    title: 'Напоминание',
    description:
      'Напоминание о незавершённом или ожидаемом действии. В V1 применяются общие правила.',
  },
  {
    value: 'PROMOTION',
    title: 'Промо',
    description: 'Предложение, акция или маркетинговое сообщение. В V1 применяются общие правила.',
  },
  {
    value: 'GENERAL',
    title: 'Общий',
    description: 'Сценарий без специальной категории. В V1 применяются общие правила.',
  },
];

export function importanceClassPresentation(value: string) {
  return (
    importanceClassOptions.find((option) => option.value === value) ?? {
      value,
      title: 'Новый тип — обновите интерфейс',
      description: 'Сервер вернул новый класс важности. Значение сохранено без изменений.',
    }
  );
}

export function formatAdmissionSummary(input: {
  maxStartsPerLocalDay: number | null;
  maxStartsPerVisit: number | null;
  minimumIntervalSeconds: number;
}): string {
  const parts = [
    input.maxStartsPerLocalDay === null
      ? 'без суточного ограничения'
      : `не более ${input.maxStartsPerLocalDay} запусков за локальные сутки`,
    input.maxStartsPerVisit === null
      ? 'без ограничения за визит'
      : `не более ${input.maxStartsPerVisit} за один визит`,
    input.minimumIntervalSeconds === 0
      ? 'без обязательной паузы'
      : `пауза не меньше ${formatDuration(input.minimumIntervalSeconds)}`,
  ];
  const sentence = `${parts.join(', ')}.`;
  return sentence[0]!.toUpperCase() + sentence.slice(1);
}

export function formatQuietHoursPreview(start: string, end: string): string {
  if (start === end) return 'Начало и конец тихих часов должны отличаться.';
  if (start > end) return `С ${start} до полуночи и с полуночи до ${end}.`;
  return `С ${start} включительно до ${end}.`;
}

function formatDuration(seconds: number): string {
  if (seconds === 3_600) return '1 часа';
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  return [
    days ? `${days} дн` : '',
    hours ? `${hours} ч` : '',
    minutes ? `${minutes} мин` : '',
    rest ? `${rest} сек` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
