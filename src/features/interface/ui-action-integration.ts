import type { UiElement } from '@/shared/types/domain'

type UiActionTarget = Pick<UiElement, 'code' | 'kind' | 'route' | 'modalName'>
export type InterfaceSection = 'ELEMENT' | 'PAGE' | 'MODAL'

export function isUiElementInSection(kind: UiElement['kind'], section: InterfaceSection): boolean {
  return section === 'ELEMENT' ? kind === 'ELEMENT' || kind === 'BUTTON' : kind === section
}

export function buildUiActionIntegrationGuide(target: UiActionTarget): string | null {
  if (target.kind === 'PAGE' && target.route) {
    return `# Интеграция страницы ${target.code}

Среди прочего SDK передаст общему callback \`openPage\` важные поля:

\`\`\`ts
{
  pageCode: ${JSON.stringify(target.code)},
  route: ${JSON.stringify(target.route)},
}
\`\`\`

Зарегистрируйте callback один раз для всех страниц:

\`\`\`ts
import { ChatWidgetInstance } from "@alxxsck/ai-assistant"

const widget = new ChatWidgetInstance({
  // Остальные настройки виджета.
  handlers: {
    openPage: async ({ route }) => {
      await router.push(route)
    },
  },
})
\`\`\`

Параметры query включайте прямо в \`route\`: отдельного canonical-поля \`query\` нет.

Для прямой команды \`open_page\` SDK дождётся Promise callback перед финальным ACK. В \`SHOW_CTA\` ACK подтверждает только показ CTA; этот же callback сработает позже после клика пользователя, без отдельного command ACK.`
  }

  if (target.kind === 'MODAL' && target.modalName) {
    return `# Интеграция модального окна ${target.code}

Среди прочего SDK передаст общему callback \`openModal\` важные поля:

\`\`\`ts
{
  modalCode: ${JSON.stringify(target.code)},
  modalName: ${JSON.stringify(target.modalName)},
}
\`\`\`

Зарегистрируйте callback один раз для всех модальных окон:

\`\`\`ts
import { ChatWidgetInstance } from "@alxxsck/ai-assistant"

const widget = new ChatWidgetInstance({
  // Остальные настройки виджета.
  handlers: {
    openModal: ({ modalName }) => modalRegistry.open(modalName),
  },
})
\`\`\`

\`modalName\` — ключ разрешённого modal registry, а не имя JavaScript-функции. Не используйте \`eval\` или поиск функции в \`window\`.

Если registry асинхронный, верните его Promise. Для прямой команды \`open_modal\` SDK дождётся Promise callback перед финальным ACK. В \`SHOW_CTA\` ACK подтверждает только показ CTA; этот же callback сработает позже после клика пользователя, без отдельного command ACK.`
  }

  return null
}
