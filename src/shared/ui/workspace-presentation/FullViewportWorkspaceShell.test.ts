import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FullViewportWorkspaceShell from './FullViewportWorkspaceShell.vue';
import {
  acquireRootScrollLock,
  getRootScrollLockCount,
  releaseRootScrollLock,
} from './root-scroll-lock';

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  while (getRootScrollLockCount() > 0) releaseRootScrollLock();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('FullViewportWorkspaceShell', () => {
  it('moves one mounted workspace into the full-tab layer without losing state', async () => {
    const mode = ref<'windowed' | 'full-tab'>('windowed');
    const DraftState = defineComponent({
      template: '<input v-model="draft" data-testid="draft" aria-label="Draft" />',
      setup() {
        return { draft: ref('operator draft') };
      },
    });
    const wrapper = mount(FullViewportWorkspaceShell, {
      attachTo: document.body,
      props: { mode: mode.value },
      slots: { default: () => h(DraftState) },
    });
    const draft = wrapper.get('[data-testid="draft"]');
    const input = draft.element as HTMLInputElement;
    await draft.setValue('preserved draft');

    mode.value = 'full-tab';
    await wrapper.setProps({ mode: mode.value });
    await nextTick();

    const shell = document.body.querySelector('[data-testid="workspace-presentation-shell"]');
    expect(shell?.getAttribute('data-presentation-mode')).toBe('full-tab');
    expect(shell?.querySelector('[data-testid="draft"]')).toBe(input);
    expect(input.value).toBe('preserved draft');
    wrapper.unmount();
  });

  it('derives the FLIP transform from the actual windowed workspace rect', async () => {
    const wrapper = mount(FullViewportWorkspaceShell, {
      attachTo: document.body,
      props: { mode: 'windowed' },
      slots: {
        default: '<section data-testid="measured-workspace">content</section>',
      },
    });
    const measured = wrapper.get('[data-testid="measured-workspace"]');
    vi.spyOn(measured.element, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(96, 72, 720, 540),
    );

    await wrapper.setProps({ mode: 'full-tab' });
    await nextTick();

    const shell = document.body.querySelector<HTMLElement>(
      '[data-testid="workspace-presentation-shell"]',
    );
    expect(shell?.style.getPropertyValue('--workspace-flip-enter-transform')).toMatch(
      /^translate\(96px, 72px\) scale\(/,
    );
    expect(shell?.getAttribute('aria-busy')).toBe('true');
    wrapper.unmount();
  });

  it('keeps the root locked until the last nested presentation owner releases', () => {
    const app = document.createElement('div');
    app.id = 'app';
    document.body.append(app);

    acquireRootScrollLock();
    acquireRootScrollLock();

    expect(getRootScrollLockCount()).toBe(2);
    expect(app.inert).toBe(true);
    expect(document.documentElement.style.overflow).toBe('hidden');

    releaseRootScrollLock();
    expect(app.inert).toBe(true);

    releaseRootScrollLock();
    expect(app.inert).toBe(false);
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('restores the exact page scroll position after the final owner releases', () => {
    const scrollTo = vi.mocked(window.scrollTo);
    scrollTo.mockClear();
    Object.defineProperty(window, 'scrollX', { configurable: true, value: 18 });
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 240,
    });

    acquireRootScrollLock();

    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-240px');
    expect(document.body.style.left).toBe('-18px');

    releaseRootScrollLock();

    expect(scrollTo).toHaveBeenCalledWith(18, 240);
    Object.defineProperty(window, 'scrollX', { configurable: true, value: 0 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });
});
