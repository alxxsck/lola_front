import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AudienceCatalogResponseDto, SegmentDetailResponseDto, SegmentSearchResponseDto } from '@/shared/api/generated/models'
import { scenarioAuthoringRepository } from '@/shared/api/repository/scenario-authoring'
import { ApiError } from '@/shared/api/http/api-error'
import SegmentManager from './SegmentManager.vue'

vi.mock('@/shared/api/repository/scenario-authoring', () => ({
  scenarioAuthoringRepository: {
    archiveSegment: vi.fn(),
    createSegment: vi.fn(),
    getSegment: vi.fn(),
    getSegmentRevision: vi.fn(),
    publishSegmentRevision: vi.fn(),
    searchSegments: vi.fn(),
  },
}))

const catalog: AudienceCatalogResponseDto = {
  version: 1, revision: 'audience-catalog-3', locales: [{ code: 'ru-RU', language: 'ru', label: 'Русский' }],
  localeSource: { operators: ['eq', 'neq', 'in', 'exists', 'not_exists'], control: 'SELECT', authoringAvailability: 'AVAILABLE' },
  languageSource: { operators: ['eq', 'neq', 'in', 'exists', 'not_exists'], control: 'SELECT', authoringAvailability: 'AVAILABLE' },
  country: { source: 'profile.country', valueType: 'countryCode', semantics: 'ISO_3166_1_ALPHA_2_UPPERCASE', operators: ['eq', 'neq', 'in', 'exists', 'not_exists'], control: 'COUNTRY_CODE', authoringAvailability: 'AVAILABLE' },
  attributes: [], segmentSource: { operators: ['is_member', 'is_not_member'], searchEndpoint: '/segments', control: 'SEARCH', authoringAvailability: 'AVAILABLE' },
  snapshotPolicy: { initialEvaluation: 'RUN_START', missingOrNull: 'NO_MATCH_EXCEPT_NOT_EXISTS', deletedDefinition: 'PINNED_SNAPSHOT_CONTINUES', unavailableSource: 'PUBLISH_REJECTED_EXPLAIN_UNAVAILABLE', segmentRevision: 'PINNED_REVISION', persistence: 'SNAPSHOT_WITH_SEPARATE_LAST_RECHECK', recheckTrigger: 'DELIVERY_RECHECK_ELIGIBILITY' },
}

const summary = {
  segmentId: 'segment-1', key: 'russian', name: 'Русскоязычные', description: 'Locale ru-RU', status: 'ACTIVE' as const,
  currentRevision: { segmentRevisionId: 'segment-revision-2', revision: 2, catalogRevision: 'audience-catalog-3', contentHash: 'hash-2', publishedAt: '2026-07-18T10:00:00.000Z' },
}
const search: SegmentSearchResponseDto = { items: [summary], nextCursor: null }
const detail: SegmentDetailResponseDto = {
  ...summary,
  currentRevision: { ...summary.currentRevision, rule: { version: 1, root: { kind: 'locale', operator: 'eq', value: 'ru-RU' } } },
  revisions: [
    summary.currentRevision,
    { segmentRevisionId: 'segment-revision-1', revision: 1, catalogRevision: 'audience-catalog-1', contentHash: 'hash-1', publishedAt: '2026-07-17T10:00:00.000Z' },
  ],
}

