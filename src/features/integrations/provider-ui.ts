import type {
  CreateAmplitudeConnectionDto,
  CreateAmplitudeOutboundRouteDto,
  IntegrationConnectionResponseDto,
  IntegrationEventRouteResponseDto,
  RotateAmplitudeCredentialDto,
  UpdateAmplitudeConnectionDto,
} from "@/shared/api/generated/models";
import {
  integrationConnectionsApi,
  type CreateCustomerIoConnectionDto,
  type RotateCustomerIoCredentialDto,
} from "@/features/integration-connections/integration-connections.api";
import { integrationEventRoutesApi } from "@/features/integration-event-routes/integration-event-routes.api";

export type OutboundIntegrationProvider = "AMPLITUDE" | "CUSTOMER_IO";
export type ProviderConnection = Omit<
  IntegrationConnectionResponseDto,
  "provider" | "credential"
> & {
  provider: OutboundIntegrationProvider;
  credential: NonNullable<IntegrationConnectionResponseDto["credential"]>;
};
export type ProviderRoute = IntegrationEventRouteResponseDto;
export type ProviderCreateConnectionInput =
  CreateAmplitudeConnectionDto | CreateCustomerIoConnectionDto;
export type ProviderRotateCredentialInput =
  RotateAmplitudeCredentialDto | RotateCustomerIoCredentialDto;

type CreateDraft = {
  displayName: string;
  region: "US" | "EU";
  remoteProjectLabel?: string;
  secret: string;
};

export type OutboundProviderUi = {
  id: OutboundIntegrationProvider;
  slug: "amplitude" | "customer-io";
  title: string;
  mark: string;
  formNamePrefix: "amplitude" | "customerIo";
  defaultDisplayName: string;
  credentialName: "projectApiKey" | "sourceApiKey";
  credentialLabel: string;
  credentialShortLabel: string;
  credentialHelp: string;
  testSideEffectConfirmation: string;
  credentialAutocomplete: string;
  credentialMaxLength: number;
  credentialPlaceholder: string;
  credentialValid: (value: string) => boolean;
  credentialInvalidCode: string;
  credentialRejectedCodes: ReadonlySet<string>;
  connectionLoadError: string;
  connectionMutationError: string;
  connectionUpdated: string;
  connectionTestSucceeded: string;
  connectionTestRejected: string;
  connectionTestCredentialRejected: string;
  activationConfirmation: string | null;
  deliveredStatusLabel: string;
  rotatedAndTested: string;
  enabled: string;
  disabled: string;
  eventNameLabel: string;
  routeLoadError: string;
  reservedTargetKeys: ReadonlySet<string>;
  createInput: (draft: CreateDraft) => ProviderCreateConnectionInput;
  rotateInput: (
    expectedVersion: number,
    secret: string,
  ) => ProviderRotateCredentialInput;
  withCreateCredential: (
    input: ProviderCreateConnectionInput,
    secret: string,
  ) => ProviderCreateConnectionInput;
  withRotateCredential: (
    input: ProviderRotateCredentialInput,
    secret: string,
  ) => ProviderRotateCredentialInput;
  createConnection: (
    projectId: string,
    input: ProviderCreateConnectionInput,
    idempotencyKey: string,
  ) => Promise<ProviderConnection>;
  updateConnection: (
    projectId: string,
    connectionId: string,
    input: UpdateAmplitudeConnectionDto,
    idempotencyKey: string,
  ) => Promise<ProviderConnection>;
  rotateCredential: (
    projectId: string,
    connectionId: string,
    input: ProviderRotateCredentialInput,
    idempotencyKey: string,
  ) => Promise<ProviderConnection>;
  createRoute: (
    projectId: string,
    input: CreateAmplitudeOutboundRouteDto,
    idempotencyKey: string,
  ) => Promise<ProviderRoute>;
};

const amplitudeReservedTargetKeys = new Set([
  "user_id",
  "device_id",
  "event_type",
  "event_properties",
  "time",
  "insert_id",
]);

