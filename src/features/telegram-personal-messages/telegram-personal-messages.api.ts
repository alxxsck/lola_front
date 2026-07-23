import type { AxiosProgressEvent } from "axios";
import {
  telegramPersonalOutboundCreate,
  telegramPersonalOutboundGet,
  telegramPersonalOutboundList,
} from "@/shared/api/generated/lola-backend";
import type { TelegramPersonalOutboundCreateBody } from "@/shared/api/generated/models";
import type { TelegramPersonalDraft } from "./telegram-personal-message.model";
import type { TelegramPersonalMessagesApi } from "./use-telegram-personal-messages";

export const TELEGRAM_PERSONAL_UPLOAD_TIMEOUT_MS = 5 * 60 * 1_000;

export const telegramPersonalMessagesApi: TelegramPersonalMessagesApi = {
  list(projectId, endUserId, options) {
    return telegramPersonalOutboundList(
      projectId,
      endUserId,
      { limit: options.limit ?? 20, cursor: options.cursor },
      { signal: options.signal },
    );
  },

  create(
    projectId: string,
    endUserId: string,
    draft: TelegramPersonalDraft,
    idempotencyKey: string,
    options,
  ) {
    const body = {
      ...(draft.text ? { text: draft.text } : {}),
      ...(draft.file ? { file: draft.file } : {}),
    } as TelegramPersonalOutboundCreateBody;
    return telegramPersonalOutboundCreate(projectId, endUserId, body, {
      headers: { "Idempotency-Key": idempotencyKey },
      signal: options.signal,
      timeout: TELEGRAM_PERSONAL_UPLOAD_TIMEOUT_MS,
      onUploadProgress: (event: AxiosProgressEvent) => {
        if (event.total)
          options.onUploadProgress?.(
            Math.min(100, Math.round((event.loaded / event.total) * 100)),
          );
      },
    });
  },

  get(projectId, endUserId, messageId, options) {
    return telegramPersonalOutboundGet(projectId, endUserId, messageId, {
      signal: options.signal,
    });
  },
};
