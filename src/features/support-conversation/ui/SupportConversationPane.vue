<script setup lang="ts">
import { computed } from 'vue';
import type { RequestedMessageTranslation } from '@/features/conversation-translation/model/translation-presentation';
import type {
  ConversationSurfaceAttachmentDownloadRequest,
  ConversationSurfaceComposer,
  ConversationSurfaceComposerAction,
  ConversationSurfaceAISuspensionCapability,
  ConversationSurfaceCollaboration,
  ConversationSurfaceHistory,
  ConversationSurfaceInternalNotes,
  ConversationSurfaceReconcileIssue,
  ConversationSurfaceSendRequest,
  ConversationSurfaceTranslation,
} from '@/features/conversation-surface/model/conversation-surface-contract';
import ConversationSurface from '@/features/conversation-surface/ui/ConversationSurface.vue';
import type { ConversationMessage } from '@/shared/types/domain';
import type { SupportMessageDeliveryAction } from '@/features/conversation-delivery/model/use-support-message-delivery';
import { adaptSupportConversationMessages } from '../model/support-conversation-surface-adapter';

const props = defineProps<{
  title: string;
  messages: ConversationMessage[];
  translations: ReadonlyMap<string, RequestedMessageTranslation>;
  assistantLabel: string;
  history: ConversationSurfaceHistory;
  translation: ConversationSurfaceTranslation;
  composer: ConversationSurfaceComposer;
  aiSuspension?: ConversationSurfaceAISuspensionCapability;
  collaboration?: ConversationSurfaceCollaboration;
  deliveryActions?: ReadonlyMap<string, SupportMessageDeliveryAction>;
  internalNotes?: ConversationSurfaceInternalNotes;
  canDownloadPublicAttachments?: boolean;
}>();

const emit = defineEmits<{
  'load-older': [];
  'load-newer': [];
  'visible-high-water': [ordinal: number];
  'cancel-translation': [];
  'change-translation-mode': [mode: 'ORIGINAL' | 'TRANSLATED'];
  'reconcile-required': [issues: ConversationSurfaceReconcileIssue[]];
  'draft-change': [request: ConversationSurfaceSendRequest];
  send: [request: ConversationSurfaceSendRequest];
  'request-reply-translation': [];
  'reconcile-reply-translation': [];
  'retry-reply-translation': [];
  'save-reply-translation': [text: string];
  'send-reply-translation': [request: ConversationSurfaceSendRequest];
  'check-send-outcome': [];
  'discard-send-attempt': [];
  'change-composer-mode': [mode: 'PUBLIC_REPLY' | 'INTERNAL_NOTE'];
  'composer-action': [action: ConversationSurfaceComposerAction];
  'start-ai-suspension': [];
  'show-ai-suspension-history': [];
  'retry-ai-suspension': [];
  'retry-delivery': [messageId: string];
  'open-internal-notes': [];
  'add-attachments': [files: File[]];
  'remove-attachment': [localId: string];
  'retry-attachment': [localId: string];
  'download-attachment': [request: ConversationSurfaceAttachmentDownloadRequest];
}>();

const surfaceMessages = computed(() =>
  adaptSupportConversationMessages(props.messages, props.translations, {
    assistantLabel: props.assistantLabel,
    deliveryActions: props.deliveryActions,
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
    :collaboration="collaboration"
    :internal-notes="internalNotes"
    :can-download-public-attachments="canDownloadPublicAttachments"
    @load-older="emit('load-older')"
    @load-newer="emit('load-newer')"
    @visible-high-water="emit('visible-high-water', $event)"
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
    @change-composer-mode="emit('change-composer-mode', $event)"
    @composer-action="emit('composer-action', $event)"
    @start-ai-suspension="emit('start-ai-suspension')"
    @show-ai-suspension-history="emit('show-ai-suspension-history')"
    @retry-ai-suspension="emit('retry-ai-suspension')"
    @retry-delivery="emit('retry-delivery', $event)"
    @open-internal-notes="emit('open-internal-notes')"
    @add-attachments="emit('add-attachments', $event)"
    @remove-attachment="emit('remove-attachment', $event)"
    @retry-attachment="emit('retry-attachment', $event)"
    @download-attachment="emit('download-attachment', $event)"
  />
</template>
