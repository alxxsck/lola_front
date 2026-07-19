export type MarkdownInline =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }

export type MarkdownBlock =
  | { type: 'heading'; level: number; id: string; text: string; inline: MarkdownInline[] }
  | { type: 'paragraph'; inline: MarkdownInline[] }
  | { type: 'list'; ordered: boolean; items: MarkdownInline[][] }
  | { type: 'quote'; inline: MarkdownInline[] }
  | { type: 'table'; headers: MarkdownInline[][]; rows: MarkdownInline[][][] }
  | { type: 'code'; language: string; value: string }

function inline(value: string): MarkdownInline[] {
  const tokens: MarkdownInline[] = []
  const pattern = /`([^`]+)`/g
  let cursor = 0
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) tokens.push({ type: 'text', value: value.slice(cursor, index) })
    tokens.push({ type: 'code', value: match[1] ?? '' })
    cursor = index + match[0].length
  }
  if (cursor < value.length) tokens.push({ type: 'text', value: value.slice(cursor) })
  return tokens.length ? tokens : [{ type: 'text', value }]
}

function baseSlug(value: string): string {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase('ru')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-|-$/g, '') || 'section'
}

function isBlockStart(value: string): boolean {
  return /^(#{1,6})\s+/.test(value) || /^```/.test(value) || /^[-*]\s+/.test(value) || /^\d+\.\s+/.test(value) || /^>\s?/.test(value)
}

function tableCells(value: string): MarkdownInline[][] {
  return value
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => inline(cell.trim()))
}

function isTableDivider(value: string): boolean {
  const cells = value.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
  return cells.length > 0 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell))
}

export function parseMarkdownDocument(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  const slugCounts = new Map<string, number>()
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (!line.trim()) { index += 1; continue }

    const fence = line.match(/^```([^\s]*)\s*$/)
    if (fence) {
      const closingFence = lines.findIndex((candidate, candidateIndex) => candidateIndex > index && /^```\s*$/.test(candidate))
      if (closingFence === -1) {
        blocks.push({ type: 'paragraph', inline: inline(line.trim()) })
        index += 1
        continue
      }
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index] ?? '')) {
        code.push(lines[index] ?? '')
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'code', language: fence[1] ?? '', value: code.join('\n') })
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const text = heading[2]?.trim() ?? ''
      const slug = baseSlug(text)
      const occurrence = slugCounts.get(slug) ?? 0
      slugCounts.set(slug, occurrence + 1)
      blocks.push({
        type: 'heading',
        level: heading[1]?.length ?? 2,
        id: occurrence ? `${slug}-${occurrence + 1}` : slug,
        text,
        inline: inline(text),
      })
      index += 1
      continue
    }

    if (line.includes('|') && isTableDivider(lines[index + 1] ?? '')) {
      const headers = tableCells(line)
      const rows: MarkdownInline[][][] = []
      index += 2
      while (index < lines.length && (lines[index] ?? '').includes('|') && (lines[index] ?? '').trim()) {
        rows.push(tableCells(lines[index] ?? ''))
        index += 1
      }
      blocks.push({ type: 'table', headers, rows })
      continue
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index] ?? '')) {
        quote.push((lines[index] ?? '').replace(/^>\s?/, '').trim())
        index += 1
      }
      blocks.push({ type: 'quote', inline: inline(quote.join(' ')) })
      continue
    }

    const listItem = line.match(/^([-*]|\d+\.)\s+(.+)$/)
    if (listItem) {
      const ordered = /\d+\./.test(listItem[1] ?? '')
      const items: MarkdownInline[][] = []
      while (index < lines.length) {
        const match = (lines[index] ?? '').match(ordered ? /^\d+\.\s+(.+)$/ : /^[-*]\s+(.+)$/)
        if (!match) break
        items.push(inline(match[1]?.trim() ?? ''))
        index += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    const paragraph = [line.trim()]
    index += 1
    while (index < lines.length && (lines[index] ?? '').trim() && !isBlockStart(lines[index] ?? '')) {
      paragraph.push((lines[index] ?? '').trim())
      index += 1
    }
    blocks.push({ type: 'paragraph', inline: inline(paragraph.join(' ')) })
  }

  return blocks
}
