export const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[а-яё]/g, (char) => translit[char] ?? char)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const translit: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

export const formatDate = (value?: string) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export const relativeTime = (value: string) => {
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.max(0, Math.floor(diff / 60_000))
  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  return formatDate(value)
}

export const uid = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`

export const formatAuditActor = (type: string, id: string) => {
  const actor =
    type === 'CMS_USER'
      ? 'Администратор'
      : type === 'SYSTEM'
        ? 'Система'
        : type === 'BREAK_GLASS'
          ? 'Аварийный оператор'
          : 'Оператор'

  return `${actor} · ${id}`
}
