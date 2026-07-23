import {
  telegramChannelAdminCreate,
  telegramChannelAdminDisable,
  telegramChannelAdminGet,
  telegramChannelAdminRotate,
  telegramChannelAdminSetBroadcastsEnabled,
  telegramChannelAdminTest,
  telegramLinkAdminGet,
} from "@/shared/api/generated/lola-backend";
import type {
  ConfigureTelegramChannelDto,
  DisableTelegramChannelDto,
  RotateTelegramChannelDto,
  TestTelegramChannelDto,
  SetTelegramBroadcastsEnabledDto,
} from "@/shared/api/generated/models";

const idempotencyOptions = (key: string) => ({
  headers: { "Idempotency-Key": key },
});

export const telegramProductInstallationsApi = {
  get(projectId: string) {
    return telegramChannelAdminGet(projectId);
  },

  create(
    projectId: string,
    input: ConfigureTelegramChannelDto,
    idempotencyKey: string,
  ) {
    return telegramChannelAdminCreate(
      projectId,
      input,
      idempotencyOptions(idempotencyKey),
    );
  },

  rotate(projectId: string, input: RotateTelegramChannelDto) {
    return telegramChannelAdminRotate(projectId, input);
  },

  disable(projectId: string, input: DisableTelegramChannelDto) {
    return telegramChannelAdminDisable(projectId, input);
  },

  test(
    projectId: string,
    installationId: string,
    input: TestTelegramChannelDto,
    idempotencyKey: string,
  ) {
    return telegramChannelAdminTest(
      projectId,
      installationId,
      input,
      idempotencyOptions(idempotencyKey),
    );
  },

  setBroadcastsEnabled(
    projectId: string,
    input: SetTelegramBroadcastsEnabledDto,
    idempotencyKey: string,
  ) {
    return telegramChannelAdminSetBroadcastsEnabled(
      projectId,
      input,
      idempotencyOptions(idempotencyKey),
    );
  },

  getEndUserSummary(projectId: string, endUserId: string) {
    return telegramLinkAdminGet(projectId, endUserId);
  },
};
