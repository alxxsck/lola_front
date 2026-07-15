import {
  adminSpeechGet,
  adminSpeechUpdate,
  adminSpeechVoices,
} from '@/shared/api/generated/lola-backend'
import type {
  SpeechSettingsResponseDto,
  SpeechVoicePageResponseDto,
  UpdateSpeechSettingsDto,
} from '@/shared/api/generated/models'
import { isMockMode } from '@/shared/config/data-mode'

const demoVoiceId = '21m00Tcm4TlvDq8ikWAM'
let demoSettings: SpeechSettingsResponseDto = {
  settings: {
    schemaVersion: 2,
    voiceId: demoVoiceId,
    languageOverride: 'ru',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0,
    speed: 1,
    seed: null,
    applyTextNormalization: 'auto',
    applyLanguageTextNormalization: false,
  },
  integration: {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    configured: true,
    model: 'eleven_v3',
    defaults: { voiceId: demoVoiceId },
    capabilities: {
      streaming: true,
      voices: true,
      languageOverride: true,
      outputFormat: 'pcm_24000',
      unsupportedForModel: ['useSpeakerBoost'],
      settings: {
        voiceId: { type: 'string', requiredWhenNoServerDefault: true },
        languageOverride: { type: 'string', nullable: true },
        stability: { type: 'number', minimum: 0, maximum: 1, default: 0.5 },
        similarityBoost: { type: 'number', minimum: 0, maximum: 1, default: 0.75 },
        style: { type: 'number', minimum: 0, maximum: 1, default: 0 },
        speed: { type: 'number', minimum: 0.7, maximum: 1.2, default: 1 },
        seed: { type: 'integer', minimum: 0, maximum: 4_294_967_295, nullable: true },
        applyTextNormalization: { type: 'string', enum: ['auto', 'on', 'off'] },
        applyLanguageTextNormalization: { type: 'boolean', default: false },
      },
    },
  },
}

const demoVoices = [
  [demoVoiceId, 'Rachel', 'Тёплый и естественный голос', 'female'],
  ['EXAVITQu4vr4xnSDxMaL', 'Sarah', 'Мягкий и уверенный голос', 'female'],
  ['AZnzlk1XvdvUeBnXmlld', 'Domi', 'Энергичный голос для яркой подачи', 'female'],
  ['ErXwobaYiN019PkySvjV', 'Antoni', 'Спокойный универсальный голос', 'male'],
  ['MF3mGyEYCl7XYWbV9V6O', 'Elli', 'Молодой дружелюбный голос', 'female'],
  ['TxGEqnHWrfWFTfGW9XjX', 'Josh', 'Глубокий разговорный голос', 'male'],
  ['VR6AewLTigWG4xSOukaG', 'Arnold', 'Плотный голос для уверенной подачи', 'male'],
  ['pNInz6obpgDQGcFmaJgB', 'Adam', 'Низкий выразительный голос', 'male'],
  ['yoZ06aMxZJJ28mfd3POQ', 'Sam', 'Нейтральный голос для диалогов', 'male'],
  ['2EiwWnXFnvU5JabPnv8n', 'Clyde', 'Зрелый характерный голос', 'male'],
  ['CYw3kZ02Hs0563khs1Fj', 'Dave', 'Живой разговорный голос', 'male'],
  ['D38z5RcWu1voky8WS1ja', 'Fin', 'Чистый и собранный голос', 'male'],
  ['jsCqWAovK2LkecY7zXl4', 'Freya', 'Мягкий повествовательный голос', 'female'],
  ['jBpfuIE2acCO8z3wKNLl', 'Gigi', 'Лёгкий эмоциональный голос', 'female'],
  ['zcAOhNBS3c14rBihAFp1', 'Giovanni', 'Выразительный голос рассказчика', 'male'],
  ['z9fAnlkpzviPz146aGWa', 'Glinda', 'Яркий голос для художественной речи', 'female'],
  ['oWAxZDx7w5VEj9dCyTzz', 'Grace', 'Спокойный профессиональный голос', 'female'],
  ['SOYHLrjzK2X1ezoPC6cr', 'Harry', 'Сильный драматичный голос', 'male'],
  ['ZQe5CZNOzWyzPSCn5a3c', 'James', 'Уверенный голос для презентаций', 'male'],
  ['bVMeCyTHy58xNoL34h3p', 'Jeremy', 'Современный естественный голос', 'male'],
].map(([id, name, description, gender]) => ({
  id: id!,
  name: name!,
  provider: 'elevenlabs' as const,
  category: 'premade',
  description: description!,
  previewUrl: null,
  labels: { gender: gender! },
  languages: ['en'],
})) satisfies SpeechVoicePageResponseDto['items']

export function fetchSpeechSettings(projectId: string, signal?: AbortSignal): Promise<SpeechSettingsResponseDto> {
  if (isMockMode) return Promise.resolve(structuredClone(demoSettings))
  return adminSpeechGet(projectId, { signal })
}

export async function updateSpeechSettings(
  projectId: string,
  patch: UpdateSpeechSettingsDto,
): Promise<SpeechSettingsResponseDto> {
  if (isMockMode) {
    demoSettings = {
      ...demoSettings,
      settings: { ...demoSettings.settings, ...patch, schemaVersion: 2 },
    }
    return structuredClone(demoSettings)
  }
  return adminSpeechUpdate(projectId, patch)
}

export function fetchSpeechVoices(
  projectId: string,
  request: { search?: string; cursor?: string; limit?: number },
  signal?: AbortSignal,
): Promise<SpeechVoicePageResponseDto> {
  if (isMockMode) {
    const query = request.search?.trim().toLocaleLowerCase()
    const items = query
      ? demoVoices.filter((voice) => `${voice.name} ${voice.description ?? ''}`.toLocaleLowerCase().includes(query))
      : demoVoices
    return Promise.resolve({ items: structuredClone(items), hasMore: false, nextCursor: null })
  }
  return adminSpeechVoices(projectId, request, { signal })
}
