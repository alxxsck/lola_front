import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { ConversationSurfaceComposer } from "@/features/conversation-surface/model/conversation-surface-contract";
import { runConversationSurfaceBehaviorSuite } from "@/features/conversation-surface/testing/conversation-surface-behavior-suite";
import ConversationSurface from "@/features/conversation-surface/ui/ConversationSurface.vue";
import type { ConversationMessage } from "@/shared/types/domain";
import SupportConversationPane from "./SupportConversationPane.vue";

const messages: ConversationMessage[] = [
  {
    id: "support-admin-message",
    conversationId: "conversation-1",
    ordinal: 2,
    author: "ADMIN",
    text: "Платёж проверен",
    status: "COMPLETED",
    delivery: {
      status: "READ",
      generation: 1,
      version: 2,
      errorCode: null,
      retryEligible: false,
      allowedActions: [],
      commandIds: ["command-1"],
    },
    createdAt: "2026-08-07T10:01:00.000Z",
  },
  {
    id: "support-user-message",
    conversationId: "conversation-1",
    ordinal: 1,
    author: "USER",
    text: "Can you check my payment?",
    status: "COMPLETED",
    createdAt: "2026-08-07T10:00:00.000Z",
  },
];

const translations = new Map([
  [
    "support-user-message",
    {
      state: "COMPLETED" as const,
      translatedText: "Платёж уже проверен?",
    },
  ],
]);

const composer: ConversationSurfaceComposer = {
  visibility: "ENABLED",
  mode: "PUBLIC_REPLY",
  scope: {
    projectId: "project-1",
    actorId: "operator-1",
    conversationId: "conversation-1",
  },
  initialDraft: "",
  draftRevision: "selection-1",
  sending: false,
  recipientStatus: null,
  actions: {
    attachment: { visibility: "DISABLED" },
    createTicket: { visibility: "HIDDEN" },
    internalNotes: { visibility: "ENABLED" },
    templates: { visibility: "ENABLED" },
    improveWithAI: { visibility: "DISABLED" },
    sendWithoutTranslation: { visibility: "HIDDEN" },
  },
  sendCapability: { kind: "SOURCE" },
  replyPreview: null,
  translationAssist: null,
};

const aiSuspension = {
  entry: {
    summary: {
      mode: "AUTOMATIC" as const,
      lifecycle: "NONE" as const,
      version: "0",
      suspendedUntil: null,
      serverTime: "2026-08-07T10:00:00.000Z",
    },
    endUserId: "user-1",
    loading: false,
    mutating: null,
    error: null,
    locallyExpired: false,
    cancellationRequested: false,
    serverOffsetMs: 0,
  },
  canManage: true,
  conversationOpen: true,
  showHistory: true,
};

function mountPane() {
  return mount(SupportConversationPane, {
    props: {
      title: "Проверка платежа",
      messages,
      translations,
      assistantLabel: "Lola",
      history: { loading: false, loadingOlder: false, hasOlder: true },
      translation: {
        available: true,
        mode: "ORIGINAL",
        changing: false,
        workingLocaleLabel: "RU",
        loading: false,
        progress: null,
      },
      composer,
      aiSuspension,
    },
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
  name: "Support adapter",
  mount: () => mountPane(),
  expectedMessageIds: ["support-user-message", "support-admin-message"],
  translationAvailable: true,
  translatedText: "Платёж уже проверен?",
  translation: {
    available: true,
    mode: "ORIGINAL",
    changing: false,
    workingLocaleLabel: "RU",
    loading: false,
    progress: null,
  },
  composer,
  alternateComposer: {
    ...composer,
    scope: { ...composer.scope, conversationId: "conversation-2" },
    draftRevision: "selection-2",
  },
  messagesWithGap: messages.map((message) =>
    message.id === "support-admin-message"
      ? { ...message, ordinal: 3 }
      : message,
  ),
});

describe("SupportConversationPane", () => {
  it("renders one canonical Surface without Support-owned chat markup", () => {
    const wrapper = mountPane();

    expect(wrapper.findAllComponents(ConversationSurface)).toHaveLength(1);
    expect(wrapper.find(".message-log").exists()).toBe(false);
    expect(wrapper.find(".message").exists()).toBe(false);
    expect(wrapper.find(".message-view-toggle").exists()).toBe(false);
    expect(wrapper.find(".support-reply-composer").exists()).toBe(false);
    expect(wrapper.text()).toContain("Прочитано");
  });

  it("forwards typed Surface capabilities without owning message state", async () => {
    const wrapper = mountPane();
    const surface = wrapper.getComponent(ConversationSurface);

    surface.vm.$emit("load-older");
    surface.vm.$emit("change-translation-mode", "TRANSLATED");
    surface.vm.$emit("draft-change", {
      scopeKey: "project-1:operator-1:conversation-1:PUBLIC_REPLY",
      mode: "PUBLIC_REPLY",
      text: "Проверю платёж",
    });
    surface.vm.$emit("send", {
      scopeKey: "project-1:operator-1:conversation-1:PUBLIC_REPLY",
      mode: "PUBLIC_REPLY",
      text: "Проверю платёж",
    });
    surface.vm.$emit("send-reply-translation", {
      scopeKey: "project-1:operator-1:conversation-1:PUBLIC_REPLY",
      mode: "PUBLIC_REPLY",
      text: "I will check the payment",
    });
    surface.vm.$emit("composer-action", "INTERNAL_NOTES");
    surface.vm.$emit("start-ai-suspension");
    surface.vm.$emit("show-ai-suspension-history");
    surface.vm.$emit("retry-ai-suspension");
    surface.vm.$emit("retry-delivery", "support-admin-message");
    surface.vm.$emit("reconcile-required", [
      { kind: "ORDINAL_GAP", afterOrdinal: 1, beforeOrdinal: 3 },
    ]);

    expect(wrapper.emitted("load-older")).toHaveLength(1);
    expect(wrapper.emitted("change-translation-mode")?.[0]).toEqual([
      "TRANSLATED",
    ]);
    expect(wrapper.emitted("draft-change")?.[0]?.[0]).toMatchObject({
      text: "Проверю платёж",
      mode: "PUBLIC_REPLY",
    });
    expect(wrapper.emitted("send")?.[0]?.[0]).toMatchObject({
      text: "Проверю платёж",
      mode: "PUBLIC_REPLY",
    });
    expect(wrapper.emitted("send-reply-translation")?.[0]?.[0]).toMatchObject({
      text: "I will check the payment",
      mode: "PUBLIC_REPLY",
    });
    expect(wrapper.emitted("composer-action")?.[0]).toEqual(["INTERNAL_NOTES"]);
    expect(wrapper.emitted("start-ai-suspension")).toHaveLength(1);
    expect(wrapper.emitted("show-ai-suspension-history")).toHaveLength(1);
    expect(wrapper.emitted("retry-ai-suspension")).toHaveLength(1);
    expect(wrapper.emitted("retry-delivery")?.[0]).toEqual([
      "support-admin-message",
    ]);
    expect(wrapper.emitted("reconcile-required")?.[0]?.[0]).toEqual([
      { kind: "ORDINAL_GAP", afterOrdinal: 1, beforeOrdinal: 3 },
    ]);
  });
});
