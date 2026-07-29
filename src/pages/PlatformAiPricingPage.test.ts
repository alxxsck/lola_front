import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/auth.store'
import { ApiError } from '@/shared/api/http/api-error'
import PlatformAiPricingPage from './PlatformAiPricingPage.vue'

const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  publish: vi.fn(),
}))

vi.mock('@/features/ai-pricing/ai-pricing.api', () => ({
  fetchTextToSpeechPricing: api.fetch,
  publishTextToSpeechPricing: api.publish,
}))

const revision = {
  id: '00000000-0000-4000-8000-000000000001',
  provider: 'xai',
  operation: 'speech',
  currency: 'usd',
  unit: 'per_million_input_characters',
  rate: '15',
  effectiveFrom: '2026-07-29T10:00:00.000Z',
  sourceUrl: 'https://docs.x.ai/developers/pricing',
  changeReason: 'Первичная проверенная ставка',
  createdBy: { type: 'CMS_USER', id: 'operator-1' },
  createdAt: '2026-07-29T10:00:00.000Z',
} as const

const state = {
  current: revision,
  history: [revision],
  hasMore: false,
  nextCursor: null,
  sourceUrl: 'https://docs.x.ai/developers/pricing',
}

async function mountPage(write = true) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.$patch({
    restored: true,
    phase: 'AUTHENTICATED',
    user: {
      id: 'operator-1',
      email: 'operator@example.com',
      name: 'Оператор',
      platformPermissionCodes: [
        'platform.ai_pricing.read',
        ...(write ? ['platform.ai_pricing.write'] : []),
      ],
    },
    project: null,
    projects: [],
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/platform/ai-pricing',
        name: 'platform-ai-pricing',
        component: PlatformAiPricingPage,
      },
      {
        path: '/settings/security',
        name: 'security-settings',
        component: { template: '<div>security</div>' },
      },
      {
        path: '/login',
        name: 'login',
        component: { template: '<div>login</div>' },
      },
    ],
  })
  await router.push('/platform/ai-pricing')
  await router.isReady()
  const wrapper = mount(RouterView, {
    global: { plugins: [pinia, router, PrimeVue] },
  })
  await flushPromises()
  return { auth, router, wrapper }
}

