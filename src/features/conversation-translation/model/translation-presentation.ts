export interface TranslatedMessageContent {
  text: string;
  status: 'PENDING' | 'WRITING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  translation?: {
    direction: 'INBOUND' | 'OUTBOUND';
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    originalText: string;
    translatedText: string | null;
    deliveredText: string | null;
    viewText: string;
    targetLocale: string;
    warnings: string[];
  };
}

export interface RequestedMessageTranslation {
  state: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  translatedText?: string | null;
  skipReason?:
    'SAME_LANGUAGE' | 'EMPTY_OR_NOISE' | 'UNSUPPORTED_ROLE' | 'LANGUAGE_UNRESOLVED' | null;
}

export interface ReplyTranslationPreviewModel {
  status: 'PENDING' | 'RUNNING' | 'READY' | 'FAILED' | 'EXPIRED' | 'CONSUMED';
  targetLocale: string;
  translatedText?: string | null;
  editedTranslatedText?: string | null;
  warnings: string[];
  model?: string | null;
}
