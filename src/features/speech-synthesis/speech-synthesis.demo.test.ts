import { describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/config/data-mode', () => ({ isMockMode: true }))

import { fetchSpeechVoices } from './speech-synthesis.api'

describe('speech synthesis demo catalog', () => {
  it('contains a full first page and supports the same search shape as the API', async () => {
    const page = await fetchSpeechVoices('project-1', { limit: 20 })
    const search = await fetchSpeechVoices('project-1', { search: 'Rachel', limit: 20 })

    expect(page.items).toHaveLength(20)
    expect(new Set(page.items.map((voice) => voice.id)).size).toBe(20)
    expect(page).toMatchObject({ hasMore: false, nextCursor: null })
    expect(search.items.map((voice) => voice.name)).toEqual(['Rachel'])
  })
})
