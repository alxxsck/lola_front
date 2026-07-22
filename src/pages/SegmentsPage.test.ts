import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SegmentsPage from './SegmentsPage.vue'

const mocks = vi.hoisted(() => ({
  getSegmentCatalog: vi.fn(),
  getScenarioContract: vi.fn(),
}))

vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => ({
    project: {
      id: 'project-1',
      effectivePermissionCodes: ['project.segments.read'],
    },
  }),
}))
vi.mock('@/shared/api/repository', () => ({ repository: { mode: 'api' } }))
vi.mock('@/shared/api/repository/scenario-authoring', () => ({
  segmentCatalogRepository: { get: mocks.getSegmentCatalog },
  scenarioAuthoringRepository: { getContract: mocks.getScenarioContract },
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'segments', params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

describe('SegmentsPage permission-owned catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSegmentCatalog.mockResolvedValue({ revision: 'audience-1' })
  })

  it('loads the segment-owned catalog without scenario read authority', async () => {
    const wrapper = shallowMount(SegmentsPage)
    await flushPromises()

    expect(mocks.getSegmentCatalog).toHaveBeenCalledWith('project-1')
    expect(mocks.getScenarioContract).not.toHaveBeenCalled()
    expect(wrapper.findComponent({ name: 'SegmentManager' }).props('readonly')).toBe(true)
  })
})
