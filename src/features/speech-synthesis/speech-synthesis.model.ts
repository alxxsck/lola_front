import type {
  ProjectSpeechSettingsResponseDto,
  SpeechSettingsResponseDto,
  SpeechVoiceResponseDto,
  TextNormalizationMode,
  UpdateSpeechSettingsDto,
} from '@/shared/api/generated/models'

export const DEFAULT_VOICE_VALUE = '__server_default__'
export const AUTO_LANGUAGE_VALUE = '__auto__'

export interface SpeechSettingsForm {
  voiceId: string
  languageOverride: string
  stability: number
  similarityBoost: number
  style: number
  speed: number
  seed: number | null
  applyTextNormalization: TextNormalizationMode
  applyLanguageTextNormalization: boolean
}

interface NumberCapability {
  default?: number
  minimum?: number
  maximum?: number
}

function numberCapability(response: SpeechSettingsResponseDto, key: string): NumberCapability {
  const value = response.integration.capabilities.settings[key]
  if (!value || typeof value !== 'object') return {}
  return {
    default: typeof value.default === 'number' ? value.default : undefined,
    minimum: typeof value.minimum === 'number' ? value.minimum : undefined,
    maximum: typeof value.maximum === 'number' ? value.maximum : undefined,
  }
}

function effectiveNumber(
  response: SpeechSettingsResponseDto,
  key: keyof ProjectSpeechSettingsResponseDto,
  fallback: number,
): number {
  const value = response.settings[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return numberCapability(response, key).default ?? fallback
}

export function createSpeechSettingsForm(response: SpeechSettingsResponseDto): SpeechSettingsForm {
  const hasServerDefault = typeof response.integration.defaults.voiceId === 'string'
    && /^[A-Za-z0-9_-]{12,100}$/.test(response.integration.defaults.voiceId)
  return {
    voiceId: response.settings.voiceId ?? (hasServerDefault ? DEFAULT_VOICE_VALUE : ''),
    languageOverride: response.settings.languageOverride ?? AUTO_LANGUAGE_VALUE,
    stability: effectiveNumber(response, 'stability', 0.5),
    similarityBoost: effectiveNumber(response, 'similarityBoost', 0.75),
    style: effectiveNumber(response, 'style', 0),
    speed: effectiveNumber(response, 'speed', 1),
    seed: response.settings.seed ?? null,
    applyTextNormalization: response.settings.applyTextNormalization ?? 'auto',
    applyLanguageTextNormalization: response.settings.applyLanguageTextNormalization ?? false,
  }
}

export function toSpeechSettingsDto(form: SpeechSettingsForm): UpdateSpeechSettingsDto {
  return {
    voiceId: form.voiceId === DEFAULT_VOICE_VALUE ? null : form.voiceId,
    languageOverride: form.languageOverride === AUTO_LANGUAGE_VALUE ? null : form.languageOverride,
    stability: form.stability,
    similarityBoost: form.similarityBoost,
    style: form.style,
    speed: form.speed,
    seed: form.seed,
    applyTextNormalization: form.applyTextNormalization,
    applyLanguageTextNormalization: form.applyLanguageTextNormalization,
  }
}

export function speechSettingRange(
  response: SpeechSettingsResponseDto,
  key: string,
  fallback: { min: number; max: number },
): { min: number; max: number } {
  const capability = numberCapability(response, key)
  return {
    min: capability.minimum ?? fallback.min,
    max: capability.maximum ?? fallback.max,
  }
}

export function validateSpeechSettings(
  form: SpeechSettingsForm,
  response: SpeechSettingsResponseDto,
): string {
  if (form.voiceId !== DEFAULT_VOICE_VALUE && !/^[A-Za-z0-9_-]{12,100}$/.test(form.voiceId)) {
    return 'Выберите доступный голос ElevenLabs.'
  }
  if (form.languageOverride !== AUTO_LANGUAGE_VALUE && !/^[a-z]{2}$/.test(form.languageOverride)) {
    return 'Язык должен быть указан в формате ISO 639-1.'
  }
  for (const [key, label, fallback] of [
    ['stability', 'Стабильность', { min: 0, max: 1 }],
    ['similarityBoost', 'Сходство с голосом', { min: 0, max: 1 }],
    ['style', 'Выразительность', { min: 0, max: 1 }],
    ['speed', 'Скорость', { min: 0.7, max: 1.2 }],
  ] as const) {
    const range = speechSettingRange(response, key, fallback)
    const value = form[key]
    if (!Number.isFinite(value) || value < range.min || value > range.max) {
      return `${label}: допустимое значение от ${range.min} до ${range.max}.`
    }
  }
  if (form.seed !== null && (!Number.isSafeInteger(form.seed) || form.seed < 0 || form.seed > 4_294_967_295)) {
    return 'Seed должен быть целым числом от 0 до 4 294 967 295.'
  }
  return ''
}

export interface SpeechVoiceOption {
  id: string
  name: string
  meta: string
  voice?: SpeechVoiceResponseDto
}

export function toVoiceOption(voice: SpeechVoiceResponseDto): SpeechVoiceOption {
  const details = [voice.category, ...voice.languages].filter(Boolean)
  return { id: voice.id, name: voice.name, meta: details.join(' · '), voice }
}
