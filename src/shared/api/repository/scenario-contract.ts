import type {
  CreateScenarioDto,
  ScenarioActionDto,
  ScenarioConditionDto,
  UpdateScenarioDto,
} from '@/shared/api/generated/models'
import type { ScenarioAction } from '@/shared/types/domain'
import type { SaveScenario } from './contracts'

export function serializeApiScenarioActions(actions: ScenarioAction[]): ScenarioActionDto[] {
  return [...actions]
    .sort((left, right) => left.position - right.position)
    .map((action, position) => ({
      position,
      ...(action.nodeKey ? { nodeKey: action.nodeKey } : {}),
      ...(action.nextNodeKey !== undefined ? { nextNodeKey: action.nextNodeKey } : {}),
      type: action.type,
      config: plainConfig(action.config),
    }))
}

function plainConfig(config: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(config)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, plainJsonValue(value, `config.${key}`)]))
}

function plainJsonValue(value: unknown, path: string): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} содержит некорректное число`)
    return value
  }
  if (Array.isArray(value)) return value.map((item, index) => plainJsonValue(item, `${path}.${index}`))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, plainJsonValue(item, `${path}.${key}`)]))
  }
  throw new Error(`${path} содержит значение, которое нельзя отправить как JSON`)
}

function baseScenarioDto(value: SaveScenario) {
  return compact({
    name: value.name.trim(),
    description: value.description?.trim() || undefined,
    eventDefinitionId: value.eventDefinitionId,
    status: value.status,
    priority: value.priority,
    conditions: value.conditions as ScenarioConditionDto[] | undefined,
    cooldownSeconds: value.cooldownSeconds,
    maxRunsPerUser: value.maxRunsPerUser,
    activeFrom: value.activeFrom,
    activeTo: value.activeTo,
    actions: serializeApiScenarioActions(value.actions),
  })
}

export function toCreateScenarioDto(value: SaveScenario): CreateScenarioDto {
  return { ...baseScenarioDto(value), code: value.code.trim() } as CreateScenarioDto
}

export function toUpdateScenarioDto(value: SaveScenario): UpdateScenarioDto {
  return baseScenarioDto(value) as UpdateScenarioDto
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}
