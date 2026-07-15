import { describe, expect, it } from 'vitest'
import type { SpeechSettingsResponseDto } from '@/shared/api/generated/models'
import {
  AUTO_LANGUAGE_VALUE,
  DEFAULT_VOICE_VALUE,
  createSpeechSettingsForm,
  toSpeechSettingsDto,
  validateSpeechSettings,
} from './speech-synthesis.model'

function response(): SpeechSettingsResponseDto {
  return {
    settings: { schemaVersion: 2 },
    integration: {
      id: 'elevenlabs',
      name: 'ElevenLabs',
      configured: true,
      model: 'eleven_v3',
      defaults: { voiceId: '21m00Tcm4TlvDq8ikWAM' },
      capabilities: {
        streaming: true,
        voices: true,
        languageOverride: true,
        outputFormat: 'pcm_24000',
        unsupportedForModel: ['useSpeakerBoost'],
        settings: {
          stability: { type: 'number', minimum: 0, maximum: 1, default: 0.4 },
          similarityBoost: { type: 'number', minimum: 0, maximum: 1, default: 0.8 },
          style: { type: 'number', minimum: 0, maximum: 1, default: 0 },
          speed: { type: 'number', minimum: 0.7, maximum: 1.2, default: 1 },
        },
      },
    },
  }
}

describe('speech synthesis settings model', () => {
  it('uses backend capability defaults without confusing them with persisted overrides', () => {
    expect(createSpeechSettingsForm(response())).toEqual({
      voiceId: DEFAULT_VOICE_VALUE,
      languageOverride: AUTO_LANGUAGE_VALUE,
      stability: 0.4,
      similarityBoost: 0.8,
      style: 0,
      speed: 1,
      seed: null,
      applyTextNormalization: 'auto',
      applyLanguageTextNormalization: false,
    })
  })

  it('clears optional overrides with null in the dedicated PATCH', () => {
    const form = createSpeechSettingsForm(response())
    expect(toSpeechSettingsDto(form)).toMatchObject({
      voiceId: null,
      languageOverride: null,
      seed: null,
    })
  })

  it('requires a project voice when backend has no server default', () => {
    const contract = response()
    contract.integration.defaults = { voiceId: null }
    const form = createSpeechSettingsForm(contract)

    expect(form.voiceId).toBe('')
    expect(validateSpeechSettings(form, contract)).toContain('доступный голос')
  })

  it('validates the provider ranges and integer seed', () => {
    const contract = response()
    const form = createSpeechSettingsForm(contract)
    for (const [key, invalid, expected] of [
      ['stability', -0.01, 'Стабильность'],
      ['similarityBoost', 1.01, 'Сходство с голосом'],
      ['style', 1.01, 'Выразительность'],
      ['speed', 1.21, '0.7 до 1.2'],
    ] as const) {
      const next = createSpeechSettingsForm(contract)
      next[key] = invalid
      expect(validateSpeechSettings(next, contract)).toContain(expected)
    }

    form.seed = 1.5
    expect(validateSpeechSettings(form, contract)).toContain('целым числом')
  })

  it('rejects an invalid language override', () => {
    const contract = response()
    const form = createSpeechSettingsForm(contract)
    form.languageOverride = 'rus'

    expect(validateSpeechSettings(form, contract)).toContain('ISO 639-1')
  })
})