describe('Platform AI pricing page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.fetch.mockResolvedValue(state)
    api.publish.mockResolvedValue(state)
  })

  it('shows current append-only history and official pricing source to readers', async () => {
    const { wrapper } = await mountPage(false)

    expect(wrapper.text()).toContain('xAI — озвучивание текста')
    expect(wrapper.text()).toContain('15,00 $')
    expect(wrapper.text()).toContain('за 1 000 000 входных символов')
    expect(wrapper.text()).toContain('29.07.2026')
    expect(wrapper.text()).toContain('Первичная проверенная ставка')
    expect(wrapper.text()).toContain('operator-1')
    expect(wrapper.get('a').attributes()).toMatchObject({
      href: state.sourceUrl,
      target: '_blank',
      rel: 'noopener noreferrer',
    })
    expect(wrapper.text()).not.toContain('Опубликовать новую ставку')
    expect(wrapper.text()).not.toMatch(/Редактировать|Удалить|Дата действия/)
  })

  it('publishes after explicit confirmation and then reloads backend-owned state', async () => {
    const nextRevision = {
      ...revision,
      id: '00000000-0000-4000-8000-000000000002',
      rate: '16.5',
      changeReason: 'Публичный тариф xAI изменился',
    }
    api.fetch.mockResolvedValueOnce(state).mockResolvedValueOnce({
      ...state,
      current: nextRevision,
      history: [nextRevision, revision],
    })
    const { wrapper } = await mountPage()

    await wrapper.get('[data-testid="pricing-rate"]').setValue('16.5')
    await wrapper
      .get('[data-testid="pricing-reason"]')
      .setValue('Публичный тариф xAI изменился')
    await wrapper.get('form').trigger('submit')

    const confirmation = wrapper.get('[role="dialog"]')
    expect(confirmation.text()).toContain(
      'Новая ставка применяется только к следующим операциям. История не пересчитывается',
    )
    await confirmation.get('[data-testid="confirm-pricing"]').trigger('click')
    await flushPromises()

    expect(api.publish).toHaveBeenCalledWith({
      ratePerMillionCharacters: '16.5',
      changeReason: 'Публичный тариф xAI изменился',
    })
    expect(api.fetch).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('16,50 $')
    expect(wrapper.text()).toContain('Первичная проверенная ставка')
  })

  it('validates decimal rate and mandatory reason before confirmation', async () => {
    const { wrapper } = await mountPage()

    await wrapper
      .get('[data-testid="pricing-rate"]')
      .setValue('15.1234567890123')
    await wrapper.get('[data-testid="pricing-reason"]').setValue(' ')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.text()).toContain('до 12 знаков после запятой')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(api.publish).not.toHaveBeenCalled()
  })

  it('warns that TTS is blocked when no active revision exists', async () => {
    api.fetch.mockResolvedValue({
      ...state,
      current: null,
      history: [],
    })
    const { wrapper } = await mountPage(false)

    expect(wrapper.text()).toContain(
      'Озвучивание текста заблокировано до первичной настройки ставки',
    )
  })

  it('appends older immutable history pages without duplicating revisions', async () => {
    const older = {
      ...revision,
      id: '00000000-0000-4000-8000-000000000000',
      rate: '14',
      changeReason: 'Предыдущая проверенная ставка',
    }
    api.fetch
      .mockResolvedValueOnce({
        ...state,
        hasMore: true,
        nextCursor: revision.id,
      })
      .mockResolvedValueOnce({
        ...state,
        history: [older],
        hasMore: false,
        nextCursor: null,
      })
    const { wrapper } = await mountPage(false)

    const loadMore = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Загрузить ещё'))
    expect(loadMore).toBeDefined()
    await loadMore!.trigger('click')
    await flushPromises()

    expect(api.fetch).toHaveBeenLastCalledWith({
      cursor: revision.id,
      limit: 50,
    })
    expect(wrapper.text()).toContain('Первичная проверенная ставка')
    expect(wrapper.text()).toContain('Предыдущая проверенная ставка')
  })

  it('offers fresh login without replaying a denied publication', async () => {
    api.publish.mockRejectedValue(
      new ApiError(
        428,
        'unsafe backend text',
        undefined,
        'request-1',
        'REAUTHENTICATION_REQUIRED',
      ),
    )
    const { auth, router, wrapper } = await mountPage()
    const logout = vi.spyOn(auth, 'logout').mockResolvedValue()

    await wrapper.get('[data-testid="pricing-rate"]').setValue('16')
    await wrapper
      .get('[data-testid="pricing-reason"]')
      .setValue('Проверенная новая ставка')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('[data-testid="confirm-pricing"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Требуется свежий вход с MFA')
    expect(wrapper.text()).not.toContain('unsafe backend text')
    expect(api.publish).toHaveBeenCalledOnce()
    await wrapper.get('[data-testid="pricing-fresh-login"]').trigger('click')
    await flushPromises()

    expect(logout).toHaveBeenCalledOnce()
    expect(router.currentRoute.value).toMatchObject({
      name: 'login',
      query: { redirect: '/platform/ai-pricing' },
    })
    expect(api.publish).toHaveBeenCalledOnce()
  })

  it('scrubs pricing data and redirects when read permission is lost', async () => {
    const { auth, router, wrapper } = await mountPage()
    expect(wrapper.text()).toContain('Первичная проверенная ставка')

    auth.user!.platformPermissionCodes = ['platform.ai_pricing.write']
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('security-settings')
    expect(wrapper.text()).not.toContain('Первичная проверенная ставка')
  })
})
