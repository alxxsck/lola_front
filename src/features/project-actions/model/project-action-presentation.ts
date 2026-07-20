import type { ProjectAction } from "./project-action";

const actionCopy: Record<string, { name: string; description: string }> = {
  SHOW_ASSISTANT: {
    name: "Показать Lola",
    description: "Показывает или возвращает окно Lola на странице.",
  },
  HIDE_ASSISTANT: {
    name: "Скрыть Lola",
    description: "Скрывает окно Lola на странице.",
  },
  PLAY_ANIMATION: {
    name: "Проиграть анимацию",
    description: "Запускает выбранную анимацию Lola.",
  },
  HIGHLIGHT_ELEMENT: {
    name: "Подсветить элемент",
    description:
      "Привлекает внимание пользователя к выбранному элементу страницы.",
  },
  OPEN_PAGE: {
    name: "Открыть страницу",
    description:
      "Переходит на страницу, заранее добавленную в разделе «Интерфейс».",
  },
  OPEN_MODAL: {
    name: "Открыть модальное окно",
    description: "Открывает окно, заранее добавленное в разделе «Интерфейс».",
  },
  SAY: {
    name: "Сказать текст",
    description: "Добавляет в сценарий новую реплику Lola.",
  },
  ASK_CHOICE: {
    name: "Задать вопрос с вариантами",
    description:
      "Показывает пользователю вопрос и продолжает сценарий по выбранному ответу.",
  },
  CONDITION: {
    name: "Проверить условие",
    description:
      "Проверяет заданные условия и продолжает сценарий по первой подходящей ветке.",
  },
  OPEN_CHAT: {
    name: "Открыть чат",
    description: "Открывает пользователю окно чата с Lola.",
  },
  CLOSE_CHAT: {
    name: "Закрыть чат",
    description: "Закрывает окно чата с Lola.",
  },
  REMOVE_HIGHLIGHT: {
    name: "Убрать подсветку",
    description: "Убирает подсветку с выбранного элемента интерфейса.",
  },
  SHOW_CTA: {
    name: "Показать кнопку",
    description: "Показывает пользователю кнопку с заданным действием.",
  },
  WAIT_FOR: {
    name: "Подождать",
    description: "Делает паузу перед следующим шагом сценария.",
  },
  TRACK: {
    name: "Записать событие",
    description: "Сохраняет выбранное событие в журнале проекта.",
  },
  COMPLETE_SCENARIO: {
    name: "Завершить сценарий",
    description: "Завершает сценарий и пропускает оставшиеся шаги.",
  },
  SPEAK_TEXT: {
    name: "Озвучить текст",
    description:
      "Преобразует текст в речь и при необходимости ждёт окончания воспроизведения.",
  },
  START_VOICE_CONVERSATION: {
    name: "Начать голосовой диалог",
    description:
      "Предлагает пользователю начать голосовой диалог и произносит первую реплику.",
  },
  REQUEST_ADMIN_ATTENTION: {
    name: "Запросить помощь администратора",
    description:
      "Создаёт обращение для команды, когда пользователь явно просит помощи человека. Lola ничего не выполняет без решения администратора.",
  },
};

export function projectActionName(action: ProjectAction): string {
  return (
    action.nameOverride ||
    actionCopy[action.code]?.name ||
    action.actionTypeRevision.name
  );
}

export function actionTypeName(code: string, fallback: string): string {
  return actionCopy[code]?.name ?? fallback;
}

export function actionTypeDescription(code: string, fallback: string): string {
  return actionCopy[code]?.description ?? fallback;
}

export function projectActionDescription(action: ProjectAction): string {
  return (
    action.descriptionOverride ||
    actionCopy[action.code]?.description ||
    action.actionTypeRevision.description
  );
}

export function actionOriginLabel(origin: string): string {
  return origin === "SYSTEM" ? "Встроенное" : "Подключённое";
}

export function actionExecutorLabel(executor: string): string {
  return (
    {
      FRONTEND_COMMAND: "В приложении",
      SERVER_HANDLER: "На сервере",
      PROPOSAL: "Запрос администратору",
    }[executor] ?? "Способ выполнения не указан"
  );
}

export function actionRiskLabel(risk: string): string {
  return (
    {
      UI_EFFECT: "Изменяет интерфейс",
      CONVERSATION_EFFECT: "Продолжает диалог",
      EVENT_WRITE: "Записывает событие",
      SCENARIO_CONTROL: "Управляет сценарием",
      EXTERNAL_REQUEST: "Создаёт запрос",
    }[risk] ?? "Обычное действие"
  );
}

export function actionConfirmationLabel(policy: string): string {
  return (
    {
      NEVER: "Не требуется",
      WHEN_REQUIRED: "При необходимости",
      ALWAYS: "Всегда спрашивать пользователя",
    }[policy] ?? "Определяется автоматически"
  );
}

export function needsInterfaceSetup(code: string): boolean {
  return [
    "OPEN_MODAL",
    "OPEN_PAGE",
    "HIGHLIGHT_ELEMENT",
    "PLAY_ANIMATION",
  ].includes(code);
}
