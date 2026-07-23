import {
  notificationDestinationCreate,
  notificationDestinationCreateTelegram,
  notificationDestinationCreateTelegramBindingChallenge,
  notificationDestinationList,
  notificationDestinationTest,
  notificationDestinationTestTelegram,
  notificationDestinationUpdate,
  notificationDestinationUpdateTelegram,
} from "@/shared/api/generated/lola-backend";
import type {
  CreateSlackNotificationDestinationDto,
  CreateOperationalTelegramDestinationDto,
  UpdateOperationalTelegramDestinationDto,
  UpdateSlackNotificationDestinationDto,
} from "@/shared/api/generated/models";

const idempotencyOptions = (key: string) => ({
  headers: { "Idempotency-Key": key },
});

export const notificationDestinationsApi = {
  list(projectId: string) {
    return notificationDestinationList(projectId);
  },

  createSlack(
    projectId: string,
    input: CreateSlackNotificationDestinationDto,
    idempotencyKey: string = crypto.randomUUID(),
  ) {
    return notificationDestinationCreate(
      projectId,
      input,
      idempotencyOptions(idempotencyKey),
    );
  },

  updateSlack(
    projectId: string,
    destinationId: string,
    input: UpdateSlackNotificationDestinationDto,
  ) {
    return notificationDestinationUpdate(projectId, destinationId, input);
  },

  testSlack(
    projectId: string,
    destinationId: string,
    expectedVersion: number,
    idempotencyKey: string = crypto.randomUUID(),
  ) {
    return notificationDestinationTest(
      projectId,
      destinationId,
      { expectedVersion },
      idempotencyOptions(idempotencyKey),
    );
  },

  createOperationalTelegram(
    projectId: string,
    input: CreateOperationalTelegramDestinationDto,
    idempotencyKey: string = crypto.randomUUID(),
  ) {
    return notificationDestinationCreateTelegram(
      projectId,
      input,
      idempotencyOptions(idempotencyKey),
    );
  },

  updateOperationalTelegram(
    projectId: string,
    destinationId: string,
    input: UpdateOperationalTelegramDestinationDto,
  ) {
    return notificationDestinationUpdateTelegram(
      projectId,
      destinationId,
      input,
    );
  },

  createTelegramBindingChallenge(
    projectId: string,
    destinationId: string,
    expectedVersion: number,
  ) {
    return notificationDestinationCreateTelegramBindingChallenge(
      projectId,
      destinationId,
      {
        expectedVersion,
      },
    );
  },

  testOperationalTelegram(
    projectId: string,
    destinationId: string,
    expectedVersion: number,
    idempotencyKey: string = crypto.randomUUID(),
  ) {
    return notificationDestinationTestTelegram(
      projectId,
      destinationId,
      { expectedVersion },
      idempotencyOptions(idempotencyKey),
    );
  },
};
