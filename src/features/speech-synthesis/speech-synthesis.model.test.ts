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
    })
  })

  it('creates a dedicated PATCH with only the public eleven_v3 settings', () => {
    const form = createSpeechSettingsForm(response())
    expect(toSpeechSettingsDto(form)).toEqual({
      voiceId: null,
      languageOverride: null,
      stability: 0.4,
    })
  })

  it('does not expose legacy settings returned by an old backend response', () => {
    const contract = response()
    Object.assign(contract.settings, {
      similarityBoost: 0.8,
      style: 0.2,
      speed: 1.1,
      seed: 42,
      applyTextNormalization: 'on',
      applyLanguageTextNormalization: true,
    })

    expect(createSpeechSettingsForm(contract)).toEqual({
      voiceId: DEFAULT_VOICE_VALUE,
      languageOverride: AUTO_LANGUAGE_VALUE,
      stability: 0.4,
    })
  })

  it('requires a project voice when backend has no server default', () => {
    const contract = response()
    contract.integration.defaults = { voiceId: null }
    const form = createSpeechSettingsForm(contract)

    expect(form.voiceId).toBe('')
    expect(validateSpeechSettings(form, contract)).toContain('доступный голос')
  })

  it('validates the model-specific stability range', () => {
    const contract = response()
    const form = createSpeechSettingsForm(contract)
    form.stability = -0.01

    expect(validateSpeechSettings(form, contract)).toContain('Стабильность')
  })

  it('rejects an invalid language override', () => {
    const contract = response()
    const form = createSpeechSettingsForm(contract)
    form.languageOverride = 'rus'

    expect(validateSpeechSettings(form, contract)).toContain('ISO 639-1')
  })
})
