<script setup lang="ts">
import { computed } from "vue";
import type { RequestedMessageTranslation } from "@/features/conversation-translation/model/translation-presentation";
import type {
  ConversationSurfaceComposer,
  ConversationSurfaceComposerAction,
  ConversationSurfaceHistory,
  ConversationSurfaceReconcileIssue,
  ConversationSurfaceSendRequest,
  ConversationSurfaceTranslation,
} from "@/features/conversation-surface/model/conversation-surface-contract";
import ConversationSurface from "@/features/conversation-surface/ui/ConversationSurface.vue";
import type { ConversationMessage } from "@/shared/types/domain";
import { adaptUsersConversationMessages } from "./model/user-conversation-surface-adapter";

const props = defineProps<{
  title: string;
  messages: ConversationMessage[];
  translations: ReadonlyMap<string, RequestedMessageTranslation>;
  history: ConversationSurfaceHistory;
  translation: ConversationSurfaceTranslation;
  composer: ConversationSurfaceComposer;
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
  "composer-action": [action: ConversationSurfaceComposerAction];
}>();

const surfaceMessages = computed(() =>
  adaptUsersConversationMessages(props.messages, props.translations),
);
</script>

<template>
  <ConversationSurface
    class="user-conversation-surface"
    :title="title"
    :messages="surfaceMessages"
    :history="history"
    :translation="translation"
    :composer="composer"
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
    @composer-action="emit('composer-action', $event)"
  />
</template>
