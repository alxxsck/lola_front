interface DecimalParts {
  negative: boolean
  digits: bigint
  scale: number
}

function parseDecimal(value: string | number): DecimalParts | null {
  const source = String(value).trim()
  const match = source.match(/^(-)?(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i)
  if (!match) return null

  const fraction = match[3] ?? ''
  const exponent = Number(match[4] ?? 0)
  if (!Number.isSafeInteger(exponent)) return null

  const digits = BigInt(`${match[2]}${fraction}`)
  const scale = fraction.length - exponent
  return scale < 0
    ? { negative: Boolean(match[1]), digits: digits * (10n ** BigInt(-scale)), scale: 0 }
    : { negative: Boolean(match[1]), digits, scale }
}

function formatDecimal(negative: boolean, digits: bigint, scale: number): string {
  const sign = negative && digits !== 0n ? '-' : ''
  if (scale === 0) return `${sign}${digits}`
  const padded = digits.toString().padStart(scale + 1, '0')
  const integer = padded.slice(0, -scale)
  const fraction = padded.slice(-scale).replace(/0+$/, '')
  return fraction ? `${sign}${integer}.${fraction}` : `${sign}${integer}`
}

function decimalQuotient(value: DecimalParts, divisor: DecimalParts): string | null {
  if (divisor.digits === 0n) return null
  let numerator = value.digits * (10n ** BigInt(divisor.scale))
  let denominator = divisor.digits * (10n ** BigInt(value.scale))
  const negative = value.negative !== divisor.negative
  let left = numerator
  let right = denominator
  while (right !== 0n) [left, right] = [right, left % right]
  numerator /= left
  denominator /= left

  let twos = 0
  let fives = 0
  let remainder = denominator
  while (remainder % 2n === 0n) { remainder /= 2n; twos += 1 }
  while (remainder % 5n === 0n) { remainder /= 5n; fives += 1 }
  if (remainder !== 1n) return null

  const scale = Math.max(twos, fives)
  numerator *= (2n ** BigInt(scale - fives)) * (5n ** BigInt(scale - twos))
  return formatDecimal(negative, numerator, scale)
}

export function backendMoneyToDisplay(value: unknown, scale: number): string {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  const amount = parseDecimal(value)
  const factor = parseDecimal(scale)
  if (!amount || !factor) return String(value)
  return formatDecimal(
    amount.negative !== factor.negative,
    amount.digits * factor.digits,
    amount.scale + factor.scale,
  )
}

export function formatMoneyDisplay(value: unknown, scale: number, precision: number | null | undefined): string {
  const converted = backendMoneyToDisplay(value, scale)
  if (precision === null || precision === undefined || !Number.isInteger(precision) || precision < 0) return converted
  const parsed = parseDecimal(converted)
  if (!parsed) return converted
  if (parsed.scale <= precision) {
    const base = formatDecimal(parsed.negative, parsed.digits, parsed.scale)
    if (precision === 0) return base.split('.')[0] ?? base
    const [integer, fraction = ''] = base.split('.')
    return `${integer}.${fraction.padEnd(precision, '0')}`
  }
  const divisor = 10n ** BigInt(parsed.scale - precision)
  const quotient = parsed.digits / divisor
  const remainder = parsed.digits % divisor
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient
  const base = formatDecimal(parsed.negative, rounded, precision)
  if (precision === 0) return base
  const [integer, fraction = ''] = base.split('.')
  return `${integer}.${fraction.padEnd(precision, '0')}`
}

export function displayMoneyToBackend(value: string, scale: number): string | null {
  const amount = parseDecimal(value)
  const factor = parseDecimal(scale)
  return amount && factor ? decimalQuotient(amount, factor) : null
}