const customerIoReservedTargetKeys = new Set([
  "type",
  "userId",
  "anonymousId",
  "event",
  "timestamp",
  "messageId",
  "integrations",
  "lola_export",
]);

export const integrationRegionOptions = [
  { label: "Европейский союз (EU)", value: "EU" },
  { label: "США (US)", value: "US" },
];

export const outboundProviderUi: Record<
  OutboundIntegrationProvider,
  OutboundProviderUi
> = {
  AMPLITUDE: {
    id: "AMPLITUDE",
    slug: "amplitude",
    title: "Amplitude",
    mark: "A",
    formNamePrefix: "amplitude",
    defaultDisplayName: "Основная Amplitude",
    credentialName: "projectApiKey",
    credentialLabel: "Amplitude Project API Key",
    credentialShortLabel: "Project API Key",
    credentialHelp:
      "Проверка отправляет реальное событие Lola Connection Test — оно появится в Amplitude. Ключ не возвращается API.",
    testSideEffectConfirmation:
      "Проверка отправит реальное служебное событие в Amplitude. Продолжить?",
    credentialAutocomplete: "off",
    credentialMaxLength: 32,
    credentialPlaceholder: "32 шестнадцатеричных символа",
    credentialValid: (value) => /^[a-f0-9]{32}$/iu.test(value),
    credentialInvalidCode: "AMPLITUDE_PROJECT_API_KEY_INVALID",
    credentialRejectedCodes: new Set(["AMPLITUDE_PROJECT_API_KEY_REJECTED"]),
    connectionLoadError: "Не удалось загрузить подключения Amplitude.",
    connectionMutationError:
      "Не удалось изменить подключение Amplitude. Повторите попытку.",
    connectionUpdated: "Настройки Amplitude обновлены.",
    connectionTestSucceeded:
      "Amplitude приняла тестовое событие. Подключение можно активировать.",
    connectionTestRejected: "Amplitude отклонила проверку подключения.",
    connectionTestCredentialRejected:
      "Amplitude отклонила Project API Key. Проверьте ключ и регион.",
    activationConfirmation: null,
    deliveredStatusLabel: "Доставлено",
    rotatedAndTested: "Новый Project API Key сохранён и проверен.",
    enabled: "Отправка событий в Amplitude включена.",
    disabled: "Отправка событий в Amplitude приостановлена.",
    eventNameLabel: "Название события в Amplitude",
    routeLoadError: "Не удалось загрузить маршруты Amplitude.",
    reservedTargetKeys: amplitudeReservedTargetKeys,
    createInput: ({ secret, ...metadata }) => ({
      ...metadata,
      projectApiKey: secret,
    }),
    rotateInput: (expectedVersion, secret) => ({
      expectedVersion,
      projectApiKey: secret,
    }),
    withCreateCredential: (input, secret) => ({
      ...(input as CreateAmplitudeConnectionDto),
      projectApiKey: secret,
    }),
    withRotateCredential: (input, secret) => ({
      ...(input as RotateAmplitudeCredentialDto),
      projectApiKey: secret,
    }),
    createConnection: (projectId, input, idempotencyKey) =>
      integrationConnectionsApi.createAmplitude(
        projectId,
        input as CreateAmplitudeConnectionDto,
        idempotencyKey,
      ) as Promise<ProviderConnection>,
    updateConnection: (projectId, connectionId, input, idempotencyKey) =>
      integrationConnectionsApi.updateAmplitude(
        projectId,
        connectionId,
        input,
        idempotencyKey,
      ) as Promise<ProviderConnection>,
    rotateCredential: (projectId, connectionId, input, idempotencyKey) =>
      integrationConnectionsApi.rotateAmplitude(
        projectId,
        connectionId,
        input as RotateAmplitudeCredentialDto,
        idempotencyKey,
      ) as Promise<ProviderConnection>,
    createRoute: (projectId, input, idempotencyKey) =>
      integrationEventRoutesApi.createAmplitude(
        projectId,
        input,
        idempotencyKey,
      ),
  },
  CUSTOMER_IO: {
    id: "CUSTOMER_IO",
    slug: "customer-io",
    title: "Customer.io",
    mark: "C",
    formNamePrefix: "customerIo",
    defaultDisplayName: "Основной Customer.io",
    credentialName: "sourceApiKey",
    credentialLabel: "Customer.io Pipelines Source API Key",
    credentialShortLabel: "Source API Key",
    credentialHelp:
      "Проверка отправляет реальное служебное событие и может создать профиль в Customer.io. Ключ не возвращается API.",
    testSideEffectConfirmation:
      "Проверка отправит реальное служебное событие и может создать профиль в Customer.io. Продолжить?",
    credentialAutocomplete: "off",
    credentialMaxLength: 512,
    credentialPlaceholder: "Ключ источника Pipelines",
    credentialValid: (value) => /^[^\s:]{8,512}$/u.test(value),
    credentialInvalidCode: "CUSTOMER_IO_SOURCE_API_KEY_INVALID",
    credentialRejectedCodes: new Set([
      "CUSTOMER_IO_DELIVERY_CREDENTIAL_REJECTED",
      "CUSTOMER_IO_DELIVERY_ACCESS_FORBIDDEN",
    ]),
    connectionLoadError: "Не удалось загрузить подключения Customer.io.",
    connectionMutationError:
      "Не удалось изменить подключение Customer.io. Повторите попытку.",
    connectionUpdated: "Настройки Customer.io обновлены.",
    connectionTestSucceeded:
      "Customer.io Pipelines принял тестовое событие. Перед активацией вручную подтвердите профиль и событие в нужном проекте Customer.io.",
    connectionTestRejected: "Customer.io отклонил проверку подключения.",
    connectionTestCredentialRejected:
      "Customer.io отклонил Source API Key. Проверьте ключ и регион.",
    activationConfirmation:
      "Вы вручную подтвердили служебный профиль и событие в нужном проекте Customer.io? Ответ Pipelines 200 подтверждает приём, но не выполнение действия в Journeys.",
    deliveredStatusLabel: "Принято Pipelines",
    rotatedAndTested: "Новый Source API Key сохранён и проверен.",
    enabled: "Отправка событий в Customer.io включена.",
    disabled: "Отправка событий в Customer.io приостановлена.",
    eventNameLabel: "Название события в Customer.io",
    routeLoadError: "Не удалось загрузить маршруты Customer.io.",
    reservedTargetKeys: customerIoReservedTargetKeys,
    createInput: ({ secret, ...metadata }) => ({
      ...metadata,
      sourceApiKey: secret,
    }),
    rotateInput: (expectedVersion, secret) => ({
      expectedVersion,
      sourceApiKey: secret,
    }),
    withCreateCredential: (input, secret) => ({
      ...(input as CreateCustomerIoConnectionDto),
      sourceApiKey: secret,
    }),
    withRotateCredential: (input, secret) => ({
      ...(input as RotateCustomerIoCredentialDto),
      sourceApiKey: secret,
    }),
    createConnection: (projectId, input, idempotencyKey) =>
      integrationConnectionsApi.createCustomerIo(
        projectId,
        input as CreateCustomerIoConnectionDto,
        idempotencyKey,
      ) as Promise<ProviderConnection>,
    updateConnection: (projectId, connectionId, input, idempotencyKey) =>
      integrationConnectionsApi.updateCustomerIo(
        projectId,
        connectionId,
        input,
        idempotencyKey,
      ) as Promise<ProviderConnection>,
    rotateCredential: (projectId, connectionId, input, idempotencyKey) =>
      integrationConnectionsApi.rotateCustomerIo(
        projectId,
        connectionId,
        input as RotateCustomerIoCredentialDto,
        idempotencyKey,
      ) as Promise<ProviderConnection>,
    createRoute: (projectId, input, idempotencyKey) =>
      integrationEventRoutesApi.createCustomerIo(
        projectId,
        input,
        idempotencyKey,
      ),
  },
};
