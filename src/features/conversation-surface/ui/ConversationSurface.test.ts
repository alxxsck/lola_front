import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConversationSurface from "./ConversationSurface.vue";
import ReplyTranslationPreview from "@/features/conversation-translation/ui/ReplyTranslationPreview.vue";
import type {
  ConversationSurfaceComposer,
  ConversationSurfaceMessage,
  ConversationSurfaceTranslation,
} from "../model/conversation-surface-contract";
import { runConversationSurfaceBehaviorSuite } from "../testing/conversation-surface-behavior-suite";
import {
  conversationSurfaceSessionKey,
  writeConversationSurfaceScrollAnchor,
} from "../model/conversation-surface-session";

beforeEach(() => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const messages: ConversationSurfaceMessage[] = [
  {
    id: "message-2",
    ordinal: 2,
    placement: "OUTBOUND",
    author: { displayName: "Анна · Support", avatarUrl: null },
    createdAt: "2026-08-07T09:02:00.000Z",
    content: {
      text: "I will check this for you.",
      status: "COMPLETED",
      translation: {
        direction: "OUTBOUND",
        status: "COMPLETED",
        originalText: "Я проверю это для вас.",
        translatedText: "I will check this for you.",
        deliveredText: "I will check this for you.",
        viewText: "Я проверю это для вас.",
        targetLocale: "en",
        warnings: [],
      },
    },
    delivery: { label: "Доставлено", tone: "SUCCESS" },
  },
  {
    id: "message-1",
    ordinal: 1,
    placement: "INBOUND",
    author: { displayName: "Пользователь", avatarUrl: null },
    createdAt: "2026-08-07T09:03:00.000Z",
    content: {
      text: "I cannot complete the payment",
      status: "COMPLETED",
      translation: {
        direction: "INBOUND",
        status: "COMPLETED",
        originalText: "I cannot complete the payment",
        translatedText: "Я не могу завершить оплату",
        deliveredText: null,
        viewText: "Я не могу завершить оплату",
        targetLocale: "ru",
        warnings: [],
      },
    },
  },
];

function translation(
  overrides: Partial<ConversationSurfaceTranslation> = {},
): ConversationSurfaceTranslation {
  return {
    available: true,
    mode: "ORIGINAL",
    changing: false,
    workingLocaleLabel: "Русский",
    loading: false,
    progress: null,
    ...overrides,
  };
}

type PublicComposer = Extract<
  ConversationSurfaceComposer,
  { mode: "PUBLIC_REPLY" }
>;
type NoteComposer = Extract<
  ConversationSurfaceComposer,
  { mode: "INTERNAL_NOTE" }
>;

function composer(conversationId = "conversation-1"): PublicComposer {
  const base = {
    visibility: "ENABLED" as const,
    scope: {
      projectId: "project-1",
      actorId: "operator-1",
      conversationId,
    },
    initialDraft: "",
    draftRevision: "initial",
    sending: false,
    recipientStatus: { label: "Пользователь офлайн", tone: "OFFLINE" as const },
    actions: {
      attachment: { visibility: "ENABLED" as const },
      createTicket: { visibility: "HIDDEN" as const },
      templates: { visibility: "ENABLED" as const },
      improveWithAI: {
        visibility: "DISABLED" as const,
        reason: "Функция пока недоступна",
      },
      sendWithoutTranslation: { visibility: "HIDDEN" as const },
    },
  };
  return {
    ...base,
    mode: "PUBLIC_REPLY",
    sendCapability: { kind: "SOURCE" },
    replyPreview: null,
    translationAssist: null,
  };
}

function noteComposer(
  conversationId = "conversation-1",
  caseId = "case-1",
): NoteComposer {
  return {
    ...composer(conversationId),
    mode: "INTERNAL_NOTE",
    draftTargetId: caseId,
    sendCapability: { kind: "SOURCE" },
    replyPreview: null,
    translationAssist: null,
  };
}

function mountSurface(
  props: Partial<InstanceType<typeof ConversationSurface>["$props"]> = {},
  slots: Record<string, string> = {},
) {
  return mount(ConversationSurface, {
    props: {
      title: "Оплата не проходит",
      messages,
      history: {
        loading: false,
        loadingOlder: false,
        hasOlder: true,
      },
      translation: translation(),
      composer: composer(),
      ...props,
    },
    slots,
    global: {
      stubs: {
        Button: {
          props: ["label", "disabled", "loading"],
          emits: ["click"],
          template:
            '<button type="button" :disabled="disabled" :aria-busy="String(Boolean(loading))" @click="$emit(\'click\')">{{ label }}<slot /></button>',
        },
        Textarea: {
          props: ["modelValue", "disabled", "placeholder", "ariaLabel"],
          emits: ["update:modelValue", "keydown"],
          template:
            '<textarea :value="modelValue" :disabled="disabled" :placeholder="placeholder" :aria-label="ariaLabel" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown="$emit(\'keydown\', $event)" />',
        },
      },
    },
  });
}

runConversationSurfaceBehaviorSuite({
  name: "canonical component",
  mount: () => mountSurface(),
  expectedMessageIds: ["message-1", "message-2"],
  translationAvailable: true,
  translatedText: "Я не могу завершить оплату",
  translation: translation(),
  composer: composer(),
  alternateComposer: composer("conversation-2"),
  messagesWithGap: messages.map((message) =>
    message.id === "message-2" ? { ...message, ordinal: 3 } : message,
  ),
});

describe("ConversationSurface", () => {
  it("keeps a server-authorized delivery retry beside the failed outbound message", async () => {
    const failedMessages: ConversationSurfaceMessage[] = messages.map(
      (message) =>
        message.id === "message-2"
          ? {
              ...message,
              delivery: {
                label: "Ошибка доставки",
                tone: "DANGER",
                action: {
                  label: "Повторить",
                  busy: false,
                  disabled: false,
                },
                detail: "Сообщение точно не доставлено.",
              },
            }
          : message,
    );
    const wrapper = mountSurface({ messages: failedMessages });

    const message = wrapper.get('[data-message-id="message-2"]');
    expect(message.get('[role="status"]').text()).toContain("Ошибка доставки");
    expect(message.text()).toContain("Сообщение точно не доставлено.");
    await message.get('[data-action="retry-delivery"]').trigger("click");

    expect(wrapper.emitted("retry-delivery")).toEqual([["message-2"]]);
  });

  it("marks the first unread boundary and reports only the visibly read high-water", async () => {
    vi.useFakeTimers();
    const wrapper = mountSurface({
      history: {
        loading: false,
        loadingOlder: false,
        hasOlder: false,
        firstUnreadOrdinal: 2,
      },
    });
    const divider = wrapper.get('[data-first-unread-ordinal="2"]');
    expect(divider.text()).toContain("Новые сообщения");
    expect(
      divider.element.nextElementSibling?.getAttribute("data-message-id"),
    ).toBe("message-2");

    const log = wrapper.get('[role="log"]');
    vi.spyOn(log.element, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 240,
      height: 240,
      left: 0,
      right: 600,
      width: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const rendered = wrapper.findAll<HTMLElement>("[data-message-id]");
    vi.spyOn(rendered[0]!.element, "getBoundingClientRect").mockReturnValue({
      top: -80,
      bottom: -10,
      height: 70,
      left: 0,
      right: 300,
      width: 300,
      x: 0,
      y: -80,
      toJSON: () => ({}),
    });
    vi.spyOn(rendered[1]!.element, "getBoundingClientRect").mockReturnValue({
      top: 40,
      bottom: 120,
      height: 80,
      left: 300,
      right: 600,
      width: 300,
      x: 300,
      y: 40,
      toJSON: () => ({}),
    });

    await log.trigger("scroll");
    await vi.advanceTimersByTimeAsync(75);
    expect(wrapper.emitted("visible-high-water")?.at(-1)).toEqual([2]);
  });

  it("does not report observed messages until the document is visible and focused", async () => {
    vi.useFakeTimers();
    let callback: IntersectionObserverCallback | undefined;
    class MockIntersectionObserver {
      constructor(next: IntersectionObserverCallback) {
        callback = next;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0];
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.mocked(document.hasFocus).mockReturnValue(false);
    const wrapper = mountSurface({
      history: {
        loading: false,
        loadingOlder: false,
        hasOlder: false,
        firstUnreadOrdinal: 2,
      },
    });
    await flushPromises();
    const observed = wrapper.get('[data-message-ordinal="2"]').element;
    const log = wrapper.get('[role="log"]');
    vi.spyOn(log.element, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 120,
      height: 120,
      left: 0,
      right: 390,
      width: 390,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(observed, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 2000,
      height: 2000,
      left: 0,
      right: 390,
      width: 390,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    callback?.(
      [
        {
          target: observed,
          isIntersecting: true,
          boundingClientRect: { height: 80 },
          intersectionRect: { height: 80 },
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    await vi.advanceTimersByTimeAsync(75);
    expect(wrapper.emitted("visible-high-water")).toBeUndefined();

    vi.mocked(document.hasFocus).mockReturnValue(true);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(75);
    expect(wrapper.emitted("visible-high-water")?.at(-1)).toEqual([2]);
  });

  it("ignores a queued visibility report after the document environment is torn down", async () => {
    vi.useFakeTimers();
    const wrapper = mountSurface();
    await flushPromises();

    await wrapper.get('[role="log"]').trigger("scroll");
    vi.stubGlobal("document", undefined);

    await vi.advanceTimersByTimeAsync(75);
    expect(wrapper.emitted("visible-high-water")).toBeUndefined();
  });

  it("prefers the authoritative first unread over a saved latest anchor", async () => {
    const activeComposer = composer();
    writeConversationSurfaceScrollAnchor(
      conversationSurfaceSessionKey(activeComposer.scope),
      { messageId: "message-2", offset: 0, atLatest: true },
    );
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    try {
      mountSurface({
        composer: activeComposer,
        history: {
          loading: false,
          loadingOlder: false,
          hasOlder: false,
          firstUnreadOrdinal: 1,
        },
      });
      await flushPromises();

      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
    }
  });

  it("loads the signed newer page without treating the current window as latest", async () => {
    const wrapper = mountSurface({
      history: {
        loading: false,
        loadingOlder: false,
        loadingNewer: false,
        hasOlder: false,
        hasNewer: true,
        firstUnreadOrdinal: 1,
      },
    });

    await wrapper.get('[data-action="load-newer"]').trigger("click");

    expect(wrapper.emitted("load-newer")).toHaveLength(1);
  });

  it("preserves the compact Users composer visual contract", () => {
    const wrapper = mountSurface();
    const labels = wrapper.findAll("button").map((button) => button.text());

    expect(
      wrapper.find(".conversation-surface__composer-header").exists(),
    ).toBe(false);
    expect(wrapper.text()).toContain("Ваш текст · Русский");
    expect(wrapper.text()).toContain(
      "Enter — отправить · Shift+Enter — перенос строки",
    );
    expect(labels).toEqual(
      expect.arrayContaining(["Действие", "Шаблоны", "Улучшить с AI"]),
    );
    expect(labels.filter((label) => label.includes("Отправить"))).toEqual([
      "Отправить",
    ]);
  });

  it("keeps an unknown send outcome inside the compact composer and checks without resending", async () => {
    const wrapper = mountSurface({
      composer: {
        ...composer(),
        outcome: {
          state: "CHECKING_OUTCOME",
          label: "Результат пока неизвестен. Сообщение не отправляется заново.",
          action: { kind: "CHECK", label: "Проверить результат" },
        },
      } as PublicComposer,
    });

    expect(wrapper.get(".conversation-composer__outcome").text()).toContain(
      "Результат пока неизвестен",
    );
    expect(wrapper.get("textarea").attributes("disabled")).toBeDefined();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Проверить результат")!
      .trigger("click");
    expect(wrapper.emitted("check-send-outcome")).toHaveLength(1);
    expect(wrapper.emitted("send")).toBeUndefined();
  });

  it("offers the original stable attempt only after outcome lookup returns not found", async () => {
    const wrapper = mountSurface({
      composer: {
        ...composer(),
        initialDraft: "Повторить этот ответ",
        outcome: {
          state: "RETRYABLE",
          label: "Отправка не найдена. Черновик сохранён.",
        },
      } as PublicComposer,
    });

    const retry = wrapper
      .findAll("button")
      .find((button) => button.text() === "Повторить отправку");
    expect(retry).toBeDefined();
    await wrapper.get(".conversation-composer").trigger("submit");
    expect(wrapper.emitted("send")).toHaveLength(1);
  });

  it("lets the operator discard a blocked key without losing the draft", async () => {
    const wrapper = mountSurface({
      composer: {
        ...composer(),
        initialDraft: "Исправить и отправить новым ключом",
        outcome: {
          state: "BLOCKED",
          label: "Отправка заблокирована. Черновик сохранён.",
          action: { kind: "DISCARD", label: "Начать новую попытку" },
        },
      } as PublicComposer,
    });

    expect(wrapper.get("textarea").attributes("disabled")).toBeDefined();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Начать новую попытку")!
      .trigger("click");
    expect(wrapper.emitted("discard-send-attempt")).toHaveLength(1);
    expect(wrapper.emitted("send")).toBeUndefined();
  });

  it("renders one canonical log ordered by ordinal with author, time and textual delivery", () => {
    const wrapper = mountSurface();
    const rendered = wrapper.findAll("[data-message-id]");

    expect(rendered.map((item) => item.attributes("data-message-id"))).toEqual([
      "message-1",
      "message-2",
    ]);
    expect(rendered[0]?.text()).toContain("Пользователь");
    expect(rendered[1]?.text()).toContain("Анна · Support");
    expect(rendered[1]?.text()).toContain("Доставлено");
    expect(wrapper.get('[role="log"]').attributes("aria-live")).toBe("polite");
  });

  it("requests translation mode without committing it before the adapter succeeds", async () => {
    const wrapper = mountSurface();
    const buttons = wrapper.findAll(
      '[aria-label="Режим отображения сообщений"] button',
    );

    expect(buttons.map((button) => button.text())).toEqual([
      "Оригинал",
      "Перевод · Русский",
    ]);
    expect(wrapper.text()).toContain("I cannot complete the payment");

    await buttons[1]!.trigger("click");
    expect(wrapper.text()).toContain("I cannot complete the payment");
    expect(wrapper.emitted("change-translation-mode")?.at(-1)).toEqual([
      "TRANSLATED",
    ]);

    await wrapper.setProps({
      translation: translation({ changing: true }),
    });
    expect(wrapper.text()).toContain("I cannot complete the payment");

    await wrapper.setProps({
      translation: translation({ mode: "TRANSLATED" }),
    });
    expect(wrapper.text()).toContain("Я не могу завершить оплату");
  });

  it("accepts a conversation-scoped translation mode from the canonical adapter scope", async () => {
    const wrapper = mountSurface({
      translation: translation({ mode: "TRANSLATED" }),
    });
    expect(wrapper.text()).toContain("Я не могу завершить оплату");

    await wrapper.setProps({
      composer: composer("conversation-2"),
      translation: translation({ mode: "ORIGINAL" }),
    });
    expect(wrapper.text()).toContain("I cannot complete the payment");
  });

  it("shows bulk translation progress without reordering the log", () => {
    const wrapper = mountSurface({
      translation: translation({
        mode: "TRANSLATED",
        progress: { completed: 3, total: 8, cancellable: true },
      }),
    });

    expect(wrapper.get('[role="status"]').text()).toContain("3 из 8");
    expect(
      wrapper
        .findAll("[data-message-id]")
        .map((item) => item.attributes("data-message-id")),
    ).toEqual(["message-1", "message-2"]);
  });

  it("keeps the reply translation preview inside the shared composer behavior", async () => {
    const wrapper = mountSurface({
      composer: {
        ...composer(),
        sendCapability: { kind: "TRANSLATED_PREVIEW" },
        replyPreview: {
          draft: {
            status: "READY",
            targetLocale: "en",
            translatedText: "I will check the payment status.",
            warnings: [],
          },
          targetLocale: "en",
          busy: false,
          stale: false,
          disabled: false,
        },
      },
    });

    expect(
      wrapper.get('[aria-label="Предпросмотр перевода ответа"]').text(),
    ).toContain("Уйдёт пользователю · EN");
    expect(wrapper.get(".conversation-composer").classes()).toContain(
      "is-translated",
    );
    expect(
      wrapper
        .findAll("button")
        .map((button) => button.text())
        .filter((label) => label.includes("Отправить")),
    ).toEqual(["Отправить перевод"]);
    await wrapper
      .get('[aria-label="Предпросмотр перевода ответа"] button:last-of-type')
      .trigger("click");
    expect(wrapper.emitted("send-reply-translation")?.[0]?.[0]).toMatchObject({
      scopeKey: "project-1:operator-1:conversation-1:PUBLIC_REPLY",
      mode: "PUBLIC_REPLY",
      text: "I will check the payment status.",
    });
  });

  it.each([
    {
      name: "stale",
      preview: {
        draft: {
          status: "READY" as const,
          targetLocale: "en",
          translatedText: "Ready but stale",
          warnings: [],
        },
        targetLocale: "en",
        busy: false,
        stale: true,
        disabled: false,
      },
    },
    {
      name: "failed",
      preview: {
        draft: {
          status: "FAILED" as const,
          targetLocale: "en",
          translatedText: null,
          warnings: [],
        },
        targetLocale: "en",
        busy: false,
        stale: false,
        disabled: false,
      },
    },
  ])(
    "fails closed when the reply translation is $name",
    async ({ preview }) => {
      const wrapper = mountSurface({
        composer: {
          ...composer(),
          sendCapability: { kind: "TRANSLATED_PREVIEW" },
          initialDraft: "Нельзя отправить оригинал",
          replyPreview: preview,
        },
      });

      await wrapper.get("textarea").trigger("keydown", { key: "Enter" });
      wrapper
        .getComponent(ReplyTranslationPreview)
        .vm.$emit("send", "Programmatic bypass");
      expect(wrapper.emitted("send")).toBeUndefined();
      expect(wrapper.emitted("send-reply-translation")).toBeUndefined();
      expect(wrapper.text()).not.toContain("Отправить пользователю");
      const translationSend = wrapper
        .findAll("button")
        .find((button) => button.text().includes("Отправить перевод"));
      if (translationSend)
        expect(translationSend.attributes("disabled")).toBeDefined();
    },
  );

  it("preserves scoped drafts across conversations and public/note modes", async () => {
    const wrapper = mountSurface();
    const textarea = wrapper.get('textarea[aria-label="Ответ пользователю"]');
    await textarea.setValue("Черновик ответа");

    await wrapper.setProps({
      composer: composer("conversation-2"),
    });
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "",
    );
    await wrapper.get("textarea").setValue("Другой диалог");

    await wrapper.setProps({
      composer: noteComposer("conversation-1"),
    });
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "",
    );
    await wrapper.get("textarea").setValue("Заметка только для команды");

    await wrapper.setProps({ composer: composer("conversation-1") });
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "Черновик ответа",
    );
  });

  it("isolates private drafts by Case even when the Conversation is shared", async () => {
    const wrapper = mountSurface({
      composer: noteComposer("conversation-1", "case-1"),
    });
    await wrapper.get("textarea").setValue("Контекст только Case 1");

    await wrapper.setProps({
      composer: noteComposer("conversation-1", "case-2"),
    });
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "",
    );

    await wrapper.setProps({
      composer: noteComposer("conversation-1", "case-1"),
    });
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "Контекст только Case 1",
    );
  });

  it("purges every cached private draft when sensitive authority is revoked", async () => {
    const wrapper = mountSurface({ composer: noteComposer() });
    await wrapper.get("textarea").setValue("Нельзя пережить revoke");

    await wrapper.setProps({
      composer: {
        ...composer(),
        sensitiveDraftPurgeRevision: 1,
      },
    });
    await wrapper.setProps({
      composer: {
        ...noteComposer(),
        sensitiveDraftPurgeRevision: 1,
      },
    });

    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "",
    );
  });

  it("makes public and private composer states explicit without duplicating the Surface", async () => {
    const publicComposer = {
      ...composer(),
      modeSwitch: {
        publicReply: { visibility: "ENABLED" as const },
        internalNote: { visibility: "ENABLED" as const },
      },
    };
    const wrapper = mountSurface({ composer: publicComposer });

    await wrapper
      .get('[aria-label="Вид сообщения"] button:nth-child(2)')
      .trigger("click");
    expect(wrapper.emitted("change-composer-mode")?.at(-1)).toEqual([
      "INTERNAL_NOTE",
    ]);

    await wrapper.setProps({
      composer: { ...noteComposer(), modeSwitch: publicComposer.modeSwitch },
      internalNotes: {
        loading: false,
        error: "",
        totalVisible: 1,
        hasMore: false,
        items: [
          {
            id: "note-1",
            body: "Проверить платёж до ответа",
            lifecycle: "ACTIVE",
            creatorName: "Алина",
            updatedAt: "2026-08-07T10:00:00.000Z",
          },
        ],
      },
    });

    expect(wrapper.text()).toContain("Видно только команде");
    expect(wrapper.text()).toContain("Закрытая лента");
    expect(wrapper.text()).toContain("Проверить платёж до ответа");
    expect(
      wrapper.find('textarea[aria-label="Внутренняя заметка"]').exists(),
    ).toBe(true);
    expect(wrapper.text()).toContain("Добавить заметку");
  });

  it("synchronizes an externally applied template without changing the draft scope", async () => {
    const wrapper = mountSurface();
    await wrapper.get("textarea").setValue("Черновик оператора");

    await wrapper.setProps({
      composer: {
        ...composer(),
        initialDraft: "Шаблон ответа пользователю",
      },
    });

    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "Шаблон ответа пользователю",
    );
  });

  it("sends on exact Enter or Ctrl/Cmd+Enter but ignores IME, Shift and Alt", async () => {
    const wrapper = mountSurface();
    const textarea = wrapper.get("textarea");
    await textarea.setValue("Готовый ответ");

    await textarea.trigger("keydown", { key: "Enter", isComposing: true });
    await textarea.trigger("keydown", { key: "Enter", shiftKey: true });
    await textarea.trigger("keydown", { key: "Enter", altKey: true });
    expect(wrapper.emitted("send")).toBeUndefined();

    await textarea.trigger("keydown", { key: "Enter" });
    await textarea.trigger("keydown", { key: "Enter", ctrlKey: true });
    expect(wrapper.emitted("send")).toHaveLength(2);
    expect(wrapper.emitted("send")?.[0]?.[0]).toMatchObject({
      text: "Готовый ответ",
      mode: "PUBLIC_REPLY",
    });
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "Готовый ответ",
    );

    await wrapper.setProps({
      composer: {
        ...composer(),
        initialDraft: "",
        draftRevision: "accepted-message-1",
      },
    });
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "",
    );

    await wrapper.setProps({
      composer: {
        ...composer(),
        initialDraft: "Восстановлено после 409",
        draftRevision: "conflict-recovery-2",
      },
    });
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "Восстановлено после 409",
    );
  });

  it("keeps colliding messages visible and asks the adapter to reconcile gaps and conflicts", async () => {
    const wrapper = mountSurface({
      messages: [
        messages[1]!,
        {
          ...messages[1]!,
          ordinal: 3,
          revision: "conflicting-revision",
          author: { displayName: "Конфликтующий автор", avatarUrl: null },
          content: { ...messages[1]!.content, text: "Conflicting payload" },
        },
        {
          ...messages[0]!,
          id: "message-collision",
          ordinal: 1,
        },
        {
          ...messages[0]!,
          ordinal: 4,
        },
      ],
    });
    await flushPromises();

    expect(
      wrapper
        .findAll("[data-message-id]")
        .map((item) => item.attributes("data-message-id")),
    ).toEqual(["message-1", "message-collision", "message-2"]);
    expect(wrapper.emitted("reconcile-required")?.[0]?.[0]).toEqual(
      expect.arrayContaining([
        { kind: "MESSAGE_ID_CONFLICT", messageId: "message-1" },
        {
          kind: "ORDINAL_COLLISION",
          ordinal: 1,
          messageIds: ["message-1", "message-collision"],
        },
        { kind: "ORDINAL_GAP", afterOrdinal: 1, beforeOrdinal: 4 },
      ]),
    );
    expect(wrapper.text()).toContain("Пользователь");
    expect(wrapper.text()).not.toContain("Конфликтующий автор");
    expect(wrapper.text()).not.toContain("Conflicting payload");
  });

  it("preserves the visual anchor after an older page is prepended", async () => {
    const wrapper = mountSurface();
    const log = wrapper.get('[role="log"]').element as HTMLElement;
    Object.defineProperties(log, {
      scrollHeight: { configurable: true, get: vi.fn(() => 600) },
      clientHeight: { configurable: true, get: vi.fn(() => 300) },
    });
    log.scrollTop = 80;

    await wrapper.get('[data-action="load-older"]').trigger("click");
    Object.defineProperty(log, "scrollHeight", {
      configurable: true,
      get: vi.fn(() => 840),
    });
    await wrapper.setProps({
      messages: [
        {
          ...messages[1]!,
          id: "message-0",
          ordinal: 0,
          content: { ...messages[1]!.content, text: "Earlier" },
        },
        ...messages,
      ],
      history: { loading: false, loadingOlder: false, hasOlder: false },
    });
    await flushPromises();

    expect(log.scrollTop).toBe(320);
    expect(wrapper.emitted("load-older")).toHaveLength(1);
  });

  it("positions an asynchronously loaded conversation at the latest message", async () => {
    const wrapper = mountSurface({
      messages: [],
      history: { loading: true, loadingOlder: false, hasOlder: false },
    });
    const log = wrapper.get('[role="log"]').element as HTMLElement;
    const scrollTo = vi.fn();
    Object.defineProperties(log, {
      scrollHeight: { configurable: true, value: 960 },
      scrollTo: { configurable: true, value: scrollTo },
    });
    scrollTo.mockClear();

    await wrapper.setProps({
      messages,
      history: { loading: false, loadingOlder: false, hasOlder: true },
    });
    await flushPromises();

    expect(scrollTo).toHaveBeenCalledWith({ top: 960, behavior: "auto" });
  });

  it("opens asynchronously loaded history at first unread instead of latest", async () => {
    const wrapper = mountSurface({
      messages: [],
      history: {
        loading: true,
        loadingOlder: false,
        hasOlder: true,
        firstUnreadOrdinal: 2,
      },
    });
    const log = wrapper.get('[role="log"]').element as HTMLElement;
    const scrollTo = vi.fn();
    Object.defineProperties(log, {
      scrollHeight: { configurable: true, value: 960 },
      scrollTo: { configurable: true, value: scrollTo },
    });
    await flushPromises();
    scrollTo.mockClear();

    await wrapper.setProps({
      messages,
      history: {
        loading: false,
        loadingOlder: false,
        hasOlder: true,
        firstUnreadOrdinal: 2,
      },
    });
    const unread = wrapper.get('[data-message-ordinal="2"]').element;
    vi.spyOn(log, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 300,
      height: 300,
      left: 0,
      right: 600,
      width: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(unread, "getBoundingClientRect").mockReturnValue({
      top: 180,
      bottom: 260,
      height: 80,
      left: 300,
      right: 600,
      width: 300,
      x: 300,
      y: 180,
      toJSON: () => ({}),
    });
    await flushPromises();

    expect(log.scrollTop).toBe(164);
    expect(scrollTo).not.toHaveBeenCalledWith({ top: 960, behavior: "auto" });
  });

  it("shows a new-message pill without moving an operator who is reading history", async () => {
    const wrapper = mountSurface();
    const log = wrapper.get('[role="log"]').element as HTMLElement;
    const scrollTo = vi.fn();
    Object.defineProperties(log, {
      scrollHeight: { configurable: true, value: 900 },
      clientHeight: { configurable: true, value: 300 },
      scrollTo: { configurable: true, value: scrollTo },
    });
    log.scrollTop = 120;
    await flushPromises();
    scrollTo.mockClear();

    await wrapper.setProps({
      messages: [
        ...messages,
        {
          ...messages[0]!,
          id: "message-3",
          ordinal: 3,
          content: { ...messages[0]!.content, text: "A new answer" },
        },
      ],
    });
    await flushPromises();

    expect(log.scrollTop).toBe(120);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(wrapper.get(".conversation-surface__new-messages").text()).toContain(
      "1 новое сообщение",
    );
  });

  it("does not expose renderer or composer replacement slots", () => {
    const wrapper = mountSurface(
      { title: "Диалог" },
      {
        message: '<div data-testid="foreign-renderer">foreign</div>',
        composer: '<div data-testid="foreign-composer">foreign</div>',
      },
    );

    expect(wrapper.find('[data-testid="foreign-renderer"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="foreign-composer"]').exists()).toBe(
      false,
    );
  });

  it("does not mount the composer action when its typed capability is hidden", () => {
    const wrapper = mountSurface({
      composer: {
        ...composer(),
        visibility: "HIDDEN",
        sendCapability: {
          kind: "BLOCKED",
          reason: "Ответ недоступен для вашей роли.",
        },
      },
    });

    expect(wrapper.find("textarea").exists()).toBe(false);
    expect(wrapper.text()).toContain("Ответ недоступен для вашей роли.");
  });
});
