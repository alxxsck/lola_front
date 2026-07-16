import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpeechSettingsResponseDto } from '@/shared/api/generated/models'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  voices: vi.fn(),
}))

vi.mock('@/shared/config/data-mode', () => ({ isMockMode: false }))

vi.mock('@/shared/api/generated/lola-backend', () => ({
  adminSpeechGet: mocks.get,
  adminSpeechUpdate: mocks.update,
  adminSpeechVoices: mocks.voices,
}))

import { fetchSpeechSettings, fetchSpeechVoices, updateSpeechSettings } from './speech-synthesis.api'

const response = {
  settings: { schemaVersion: 2 },
  integration: {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    configured: true,
    model: 'eleven_v3',
    defaults: {},
    capabilities: {
      streaming: true,
      voices: true,
      languageOverride: true,
      settings: {},
      unsupportedForModel: [],
    },
  },
} satisfies SpeechSettingsResponseDto

describe('speech synthesis API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue(response)
    mocks.update.mockResolvedValue(response)
    mocks.voices.mockResolvedValue({ items: [], hasMore: false, nextCursor: null })
  })

  it('uses the generated dedicated settings endpoints', async () => {
    const controller = new AbortController()
    await fetchSpeechSettings('project-1', controller.signal)
    await updateSpeechSettings('project-1', { voiceId: null, stability: 0.4 })

    expect(mocks.get).toHaveBeenCalledWith('project-1', { signal: controller.signal })
    expect(mocks.update).toHaveBeenCalledWith('project-1', { voiceId: null, stability: 0.4 })
  })

  it('passes search and opaque cursor to the generated voice catalog endpoint', async () => {
    const controller = new AbortController()
    const request = { search: 'Rachel', cursor: 'opaque-cursor', limit: 20 }
    await fetchSpeechVoices('project-1', request, controller.signal)

    expect(mocks.voices).toHaveBeenCalledWith('project-1', request, { signal: controller.signal })
  })
})
