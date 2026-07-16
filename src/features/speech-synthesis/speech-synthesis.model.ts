import type {
  ProjectSpeechSettingsResponseDto,
  SpeechSettingsResponseDto,
  SpeechVoiceResponseDto,
  UpdateSpeechSettingsDto,
} from '@/shared/api/generated/models'

export const DEFAULT_VOICE_VALUE = '__server_default__'
export const AUTO_LANGUAGE_VALUE = '__auto__'

export interface SpeechSettingsForm {
  voiceId: string
  languageOverride: string
  stability: number
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
  }
}

export function toSpeechSettingsDto(form: SpeechSettingsForm): UpdateSpeechSettingsDto {
  return {
    voiceId: form.voiceId === DEFAULT_VOICE_VALUE ? null : form.voiceId,
    languageOverride: form.languageOverride === AUTO_LANGUAGE_VALUE ? null : form.languageOverride,
    stability: form.stability,
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
  const stabilityRange = speechSettingRange(response, 'stability', { min: 0, max: 1 })
  if (!Number.isFinite(form.stability)
    || form.stability < stabilityRange.min
    || form.stability > stabilityRange.max) {
    return `Стабильность: допустимое значение от ${stabilityRange.min} до ${stabilityRange.max}.`
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
