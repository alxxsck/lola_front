import { describe, expect, it } from 'vitest'

import {
  formatEventContractMarkdown,
  formatProfileContractMarkdown,
} from './data-contract-markdown'

describe('data contract Markdown', () => {
  it('describes an event code and every nested payload parameter', () => {
    expect(formatEventContractMarkdown({
      name: 'Успешный депозит',
      code: 'deposit.succeeded',
      version: 2,
      payloadSchema: {
        type: 'object',
        required: ['amount'],
        properties: {
          amount: { type: 'integer', description: 'Сумма в центах' },
          note: { type: 'string', description: 'Комментарий | оператора' },
          payment: {
            type: 'object',
            required: ['currency'],
            properties: {
              currency: { type: 'string', description: 'ISO 4217' },
            },
          },
        },
      },
    })).toBe(`# Событие: Успешный депозит

- Event code: \`deposit.succeeded\`
- Версия схемы: 2

| Параметр | Тип | Обязательность | Описание |
| --- | --- | --- | --- |
| \`eventCode\` | \`string\` | обязательно | \`deposit.succeeded\` |
| \`payload.amount\` | \`integer\` | обязательно | Сумма в центах |
| \`payload.note\` | \`string\` | необязательно | Комментарий \\| оператора |
| \`payload.payment\` | \`object\` | необязательно | — |
| \`payload.payment.currency\` | \`string\` | обязательно, если передан \`payload.payment\` | ISO 4217 |`)
  })

  it('keeps advanced JSON Schema types and composed parameters understandable', () => {
    const markdown = formatEventContractMarkdown({
      name: 'Контакт обновлён',
      code: 'contact.updated',
      version: 3,
      payloadSchema: {
        type: 'object',
        $defs: {
          channel: {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string' } },
          },
        },
        properties: {
          value: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
          metadata: { type: ['object', 'null'] },
          anything: true,
          channel: { $ref: '#/$defs/channel' },
          contact: {
            oneOf: [
              { type: 'object', required: ['email'], properties: { email: { type: 'string' } } },
              { type: 'object', required: ['phone'], properties: { phone: { type: 'string' } } },
            ],
          },
        },
      },
    })

    expect(markdown).toContain('| `payload.value` | `oneOf<string \\| integer>` |')
    expect(markdown).toContain('| `payload.metadata` | `object \\| null` |')
    expect(markdown).toContain('| `payload.anything` | `any` |')
    expect(markdown).toContain('| `payload.channel` | `object` |')
    expect(markdown).toContain('| `payload.channel.name` | `string` | обязательно, если передан `payload.channel` |')
    expect(markdown).toContain('| `payload.contact.email` | `string` | обязательно в соответствующем варианте |')
    expect(markdown).toContain('| `payload.contact.phone` | `string` | обязательно в соответствующем варианте |')
    expect(markdown).not.toContain('не указан')
  })

  it('describes published profile fields and preserves requirement modes', () => {
    expect(formatProfileContractMarkdown({
      version: 4,
      draft: false,
      fields: [
        {
          key: 'displayName',
          label: 'Отображаемое имя',
          valueType: 'STRING',
          requirement: 'OPTIONAL',
          description: 'Имя для интерфейса',
          lifecycle: 'ACTIVE',
        },
        {
          key: 'depositCount',
          label: 'Количество депозитов',
          valueType: 'INTEGER',
          requirement: 'REQUIRED_WARN',
          lifecycle: 'ACTIVE',
        },
        {
          key: 'accountBalance',
          label: 'Баланс',
          valueType: 'DECIMAL',
          requirement: 'REQUIRED_ENFORCED',
          lifecycle: 'ACTIVE',
        },
      ],
    })).toBe(`# Поля профиля пользователей

- Версия контракта: 4

| Поле | Тип | Обязательность | Описание |
| --- | --- | --- | --- |
| \`displayName\` | \`string\` | необязательно | Отображаемое имя — Имя для интерфейса |
| \`depositCount\` | \`integer\` | желательно (если нет — предупреждение) | Количество депозитов |
| \`accountBalance\` | \`decimal string\` | обязательно (строго) | Баланс |`)
  })

  it('marks a copied draft so it cannot be mistaken for the live contract', () => {
    const markdown = formatProfileContractMarkdown({
      version: 4,
      draft: true,
      fields: [{
        key: 'futureField',
        label: 'Будущее поле',
        valueType: 'STRING',
        requirement: 'OPTIONAL',
        lifecycle: 'ACTIVE',
      }],
    })

    expect(markdown).toContain('- Состояние: текущий черновик (ещё не опубликован)')
    expect(markdown).toContain('- Действующая версия: 4')
    expect(markdown).toContain('| `futureField` | `string` | необязательно |')
  })
})
