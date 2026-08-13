export interface ConversationReplyTemplate {
  id: string;
  label: string;
  text: string;
  description: string;
}

export const defaultConversationReplyTemplates = [
  {
    id: 'checking',
    label: 'Проверяю',
    text: 'Проверяю информацию. Одну минуту, пожалуйста.',
    description: 'Сообщить пользователю, что обращение уже в работе.',
  },
  {
    id: 'clarifying',
    label: 'Уточняю',
    text: 'Спасибо за ожидание. Уточняю детали и скоро вернусь с ответом.',
    description: 'Зафиксировать ожидание дополнительной информации.',
  },
  {
    id: 'follow-up',
    label: 'Проверка результата',
    text: 'Проверил информацию. Подскажите, проблема всё ещё актуальна?',
    description: 'Уточнить, удалось ли решить проблему пользователя.',
  },
] as const satisfies readonly ConversationReplyTemplate[];
