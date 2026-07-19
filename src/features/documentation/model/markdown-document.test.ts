import { describe, expect, it } from 'vitest'

import { parseMarkdownDocument } from './markdown-document'

describe('markdown document parser', () => {
  it('creates stable headings, semantic lists and fenced examples', () => {
    const blocks = parseMarkdownDocument(`# Руководство

## События и версии

- Первый пункт с \`event.code\`
- Второй пункт

1. Проверить
2. Опубликовать

\`\`\`text
Trigger -> Action
\`\`\`

| Поле | Значение |
| --- | --- |
| Статус | \`ACTIVE\` |

> Новая версия не меняет опубликованный сценарий.

## События и версии`)

    expect(blocks).toEqual([
      expect.objectContaining({ type: 'heading', level: 1, id: 'руководство' }),
      expect.objectContaining({ type: 'heading', level: 2, id: 'события-и-версии' }),
      expect.objectContaining({ type: 'list', ordered: false, items: expect.any(Array) }),
      expect.objectContaining({ type: 'list', ordered: true, items: expect.any(Array) }),
      { type: 'code', language: 'text', value: 'Trigger -> Action' },
      expect.objectContaining({ type: 'table', headers: expect.any(Array), rows: expect.any(Array) }),
      expect.objectContaining({ type: 'quote', inline: expect.any(Array) }),
      expect.objectContaining({ type: 'heading', id: 'события-и-версии-2' }),
    ])
  })

  it('does not consume the remaining document when a code fence is left open', () => {
    const blocks = parseMarkdownDocument('```text\nnot closed\n## Still a heading')

    expect(blocks).toEqual([
      { type: 'paragraph', inline: [{ type: 'text', value: '```text' }] },
      { type: 'paragraph', inline: [{ type: 'text', value: 'not closed' }] },
      expect.objectContaining({ type: 'heading', text: 'Still a heading' }),
    ])
  })
})