describe('SegmentManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(scenarioAuthoringRepository.searchSegments).mockResolvedValue(search)
    vi.mocked(scenarioAuthoringRepository.getSegment).mockResolvedValue(detail)
  })

  it('searches project Segments and shows immutable revision history', async () => {
    const wrapper = mount(SegmentManager, { props: { projectId: 'project-1', catalog } })
    await flushPromises()
    expect(wrapper.text()).toContain('Русскоязычные')
    await wrapper.get('button[aria-label="Открыть сегмент Русскоязычные"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('История версий')
    expect(wrapper.text()).toContain('Версия 2')
    expect(wrapper.text()).toContain('Версия 1')
    expect(scenarioAuthoringRepository.searchSegments).toHaveBeenCalledWith('project-1', expect.objectContaining({ includeArchived: true }))
    expect(scenarioAuthoringRepository.getSegment).toHaveBeenCalledWith('project-1', 'segment-1')
    wrapper.unmount()
  })

  it('creates a Segment from a typed Audience rule and pins the observed catalog revision', async () => {
    vi.mocked(scenarioAuthoringRepository.createSegment).mockResolvedValue({ ...summary, revision: summary.currentRevision })
    const wrapper = mount(SegmentManager, { props: { projectId: 'project-1', catalog } })
    await flushPromises()
    await wrapper.get('button[aria-label="Создать сегмент"]').trigger('click')
    await wrapper.get('input[aria-label="Название сегмента"]').setValue('Русскоязычные')
    await wrapper.get('input[aria-label="Ключ сегмента"]').setValue('russian')
    await wrapper.get('button[aria-label^="Добавить условие аудитории в"]').trigger('click')
    await wrapper.get('button[data-audience-source="locale"]').trigger('click')
    await wrapper.get('select[aria-label="Оператор locale"]').setValue('eq')
    await wrapper.get('select[aria-label="Значение locale"]').setValue('ru-RU')
    await wrapper.get('button[aria-label="Применить условие аудитории"]').trigger('click')
    await wrapper.get('button[aria-label="Опубликовать сегмент"]').trigger('click')
    await flushPromises()

    expect(scenarioAuthoringRepository.createSegment).toHaveBeenCalledWith('project-1', {
      catalogRevision: 'audience-catalog-3',
      expectedCurrentRevisionId: null,
      key: 'russian',
      name: 'Русскоязычные',
      description: null,
      rule: { version: 1, root: { kind: 'all', children: [{ kind: 'locale', operator: 'eq', value: 'ru-RU' }] } },
    })
    wrapper.unmount()
  })

  it('archives an identity without pretending its immutable revisions were deleted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(scenarioAuthoringRepository.archiveSegment).mockResolvedValue({ segmentId: 'segment-1', status: 'ARCHIVED' })
    const wrapper = mount(SegmentManager, { props: { projectId: 'project-1', catalog } })
    await flushPromises()
    await wrapper.get('button[aria-label="Архивировать сегмент Русскоязычные"]').trigger('click')
    await flushPromises()

    expect(scenarioAuthoringRepository.archiveSegment).toHaveBeenCalledWith('project-1', 'segment-1')
    expect(wrapper.text()).toContain('Сегмент архивирован. Опубликованные сценарии продолжают использовать закреплённые версии.')
    wrapper.unmount()
  })

  it('keeps the draft while refreshing a concurrently changed Segment head', async () => {
    const nextDetail = { ...detail, currentRevision: { ...detail.currentRevision!, segmentRevisionId: 'segment-revision-3', revision: 3 } }
    vi.mocked(scenarioAuthoringRepository.getSegment).mockResolvedValueOnce(detail).mockResolvedValueOnce(nextDetail)
    vi.mocked(scenarioAuthoringRepository.publishSegmentRevision).mockRejectedValue(new ApiError(409, 'conflict', { currentRevisionId: 'segment-revision-3' }, undefined, 'SEGMENT_REVISION_CONFLICT'))
    const wrapper = mount(SegmentManager, { props: { projectId: 'project-1', catalog } })
    await flushPromises()
    await wrapper.get('button[aria-label="Открыть сегмент Русскоязычные"]').trigger('click')
    await flushPromises()
    await wrapper.get('.detail-actions button').trigger('click')
    await wrapper.get('input[aria-label="Название сегмента"]').setValue('Мой сохранённый черновик')
    await wrapper.get('button[aria-label="Опубликовать сегмент"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Неопубликованный черновик сохранён')
    await wrapper.get('.recovery button').trigger('click')
    await flushPromises()

    expect(wrapper.get('input[aria-label="Название сегмента"]').element).toHaveProperty('value', 'Мой сохранённый черновик')
    expect(wrapper.text()).toContain('segment-revision-3')
  })

  it('ignores a stale search response after a newer query has completed', async () => {
    let resolveOld!: (value: SegmentSearchResponseDto) => void
    let resolveNew!: (value: SegmentSearchResponseDto) => void
    const oldRequest = new Promise<SegmentSearchResponseDto>((resolve) => { resolveOld = resolve })
    const newRequest = new Promise<SegmentSearchResponseDto>((resolve) => { resolveNew = resolve })
    vi.mocked(scenarioAuthoringRepository.searchSegments)
      .mockResolvedValueOnce(search)
      .mockReturnValueOnce(oldRequest)
      .mockReturnValueOnce(newRequest)
    const wrapper = mount(SegmentManager, { props: { projectId: 'project-1', catalog } })
    await flushPromises()
    await wrapper.get('input[aria-label="Поиск сегментов"]').setValue('old')
    await wrapper.get('form.search').trigger('submit')
    await wrapper.get('input[aria-label="Поиск сегментов"]').setValue('new')
    await wrapper.get('form.search').trigger('submit')
    resolveNew({ items: [{ ...summary, segmentId: 'new', name: 'Новый результат' }], nextCursor: null })
    await flushPromises()
    resolveOld({ items: [{ ...summary, segmentId: 'old', name: 'Устаревший результат' }], nextCursor: null })
    await flushPromises()

    expect(wrapper.text()).toContain('Новый результат')
    expect(wrapper.text()).not.toContain('Устаревший результат')
  })

  it('keeps the cursor paired with the query that produced it', async () => {
    vi.mocked(scenarioAuthoringRepository.searchSegments)
      .mockResolvedValueOnce({ ...search, nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: [], nextCursor: null })
    const wrapper = mount(SegmentManager, { props: { projectId: 'project-1', catalog } })
    await flushPromises()
    await wrapper.get('input[aria-label="Поиск сегментов"]').setValue('ещё не применён')
    await wrapper.get('button.more').trigger('click')
    await flushPromises()

    expect(scenarioAuthoringRepository.searchSegments).toHaveBeenLastCalledWith('project-1', expect.objectContaining({ query: undefined, cursor: 'cursor-2' }))
  })

  it('hides Segment mutations in read-only mode', async () => {
    const wrapper = mount(SegmentManager, { props: { projectId: 'project-1', catalog, readonly: true } })
    await flushPromises()

    expect(wrapper.find('button[aria-label="Создать сегмент"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label^="Архивировать сегмент"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Режим просмотра')
  })

  it('maps backend Segment rule issues back to the exact Audience control', async () => {
    vi.mocked(scenarioAuthoringRepository.createSegment).mockRejectedValue(new ApiError(422, 'invalid', {
      details: { issues: [{ code: 'AUDIENCE_VALUE_INVALID', message: 'Страна больше недоступна', path: 'root.children.0.value' }] },
    }, undefined, 'SEGMENT_RULE_INVALID'))
    const wrapper = mount(SegmentManager, { attachTo: document.body, props: { projectId: 'project-1', catalog } })
    await flushPromises()
    await wrapper.get('button[aria-label="Создать сегмент"]').trigger('click')
    await wrapper.get('input[aria-label="Название сегмента"]').setValue('Испания')
    await wrapper.get('input[aria-label="Ключ сегмента"]').setValue('spain')
    await wrapper.get('button[aria-label^="Добавить условие аудитории в"]').trigger('click')
    await wrapper.get('button[data-audience-source="country"]').trigger('click')
    await wrapper.get('input[aria-label="ISO-код страны"]').setValue('ES')
    await wrapper.get('button[aria-label="Применить условие аудитории"]').trigger('click')
    await wrapper.get('button[aria-label="Опубликовать сегмент"]').trigger('click')
    await flushPromises()

    const input = wrapper.get('input[aria-label="ISO-код страны"]')
    expect(wrapper.text()).toContain('Страна больше недоступна')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(input.element)
    wrapper.unmount()
  })
})
