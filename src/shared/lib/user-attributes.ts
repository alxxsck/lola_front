import type { UserAttributeAllowedValue, UserAttributeType, UserAttributeValidation } from '@/shared/types/domain'

export interface UserAttributeConstraintInput {
  type: UserAttributeType
  minLength: number | null
  maxLength: number | null
  minimum: number | null
  maximum: number | null
  allowedValues: string
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

export function parseAllowedValues(type: UserAttributeType, source: string): UserAttributeAllowedValue[] {
  const values = source.split('\n').map((value) => value.trim()).filter(Boolean)
  if (type === 'STRING') return values
  if (type === 'NUMBER') {
    const numbers = values.map(Number)
    if (numbers.some((value) => !Number.isFinite(value))) throw new Error('Допустимые значения должны быть числами — по одному в строке.')
    return numbers
  }
  if (type === 'BOOLEAN') {
    if (values.some((value) => value !== 'true' && value !== 'false')) throw new Error('Для boolean доступны только true и false.')
    return values.map((value) => value === 'true')
  }
  if (values.some((value) => !RFC3339.test(value) || Number.isNaN(Date.parse(value)))) {
    throw new Error('Дата должна быть в формате RFC 3339, например 2026-07-16T12:00:00Z.')
  }
  return values
}

export function buildUserAttributeValidation(input: UserAttributeConstraintInput): UserAttributeValidation {
  const validation: UserAttributeValidation = {}
  if (input.type === 'STRING') {
    if (input.minLength !== null && (!Number.isInteger(input.minLength) || input.minLength < 0)) throw new Error('Минимальная длина должна быть целым неотрицательным числом.')
    if (input.maxLength !== null && (!Number.isInteger(input.maxLength) || input.maxLength < 0)) throw new Error('Максимальная длина должна быть целым неотрицательным числом.')
    if (input.minLength !== null && input.maxLength !== null && input.minLength > input.maxLength) throw new Error('Минимальная длина не может быть больше максимальной.')
    if (input.minLength !== null) validation.minLength = input.minLength
    if (input.maxLength !== null) validation.maxLength = input.maxLength
  }
  if (input.type === 'NUMBER') {
    if (input.minimum !== null && !Number.isFinite(input.minimum)) throw new Error('Минимум должен быть числом.')
    if (input.maximum !== null && !Number.isFinite(input.maximum)) throw new Error('Максимум должен быть числом.')
    if (input.minimum !== null && input.maximum !== null && input.minimum > input.maximum) throw new Error('Минимум не может быть больше максимума.')
    if (input.minimum !== null) validation.minimum = input.minimum
    if (input.maximum !== null) validation.maximum = input.maximum
  }
  const allowedValues = parseAllowedValues(input.type, input.allowedValues)
  if (allowedValues.length) validation.allowedValues = allowedValues
  return validation
}

export function allowedValuesText(validation: UserAttributeValidation): string {
  return validation.allowedValues?.map(String).join('\n') ?? ''
}
