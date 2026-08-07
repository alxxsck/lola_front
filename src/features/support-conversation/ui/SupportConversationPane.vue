<script setup lang="ts">
import { computed } from "vue";
import type { RequestedMessageTranslation } from "@/features/conversation-translation/model/translation-presentation";
import type {
  ConversationSurfaceComposer,
  ConversationSurfaceComposerAction,
  ConversationSurfaceAISuspensionCapability,
  ConversationSurfaceHistory,
  ConversationSurfaceReconcileIssue,
  ConversationSurfaceSendRequest,
  ConversationSurfaceTranslation,
} from "@/features/conversation-surface/model/conversation-surface-contract";
import ConversationSurface from "@/features/conversation-surface/ui/ConversationSurface.vue";
import type { ConversationMessage } from "@/shared/types/domain";
import { adaptSupportConversationMessages } from "../model/support-conversation-surface-adapter";

const props = defineProps<{
  title: string;
  messages: ConversationMessage[];
  translations: ReadonlyMap<string, RequestedMessageTranslation>;
  assistantLabel: string;
  history: ConversationSurfaceHistory;
  translation: ConversationSurfaceTranslation;
  composer: ConversationSurfaceComposer;
  aiSuspension?: ConversationSurfaceAISuspensionCapability;
}>();

const emit = defineEmits<{
  "load-older": [];
  "cancel-translation": [];
  "change-translation-mode": [mode: "ORIGINAL" | "TRANSLATED"];
  "reconcile-required": [issues: ConversationSurfaceReconcileIssue[]];
  "draft-change": [request: ConversationSurfaceSendRequest];
  send: [request: ConversationSurfaceSendRequest];
  "request-reply-translation": [];
  "reconcile-reply-translation": [];
  "retry-reply-translation": [];
  "save-reply-translation": [text: string];
  "send-reply-translation": [request: ConversationSurfaceSendRequest];
  "check-send-outcome": [];
  "discard-send-attempt": [];
  "composer-action": [action: ConversationSurfaceComposerAction];
  "start-ai-suspension": [];
  "show-ai-suspension-history": [];
  "retry-ai-suspension": [];
}>();

const surfaceMessages = computed(() =>
  adaptSupportConversationMessages(props.messages, props.translations, {
    assistantLabel: props.assistantLabel,
  }),
);
</script>

<template>
  <ConversationSurface
    class="support-conversation-pane"
    :title="title"
    :messages="surfaceMessages"
    :history="history"
    :translation="translation"
    :composer="composer"
    :ai-suspension="aiSuspension"
    @load-older="emit('load-older')"
    @cancel-translation="emit('cancel-translation')"
    @change-translation-mode="emit('change-translation-mode', $event)"
    @reconcile-required="emit('reconcile-required', $event)"
    @draft-change="emit('draft-change', $event)"
    @send="emit('send', $event)"
    @request-reply-translation="emit('request-reply-translation')"
    @reconcile-reply-translation="emit('reconcile-reply-translation')"
    @retry-reply-translation="emit('retry-reply-translation')"
    @save-reply-translation="emit('save-reply-translation', $event)"
    @send-reply-translation="emit('send-reply-translation', $event)"
    @check-send-outcome="emit('check-send-outcome')"
    @discard-send-attempt="emit('discard-send-attempt')"
    @composer-action="emit('composer-action', $event)"
    @start-ai-suspension="emit('start-ai-suspension')"
    @show-ai-suspension-history="emit('show-ai-suspension-history')"
    @retry-ai-suspension="emit('retry-ai-suspension')"
  />
</template>
