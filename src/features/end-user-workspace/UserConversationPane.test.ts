import { mount } from '@vue/test-utils';
import type {
  ConversationSurfaceComposer,
  ConversationSurfaceTranslation,
} from '@/features/conversation-surface/model/conversation-surface-contract';
import { runConversationSurfaceBehaviorSuite } from '@/features/conversation-surface/testing/conversation-surface-behavior-suite';
import type { ConversationMessage } from '@/shared/types/domain';
import UserConversationPane from './UserConversationPane.vue';

const messages: ConversationMessage[] = [
  {
    id: 'user-message',
    conversationId: 'conversation-1',
    ordinal: 1,
    author: 'USER',
    text: 'Can you check my payment?',
    status: 'COMPLETED',
    createdAt: '2026-08-07T10:00:00.000Z',
  },
  {
    id: 'operator-message',
    conversationId: 'conversation-1',
    ordinal: 2,
    author: 'ADMIN',
    text: 'Платёж проверен',
    status: 'COMPLETED',
    createdAt: '2026-08-07T10:01:00.000Z',
  },
];

const translations = new Map([
  [
    'user-message',
    {
      state: 'COMPLETED' as const,
      translatedText: 'Платёж уже проверен?',
    },
  ],
]);

const translation: ConversationSurfaceTranslation = {
  available: true,
  mode: 'ORIGINAL',
  changing: false,
  workingLocaleLabel: 'RU',
  loading: false,
  progress: null,
};

const composer: Extract<ConversationSurfaceComposer, { mode: 'PUBLIC_REPLY' }> = {
  visibility: 'ENABLED',
  mode: 'PUBLIC_REPLY',
  scope: {
    projectId: 'project-1',
    actorId: 'operator-1',
    conversationId: 'conversation-1',
  },
  initialDraft: '',
  draftRevision: 'selection-1',
  sending: false,
  recipientStatus: null,
  actions: {
    attachment: { visibility: 'ENABLED' },
    createTicket: { visibility: 'ENABLED' },
    templates: { visibility: 'ENABLED' },
    improveWithAI: { visibility: 'DISABLED' },
    sendWithoutTranslation: { visibility: 'HIDDEN' },
  },
  sendCapability: { kind: 'SOURCE' },
  replyPreview: null,
  translationAssist: null,
};

function mountPane() {
  return mount(UserConversationPane, {
    props: {
      title: 'Проверка платежа',
      messages,
      translations,
      history: { loading: false, loadingOlder: false, hasOlder: true },
      translation,
      composer,
    },
    global: {
      stubs: {
        Button: {
          props: ['label', 'disabled', 'loading'],
          emits: ['click'],
          template:
            '<button type="button" :disabled="disabled" :aria-busy="String(Boolean(loading))" @click="$emit(\'click\')">{{ label }}<slot /></button>',
        },
        Textarea: {
          props: ['modelValue', 'disabled', 'placeholder', 'ariaLabel'],
          emits: ['update:modelValue', 'keydown'],
          template:
            '<textarea :value="modelValue" :disabled="disabled" :placeholder="placeholder" :aria-label="ariaLabel" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown="$emit(\'keydown\', $event)" />',
        },
      },
    },
  });
}

runConversationSurfaceBehaviorSuite({
  name: 'Users adapter',
  mount: () => mountPane(),
  expectedMessageIds: ['user-message', 'operator-message'],
  translationAvailable: true,
  translatedText: 'Платёж уже проверен?',
  translation,
  composer,
  alternateComposer: {
    ...composer,
    scope: { ...composer.scope, conversationId: 'conversation-2' },
    draftRevision: 'selection-2',
  },
  messagesWithGap: messages.map((message) =>
    message.id === 'operator-message' ? { ...message, ordinal: 3 } : message,
  ),
});
