<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import type {
  IntegrationConnectionResponseDto,
  IntegrationConnectionTestResponseDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { integrationConnectionsApi } from "./integration-connections.api";
import {
  outboundProviderUi,
  type OutboundIntegrationProvider,
  type ProviderConnection,
  type ProviderCreateConnectionInput,
  type ProviderRotateCredentialInput,
} from "@/features/integrations/provider-ui";

const props = withDefaults(
  defineProps<{
    projectId: string;
    canRead: boolean;
    canManage: boolean;
    provider?: OutboundIntegrationProvider;
  }>(),
  { provider: "AMPLITUDE" },
);
const providerUi = computed(() => outboundProviderUi[props.provider]);

type Operation = { projectId: string; epoch: number };
type MetadataDraft = { displayName: string; remoteProjectLabel: string };
type SecretRetry<T> = { input: T; idempotencyKey: string };
type RequestingTestReceipt = {
  state: "REQUESTING";
  projectId: string;
  connectionId: string;
  credentialRevision: number;
  expectedVersion: number;
  idempotencyKey: string;
};
type PollingTestReceipt = {
  state: "POLLING";
  projectId: string;
  connectionId: string;
  credentialRevision: number;
  testId: string;
};
type PendingTestReceipt = RequestingTestReceipt | PollingTestReceipt;
type UnresolvedSecretMarkerBase = {
  projectId: string;
  idempotencyKey: string;
  createdAt: string;
};
type UnresolvedSecretMarker =
  | (UnresolvedSecretMarkerBase & {
      operation: "CREATE";
      displayName: string;
      region: "US" | "EU";
      remoteProjectLabel?: string;
    })
  | (UnresolvedSecretMarkerBase & {
      operation: "ROTATE";
      connectionId: string;
      expectedVersion: number;
    });
const SAFE_ID_PATTERN = /^[a-z0-9-]{1,100}$/iu;

const connections = ref<ProviderConnection[]>([]);
const loading = ref(true);
const pendingConnectionId = ref<string | null>(null);
const creating = ref(false);
const loadError = ref("");
const actionError = ref("");
const success = ref("");
const displayName = ref(providerUi.value.defaultDisplayName);
const region = ref<"US" | "EU">("EU");
const remoteProjectLabel = ref("");
const credentialSecret = ref("");
const metadataDrafts = reactive<Record<string, MetadataDraft>>({});
const rotationKeys = reactive<Record<string, string>>({});
const pendingTests = reactive<Record<string, PendingTestReceipt>>({});
const commandKeys = new Map<string, string>();
const createRetry = ref<SecretRetry<ProviderCreateConnectionInput> | null>(
  null,
);
const rotateRetry = ref<
  | (SecretRetry<ProviderRotateCredentialInput> & {
      connectionId: string;
    })
  | null
>(null);
const unresolvedSecretMarker = ref<UnresolvedSecretMarker | null>(null);
let epoch = 0;
let disposed = false;
let loadRequest = 0;
const pollWaits = new Set<{ timer: number; resolve: () => void }>();

const hasConnections = computed(() => connections.value.length > 0);
const secretRetryPending = computed(
  () =>
    createRetry.value !== null ||
    rotateRetry.value !== null ||
    unresolvedSecretMarker.value !== null,
);

function beginOperation(): Operation | null {
  return props.projectId ? { projectId: props.projectId, epoch } : null;
}

function isCurrent(operation: Operation): boolean {
  return (
    !disposed &&
    props.canRead &&
    operation.epoch === epoch &&
    operation.projectId === props.projectId
  );
}

function clearFeedback(): void {
  actionError.value = "";
  success.value = "";
}

function resetSensitiveState(): void {
  credentialSecret.value = "";
  createRetry.value = null;
  rotateRetry.value = null;
  for (const key of Object.keys(rotationKeys)) delete rotationKeys[key];
}

function clearPendingTestsView(): void {
  for (const connectionId of Object.keys(pendingTests)) {
    delete pendingTests[connectionId];
  }
}

function pendingTestsStorageKey(projectId: string): string {
  return `lola:${providerUi.value.slug}-pending-tests:${projectId}`;
}

function unresolvedSecretStorageKey(projectId: string): string {
  return `lola:${providerUi.value.slug}-unresolved-secret:${projectId}`;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function persistPendingTests(projectId: string): void {
  const receipts = Object.values(pendingTests).filter(
    (receipt) => receipt.projectId === projectId,
  );
  try {
    if (receipts.length) {
      window.sessionStorage.setItem(
        pendingTestsStorageKey(projectId),
        JSON.stringify(receipts),
      );
    } else {
      window.sessionStorage.removeItem(pendingTestsStorageKey(projectId));
    }
  } catch {
    // Polling remains safe in memory when browser storage is unavailable.
  }
}

function restorePendingTests(projectId: string): void {
  clearPendingTestsView();
  try {
    const raw = window.sessionStorage.getItem(
      pendingTestsStorageKey(projectId),
    );
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return;
    for (const value of parsed.slice(0, 100)) {
      if (
        value &&
        typeof value === "object" &&
        "projectId" in value &&
        value.projectId === projectId &&
        "connectionId" in value &&
        typeof value.connectionId === "string" &&
        SAFE_ID_PATTERN.test(value.connectionId) &&
        "credentialRevision" in value &&
        isPositiveInteger(value.credentialRevision) &&
        "state" in value &&
        (value.state === "REQUESTING" || value.state === "POLLING")
      ) {
        if (
          value.state === "REQUESTING" &&
          "expectedVersion" in value &&
          isPositiveInteger(value.expectedVersion) &&
          "idempotencyKey" in value &&
          typeof value.idempotencyKey === "string" &&
          SAFE_ID_PATTERN.test(value.idempotencyKey)
        ) {
          pendingTests[value.connectionId] = {
            state: "REQUESTING",
            projectId,
            connectionId: value.connectionId,
            credentialRevision: value.credentialRevision,
            expectedVersion: value.expectedVersion,
            idempotencyKey: value.idempotencyKey,
          };
        } else if (
          value.state === "POLLING" &&
          "testId" in value &&
          typeof value.testId === "string" &&
          SAFE_ID_PATTERN.test(value.testId)
        ) {
          pendingTests[value.connectionId] = {
            state: "POLLING",
            projectId,
            connectionId: value.connectionId,
            credentialRevision: value.credentialRevision,
            testId: value.testId,
          };
        }
      }
    }
  } catch {
    try {
      window.sessionStorage.removeItem(pendingTestsStorageKey(projectId));
    } catch {
      // Ignore storage policies that also reject cleanup.
    }
  }
}

function rememberPendingTest(receipt: PendingTestReceipt): void {
  pendingTests[receipt.connectionId] = receipt;
  persistPendingTests(receipt.projectId);
}

function forgetPendingTest(receipt: PendingTestReceipt): void {
  const current = pendingTests[receipt.connectionId];
  const isSame =
    current?.state === receipt.state &&
    (current.state === "REQUESTING"
      ? current.idempotencyKey ===
        (receipt as RequestingTestReceipt).idempotencyKey
      : current.testId === (receipt as PollingTestReceipt).testId);
  if (isSame) {
    delete pendingTests[receipt.connectionId];
    persistPendingTests(receipt.projectId);
  }
}

function rememberUnresolvedSecret(marker: UnresolvedSecretMarker): void {
  unresolvedSecretMarker.value = marker;
  try {
    window.sessionStorage.setItem(
      unresolvedSecretStorageKey(marker.projectId),
      JSON.stringify(marker),
    );
  } catch {
    // The in-memory guard still prevents a second credential mutation.
  }
}

function restoreUnresolvedSecret(projectId: string): void {
  unresolvedSecretMarker.value = null;
  try {
    const raw = window.sessionStorage.getItem(
      unresolvedSecretStorageKey(projectId),
    );
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (
      value &&
      typeof value === "object" &&
      "projectId" in value &&
      value.projectId === projectId &&
      "operation" in value &&
      "idempotencyKey" in value &&
      typeof value.idempotencyKey === "string" &&
      SAFE_ID_PATTERN.test(value.idempotencyKey) &&
      "createdAt" in value &&
      typeof value.createdAt === "string" &&
      !Number.isNaN(Date.parse(value.createdAt))
    ) {
      if (
        value.operation === "CREATE" &&
        "displayName" in value &&
        typeof value.displayName === "string" &&
        value.displayName.length >= 1 &&
        value.displayName.length <= 120 &&
        "region" in value &&
        (value.region === "US" || value.region === "EU") &&
        (!("remoteProjectLabel" in value) ||
          (typeof value.remoteProjectLabel === "string" &&
            value.remoteProjectLabel.length <= 120))
      ) {
        const remoteProjectLabel =
          "remoteProjectLabel" in value &&
          typeof value.remoteProjectLabel === "string" &&
          value.remoteProjectLabel
            ? value.remoteProjectLabel
            : undefined;
        const marker: UnresolvedSecretMarker = {
          projectId,
          operation: "CREATE",
          idempotencyKey: value.idempotencyKey,
          createdAt: value.createdAt,
          displayName: value.displayName,
          region: value.region,
          ...(remoteProjectLabel ? { remoteProjectLabel } : {}),
        };
        unresolvedSecretMarker.value = marker;
        createRetry.value = {
          idempotencyKey: marker.idempotencyKey,
          input: providerUi.value.createInput({
            displayName: marker.displayName,
            region: marker.region,
            secret: "",
            ...(marker.remoteProjectLabel
              ? { remoteProjectLabel: marker.remoteProjectLabel }
              : {}),
          }),
        };
      } else if (
        value.operation === "ROTATE" &&
        "connectionId" in value &&
        typeof value.connectionId === "string" &&
        SAFE_ID_PATTERN.test(value.connectionId) &&
        "expectedVersion" in value &&
        isPositiveInteger(value.expectedVersion)
      ) {
        const marker: UnresolvedSecretMarker = {
          projectId,
          operation: "ROTATE",
          idempotencyKey: value.idempotencyKey,
          createdAt: value.createdAt,
          connectionId: value.connectionId,
          expectedVersion: value.expectedVersion,
        };
        unresolvedSecretMarker.value = marker;
        rotateRetry.value = {
          connectionId: marker.connectionId,
          idempotencyKey: marker.idempotencyKey,
          input: providerUi.value.rotateInput(marker.expectedVersion, ""),
        };
      }
    }
  } catch {
    // Invalid or unavailable storage is treated as an empty durable marker.
  }
}

function clearUnresolvedSecret(projectId: string): void {
  if (unresolvedSecretMarker.value?.projectId === projectId) {
    unresolvedSecretMarker.value = null;
  }
  try {
    window.sessionStorage.removeItem(unresolvedSecretStorageKey(projectId));
  } catch {
    // Ignore storage policies that reject cleanup.
  }
}

function commandKey(signature: string): string {
  const existing = commandKeys.get(signature);
  if (existing) return existing;
  const key = crypto.randomUUID();
  commandKeys.set(signature, key);
  return key;
}

function confirmCommand(signature: string): void {
  commandKeys.delete(signature);
}

function waitForPoll(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    const wait = {
      timer: window.setTimeout(() => {
        pollWaits.delete(wait);
        resolve();
      }, delayMs),
      resolve,
    };
    pollWaits.add(wait);
  });
}

function cancelPollWaits(): void {
  for (const wait of pollWaits) {
    window.clearTimeout(wait.timer);
    wait.resolve();
  }
  pollWaits.clear();
}

function terminalTest(test: IntegrationConnectionTestResponseDto): boolean {
  return ["SUCCEEDED", "FAILED", "OUTCOME_UNKNOWN", "CANCELLED"].includes(
    test.status,
  );
}

function initializeDraft(connection: ProviderConnection): void {
  metadataDrafts[connection.id] = {
    displayName: connection.displayName,
    remoteProjectLabel: connection.remoteProjectLabel ?? "",
  };
  rotationKeys[connection.id] = "";
}

function isOutboundConnection(
  connection: IntegrationConnectionResponseDto,
): connection is ProviderConnection {
  return (
    connection.provider === props.provider &&
    connection.outboundEnabled &&
    connection.credential !== null
  );
}

async function load(): Promise<boolean> {
  const request = ++loadRequest;
  const operation = beginOperation();
  if (!operation || !props.canRead) {
    if (request === loadRequest) {
      connections.value = [];
      loading.value = false;
      loadError.value = "";
    }
    return false;
  }
  loading.value = true;
  loadError.value = "";
  try {
    const response = await integrationConnectionsApi.list(operation.projectId);
    if (request !== loadRequest || !isCurrent(operation)) return false;
    connections.value = response.items.filter(
      (connection): connection is ProviderConnection =>
        connection.projectId === operation.projectId &&
        isOutboundConnection(connection),
    );
    for (const connection of connections.value) initializeDraft(connection);
    return true;
  } catch {
    if (request === loadRequest && isCurrent(operation)) {
      connections.value = [];
      loadError.value = providerUi.value.connectionLoadError;
    }
    return false;
  } finally {
    if (request === loadRequest && isCurrent(operation)) loading.value = false;
  }
}

async function awaitTest(
  operation: Operation,
  connection: ProviderConnection,
): Promise<IntegrationConnectionTestResponseDto | null> {
  let receipt: PendingTestReceipt | undefined = pendingTests[connection.id];
  if (
    receipt &&
    (receipt.projectId !== operation.projectId ||
      receipt.credentialRevision !== connection.credential.revision)
  ) {
    forgetPendingTest(receipt);
    receipt = undefined;
  }
  if (!receipt) {
    receipt = {
      state: "REQUESTING",
      projectId: operation.projectId,
      connectionId: connection.id,
      credentialRevision: connection.credential.revision,
      expectedVersion: connection.version,
      idempotencyKey: crypto.randomUUID(),
    };
    rememberPendingTest(receipt);
  }
  let test: IntegrationConnectionTestResponseDto;
  if (receipt.state === "POLLING") {
    try {
      test = await integrationConnectionsApi.getTest(
        operation.projectId,
        connection.id,
        receipt.testId,
      );
    } catch (cause) {
      if (normalizeApiError(cause).status === 404) forgetPendingTest(receipt);
      throw cause;
    }
  } else {
    try {
      test = await integrationConnectionsApi.requestTest(
        operation.projectId,
        connection.id,
        { expectedVersion: receipt.expectedVersion },
        receipt.idempotencyKey,
      );
    } catch (cause) {
      if (!isAmbiguous(cause)) forgetPendingTest(receipt);
      throw cause;
    }
    if (
      test.projectId !== operation.projectId ||
      test.connectionId !== connection.id ||
      test.credentialRevision !== receipt.credentialRevision
    ) {
      forgetPendingTest(receipt);
      throw new Error("Unexpected integration test identity");
    }
    receipt = {
      state: "POLLING",
      projectId: operation.projectId,
      connectionId: connection.id,
      credentialRevision: receipt.credentialRevision,
      testId: test.id,
    };
    rememberPendingTest(receipt);
  }
  if (
    test.projectId !== operation.projectId ||
    test.connectionId !== connection.id ||
    test.credentialRevision !== receipt.credentialRevision
  ) {
    forgetPendingTest(receipt);
    throw new Error("Unexpected integration test identity");
  }
  for (let attempt = 0; attempt < 20 && !terminalTest(test); attempt += 1) {
    await waitForPoll(500);
    if (!isCurrent(operation)) return null;
    test = await integrationConnectionsApi.getTest(
      operation.projectId,
      connection.id,
      test.id,
    );
    if (
      test.projectId !== operation.projectId ||
      test.connectionId !== connection.id ||
      test.credentialRevision !== receipt.credentialRevision
    ) {
      forgetPendingTest(receipt);
      throw new Error("Unexpected integration test identity");
    }
  }
  if (terminalTest(test) && receipt) forgetPendingTest(receipt);
  return isCurrent(operation) ? test : null;
}

function testMessage(test: IntegrationConnectionTestResponseDto): {
  message: string;
  error: boolean;
} {
  switch (test.status) {
    case "SUCCEEDED":
      return {
        message: providerUi.value.connectionTestSucceeded,
        error: false,
      };
    case "PENDING":
    case "PROCESSING":
    case "RETRY_WAIT":
      return {
        message: "Проверка продолжается в фоне. Обновите статус позже.",
        error: false,
      };
    case "OUTCOME_UNKNOWN":
      return {
        message:
          "Результат проверки не подтверждён. Не активируйте подключение и повторите тест.",
        error: true,
      };
    case "CANCELLED":
      return {
        message: "Проверка отменена. Запустите её ещё раз.",
        error: true,
      };
    case "FAILED":
      return {
        message:
          test.errorCode !== null &&
          providerUi.value.credentialRejectedCodes.has(test.errorCode)
            ? providerUi.value.connectionTestCredentialRejected
            : providerUi.value.connectionTestRejected,
        error: true,
      };
  }
}

async function testConnection(connection: ProviderConnection): Promise<void> {
  const operation = beginOperation();
  if (!operation || !props.canManage || pendingConnectionId.value) return;
  if (!window.confirm(providerUi.value.testSideEffectConfirmation)) return;
  clearFeedback();
  pendingConnectionId.value = connection.id;
  try {
    const result = await awaitTest(operation, connection);
    if (!result || !isCurrent(operation)) return;
    const feedback = testMessage(result);
    if (feedback.error) actionError.value = feedback.message;
    else success.value = feedback.message;
    await load();
  } catch (cause) {
    if (isCurrent(operation)) setActionFailure(cause);
  } finally {
    if (isCurrent(operation)) pendingConnectionId.value = null;
  }
}

async function performCreate(
  operation: Operation,
  retry: SecretRetry<ProviderCreateConnectionInput>,
): Promise<void> {
  try {
    const created = await providerUi.value.createConnection(
      operation.projectId,
      retry.input,
      retry.idempotencyKey,
    );
    if (!isCurrent(operation) || created.projectId !== operation.projectId)
      return;
    createRetry.value = null;
    clearUnresolvedSecret(operation.projectId);
    replaceConnection(created);
    const result = await awaitTest(operation, created);
    if (!result || !isCurrent(operation)) return;
    const feedback = testMessage(result);
    if (feedback.error) actionError.value = feedback.message;
    else success.value = feedback.message;
    await load();
  } catch (cause) {
    if (!isCurrent(operation)) return;
    if (!isAmbiguous(cause) && !isIdempotencyConflict(cause)) {
      createRetry.value = null;
      clearUnresolvedSecret(operation.projectId);
    } else if (createRetry.value) {
      createRetry.value = {
        ...createRetry.value,
        input: providerUi.value.withCreateCredential(
          createRetry.value.input,
          "",
        ),
      };
    }
    setActionFailure(cause, createRetry.value !== null);
  } finally {
    if (createRetry.value?.idempotencyKey === retry.idempotencyKey) {
      createRetry.value = {
        ...createRetry.value,
        input: providerUi.value.withCreateCredential(
          createRetry.value.input,
          "",
        ),
      };
    }
    if (isCurrent(operation)) creating.value = false;
  }
}

async function create(): Promise<void> {
  const operation = beginOperation();
  const key = credentialSecret.value.trim();
  const name = displayName.value.trim();
  if (
    !operation ||
    !props.canManage ||
    creating.value ||
    pendingConnectionId.value
  )
    return;
  if (secretRetryPending.value) {
    actionError.value =
      "Сначала повторите или отмените предыдущий неподтверждённый запрос с credential.";
    return;
  }
  if (!name || !providerUi.value.credentialValid(key)) {
    actionError.value = `Укажите название и корректный ${providerUi.value.credentialLabel}.`;
    return;
  }
  if (!window.confirm(providerUi.value.testSideEffectConfirmation)) return;
  clearFeedback();
  creating.value = true;
  const retry = {
    input: providerUi.value.createInput({
      displayName: name,
      region: region.value,
      secret: key,
      ...(remoteProjectLabel.value.trim()
        ? { remoteProjectLabel: remoteProjectLabel.value.trim() }
        : {}),
    }),
    idempotencyKey: crypto.randomUUID(),
  } satisfies SecretRetry<ProviderCreateConnectionInput>;
  createRetry.value = retry;
  rememberUnresolvedSecret({
    projectId: operation.projectId,
    operation: "CREATE",
    idempotencyKey: retry.idempotencyKey,
    createdAt: new Date().toISOString(),
    displayName: name,
    region: region.value,
    ...(remoteProjectLabel.value.trim()
      ? { remoteProjectLabel: remoteProjectLabel.value.trim() }
      : {}),
  });
  credentialSecret.value = "";
  await performCreate(operation, retry);
}

async function retryCreate(): Promise<void> {
  const operation = beginOperation();
  const retry = createRetry.value;
  if (!operation || !retry || creating.value || pendingConnectionId.value)
    return;
  const key = credentialSecret.value.trim();
  if (!providerUi.value.credentialValid(key)) {
    actionError.value = `Повторно укажите корректный ${providerUi.value.credentialLabel}.`;
    return;
  }
  const retryWithSecret = {
    ...retry,
    input: providerUi.value.withCreateCredential(retry.input, key),
  };
  createRetry.value = retryWithSecret;
  credentialSecret.value = "";
  clearFeedback();
  creating.value = true;
  await performCreate(operation, retryWithSecret);
}

async function reconcileUnresolvedSecret(): Promise<void> {
  const marker = unresolvedSecretMarker.value;
  if (!marker || marker.projectId !== props.projectId) return;
  clearFeedback();
  const reconciled = await load();
  if (!reconciled) {
    actionError.value =
      "Не удалось сверить подключения. Защита от повторной отправки credential сохранена.";
    return;
  }
  if (
    !window.confirm(
      "Сервер не может доказать итог предыдущего запроса. Он всё ещё мог выполниться после обновления списка. Снимая блокировку, вы принимаете риск повторного создания или ротации. Вы проверили результат вручную и хотите продолжить?",
    )
  ) {
    actionError.value =
      "Защита сохранена. Проверьте результат предыдущей операции перед новой отправкой credential.";
    return;
  }
  createRetry.value = null;
  rotateRetry.value = null;
  clearUnresolvedSecret(marker.projectId);
  success.value =
    "Администратор снял защиту после ручной проверки неизвестного результата.";
}

async function discardCreateRetry(): Promise<void> {
  await reconcileUnresolvedSecret();
}

async function updateMetadata(connection: ProviderConnection): Promise<void> {
  const operation = beginOperation();
  const draft = metadataDrafts[connection.id];
  if (!operation || !draft || !props.canManage || pendingConnectionId.value)
    return;
  const name = draft.displayName.trim();
  if (!name) {
    actionError.value = "Название подключения не может быть пустым.";
    return;
  }
  clearFeedback();
  pendingConnectionId.value = connection.id;
  const signature = `update:${connection.id}:${connection.version}:${name}:${draft.remoteProjectLabel.trim()}`;
  try {
    const updated = await providerUi.value.updateConnection(
      operation.projectId,
      connection.id,
      {
        expectedVersion: connection.version,
        displayName: name,
        ...(draft.remoteProjectLabel.trim()
          ? { remoteProjectLabel: draft.remoteProjectLabel.trim() }
          : {}),
      },
      commandKey(signature),
    );
    confirmCommand(signature);
    if (!isCurrent(operation) || updated.projectId !== operation.projectId)
      return;
    if (!isOutboundConnection(updated)) {
      actionError.value =
        "Backend не вернул безопасное outbound-подключение. Обновите список.";
      await load();
      return;
    }
    replaceConnection(updated);
    success.value = providerUi.value.connectionUpdated;
  } catch (cause) {
    if (isCurrent(operation)) setActionFailure(cause);
  } finally {
    if (isCurrent(operation)) pendingConnectionId.value = null;
  }
}

async function performRotate(
  operation: Operation,
  connection: ProviderConnection,
  retry: SecretRetry<ProviderRotateCredentialInput> & {
    connectionId: string;
  },
): Promise<void> {
  try {
    const rotated = await providerUi.value.rotateCredential(
      operation.projectId,
      connection.id,
      retry.input,
      retry.idempotencyKey,
    );
    if (!isCurrent(operation) || rotated.projectId !== operation.projectId)
      return;
    rotateRetry.value = null;
    clearUnresolvedSecret(operation.projectId);
    replaceConnection(rotated);
    const result = await awaitTest(operation, rotated);
    if (!result || !isCurrent(operation)) return;
    const feedback = testMessage(result);
    if (feedback.error) actionError.value = feedback.message;
    else success.value = providerUi.value.rotatedAndTested;
    await load();
  } catch (cause) {
    if (!isCurrent(operation)) return;
    if (!isAmbiguous(cause) && !isIdempotencyConflict(cause)) {
      rotateRetry.value = null;
      clearUnresolvedSecret(operation.projectId);
    } else if (rotateRetry.value) {
      rotateRetry.value = {
        ...rotateRetry.value,
        input: providerUi.value.withRotateCredential(
          rotateRetry.value.input,
          "",
        ),
      };
    }
    setActionFailure(cause, rotateRetry.value !== null);
  } finally {
    if (rotateRetry.value?.idempotencyKey === retry.idempotencyKey) {
      rotateRetry.value = {
        ...rotateRetry.value,
        input: providerUi.value.withRotateCredential(
          rotateRetry.value.input,
          "",
        ),
      };
    }
    if (isCurrent(operation)) pendingConnectionId.value = null;
  }
}

async function rotate(connection: ProviderConnection): Promise<void> {
  const operation = beginOperation();
  const key = rotationKeys[connection.id]?.trim() ?? "";
  if (!operation || !props.canManage || pendingConnectionId.value) return;
  if (secretRetryPending.value) {
    actionError.value =
      "Сначала повторите или отмените предыдущий неподтверждённый запрос с credential.";
    return;
  }
  if (!providerUi.value.credentialValid(key)) {
    actionError.value = `${providerUi.value.credentialLabel} имеет неверный формат.`;
    return;
  }
  if (
    !window.confirm(
      `Заменить ${providerUi.value.credentialShortLabel} для «${connection.displayName}»? ${providerUi.value.testSideEffectConfirmation}`,
    )
  )
    return;
  clearFeedback();
  pendingConnectionId.value = connection.id;
  const retry = {
    connectionId: connection.id,
    input: providerUi.value.rotateInput(connection.version, key),
    idempotencyKey: crypto.randomUUID(),
  } satisfies SecretRetry<ProviderRotateCredentialInput> & {
    connectionId: string;
  };
  rotateRetry.value = retry;
  rememberUnresolvedSecret({
    projectId: operation.projectId,
    operation: "ROTATE",
    connectionId: connection.id,
    idempotencyKey: retry.idempotencyKey,
    createdAt: new Date().toISOString(),
    expectedVersion: connection.version,
  });
  rotationKeys[connection.id] = "";
  await performRotate(operation, connection, retry);
}

async function retryRotate(connection: ProviderConnection): Promise<void> {
  const operation = beginOperation();
  const retry = rotateRetry.value;
  if (
    !operation ||
    !retry ||
    retry.connectionId !== connection.id ||
    pendingConnectionId.value
  )
    return;
  const key = rotationKeys[connection.id]?.trim() ?? "";
  if (!providerUi.value.credentialValid(key)) {
    actionError.value = `Повторно укажите корректный ${providerUi.value.credentialLabel}.`;
    return;
  }
  const retryWithSecret = {
    ...retry,
    input: providerUi.value.withRotateCredential(retry.input, key),
  };
  rotateRetry.value = retryWithSecret;
  rotationKeys[connection.id] = "";
  clearFeedback();
  pendingConnectionId.value = connection.id;
  await performRotate(operation, connection, retryWithSecret);
}

async function discardRotateRetry(): Promise<void> {
  await reconcileUnresolvedSecret();
}

async function changeLifecycle(
  connection: ProviderConnection,
  desired: "ACTIVE" | "PAUSED",
): Promise<void> {
  const operation = beginOperation();
  if (!operation || !props.canManage || pendingConnectionId.value) return;
  if (
    desired === "ACTIVE" &&
    providerUi.value.activationConfirmation &&
    !window.confirm(providerUi.value.activationConfirmation)
  )
    return;
  if (
    desired === "PAUSED" &&
    !window.confirm(
      `Отключить ${providerUi.value.title}-подключение «${connection.displayName}»?`,
    )
  )
    return;
  clearFeedback();
  pendingConnectionId.value = connection.id;
  const signature = `${desired.toLowerCase()}:${connection.id}:${connection.version}`;
  try {
    const updated =
      desired === "ACTIVE"
        ? await integrationConnectionsApi.activate(
            operation.projectId,
            connection.id,
            { expectedVersion: connection.version },
            commandKey(signature),
          )
        : await integrationConnectionsApi.disable(
            operation.projectId,
            connection.id,
            { expectedVersion: connection.version },
            commandKey(signature),
          );
    confirmCommand(signature);
    if (!isCurrent(operation) || updated.projectId !== operation.projectId)
      return;
    if (!isOutboundConnection(updated)) {
      actionError.value =
        "Backend не вернул безопасное outbound-подключение. Обновите список.";
      await load();
      return;
    }
    replaceConnection(updated);
    success.value =
      desired === "ACTIVE"
        ? providerUi.value.enabled
        : providerUi.value.disabled;
  } catch (cause) {
    if (isCurrent(operation)) setActionFailure(cause);
  } finally {
    if (isCurrent(operation)) pendingConnectionId.value = null;
  }
}

function replaceConnection(updated: ProviderConnection): void {
  const existing = connections.value.some(
    (connection) => connection.id === updated.id,
  );
  connections.value = existing
    ? connections.value.map((connection) =>
        connection.id === updated.id ? updated : connection,
      )
    : [...connections.value, updated];
  initializeDraft(updated);
}

function readyToActivate(connection: ProviderConnection): boolean {
  return (
    connection.lifecycle !== "ARCHIVED" &&
    connection.health === "HEALTHY" &&
    connection.credential.testedRevision === connection.credential.revision &&
    connection.lifecycle !== "ACTIVE"
  );
}

function statusLabel(connection: ProviderConnection): string {
  if (connection.lifecycle === "ARCHIVED") return "В архиве";
  if (connection.outboundCircuitPermanent)
    return "Ключ отклонён — нужна проверка";
  if (
    connection.outboundCircuitOpenUntil &&
    Date.parse(connection.outboundCircuitOpenUntil) > Date.now()
  )
    return "Отправка временно приостановлена";
  if (connection.health === "FAILING") return "Требует внимания";
  if (connection.health === "DEGRADED") return "Результат не подтверждён";
  if (connection.lifecycle === "ACTIVE") return "Активно";
  if (connection.lifecycle === "PAUSED") return "Отключено";
  return connection.health === "HEALTHY" ? "Проверено" : "Черновик";
}

function circuitLabel(connection: ProviderConnection): string {
  if (connection.outboundCircuitPermanent) return "Открыт до проверки ключа";
  if (!connection.outboundCircuitOpenUntil) return "Закрыт";
  return `До ${formatTimestamp(connection.outboundCircuitOpenUntil)}`;
}

function statusTone(connection: ProviderConnection): string {
  if (connection.health === "FAILING" || connection.health === "DEGRADED")
    return "INVALID";
  return connection.lifecycle;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Ещё не выполнялась";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "—"
    : timestamp.toLocaleString("ru-RU");
}

function isAmbiguous(cause: unknown): boolean {
  const error = normalizeApiError(cause);
  return error.status === 0 || error.status >= 500;
}

function isIdempotencyConflict(cause: unknown): boolean {
  const error = normalizeApiError(cause);
  return error.status === 409 && error.code === "IDEMPOTENCY_KEY_CONFLICT";
}

function setActionFailure(cause: unknown, retryAvailable = false): void {
  const error = normalizeApiError(cause);
  if (error.code === "INTEGRATION_CONNECTION_VERSION_CONFLICT") {
    void load();
    actionError.value =
      "Подключение уже изменилось в другой вкладке. Данные обновлены — повторите действие.";
    return;
  }
  if (error.code === providerUi.value.credentialInvalidCode) {
    actionError.value = `${providerUi.value.credentialLabel} имеет неверный формат.`;
    return;
  }
  if (error.code === "INTEGRATION_CONNECTION_CURRENT_CREDENTIAL_UNTESTED") {
    actionError.value = `Сначала успешно проверьте текущий ${providerUi.value.credentialShortLabel}.`;
    return;
  }
  if (error.code === "FORBIDDEN" || error.status === 403) {
    actionError.value = "Недостаточно прав для изменения интеграции.";
    return;
  }
  actionError.value = retryAvailable
    ? "Сервер не подтвердил результат. Повторите запрос — Lola использует тот же безопасный ключ повтора."
    : providerUi.value.connectionMutationError;
}

watch(
  () =>
    [props.projectId, props.canRead, props.canManage, props.provider] as const,
  () => {
    epoch += 1;
    loadRequest += 1;
    cancelPollWaits();
    connections.value = [];
    loading.value = true;
    pendingConnectionId.value = null;
    creating.value = false;
    displayName.value = providerUi.value.defaultDisplayName;
    commandKeys.clear();
    resetSensitiveState();
    clearPendingTestsView();
    unresolvedSecretMarker.value = null;
    if (props.projectId) {
      restorePendingTests(props.projectId);
      restoreUnresolvedSecret(props.projectId);
    }
    clearFeedback();
    if (props.canRead) void load();
    else loading.value = false;
  },
);

onMounted(() => {
  if (props.projectId) {
    restorePendingTests(props.projectId);
    restoreUnresolvedSecret(props.projectId);
  }
  void load();
});
onBeforeUnmount(() => {
  disposed = true;
  epoch += 1;
  cancelPollWaits();
  commandKeys.clear();
  resetSensitiveState();
});
</script>

<template>
  <section
    class="integration-card"
    :data-integration="providerUi.slug"
    :aria-labelledby="`${providerUi.slug}-title`"
  >
    <div class="card-heading">
      <div
        class="provider-mark"
        :class="`provider-mark--${providerUi.slug}`"
        aria-hidden="true"
      >
        {{ providerUi.mark }}
      </div>
      <div class="card-title">
        <h2 :id="`${providerUi.slug}-title`">{{ providerUi.title }}</h2>
        <p>{{ providerUi.description }}</p>
      </div>
      <span class="status" :data-status="hasConnections ? 'ACTIVE' : 'EMPTY'">
        {{
          hasConnections
            ? `Подключений: ${connections.length}`
            : "Не подключено"
        }}
      </span>
    </div>

    <p v-if="loadError" class="feedback error" role="alert">
      {{ loadError }}
      <button type="button" @click="load">Повторить</button>
    </p>
    <p v-if="actionError" class="feedback error" role="alert">
      {{ actionError }}
    </p>
    <p v-if="success" class="feedback success" role="status" aria-live="polite">
      {{ success }}
    </p>
    <div
      v-if="unresolvedSecretMarker && !createRetry && !rotateRetry"
      class="feedback error"
      role="alert"
    >
      <p>
        Предыдущий запрос с credential не был подтверждён и всё ещё мог
        выполниться. Новая отправка заблокирована. Обновите список, проверьте
        результат вручную и снимайте защиту только если принимаете риск повтора.
      </p>
      <button
        type="button"
        :data-action="`reconcile-secret-${providerUi.slug}`"
        :disabled="loading || creating || pendingConnectionId !== null"
        @click="reconcileUnresolvedSecret"
      >
        Обновить список и принять решение
      </button>
    </div>

    <div v-if="loading" class="skeleton" aria-live="polite">
      Загружаем {{ providerUi.title }}…
    </div>

    <div v-else class="provider-connections">
      <article
        v-for="connection in connections"
        :key="connection.id"
        class="provider-connection"
        :data-connection-id="connection.id"
      >
        <div class="provider-connection__heading">
          <div>
            <h3>{{ connection.displayName }}</h3>
            <p>
              {{
                connection.remoteProjectLabel ||
                "Без подписи удалённого проекта"
              }}
            </p>
          </div>
          <span class="status" :data-status="statusTone(connection)">
            {{ statusLabel(connection) }}
          </span>
        </div>

        <dl class="integration-facts">
          <div>
            <dt>Регион</dt>
            <dd>{{ connection.region }}</dd>
          </div>
          <div>
            <dt>Credential</dt>
            <dd>
              <code>{{ connection.credential.fingerprint }}</code>
            </dd>
          </div>
          <div>
            <dt>Ревизия</dt>
            <dd>{{ connection.credential.revision }}</dd>
          </div>
          <div>
            <dt>Проверенная ревизия</dt>
            <dd>{{ connection.credential.testedRevision ?? "—" }}</dd>
          </div>
          <div>
            <dt>Последняя успешная проверка</dt>
            <dd>{{ formatTimestamp(connection.lastSuccessfulTestAt) }}</dd>
          </div>
          <div>
            <dt>Последняя ошибка</dt>
            <dd>{{ connection.lastTestErrorCode ?? "Нет" }}</dd>
          </div>
          <div>
            <dt>Контур отправки</dt>
            <dd>{{ circuitLabel(connection) }}</dd>
          </div>
          <div v-if="connection.outboundCircuitReason">
            <dt>Причина остановки</dt>
            <dd>{{ connection.outboundCircuitReason }}</dd>
          </div>
        </dl>

        <div
          v-if="canManage && connection.lifecycle !== 'ARCHIVED'"
          class="actions"
        >
          <button
            type="button"
            :data-action="`test-${providerUi.slug}`"
            :disabled="pendingConnectionId !== null || creating"
            @click="testConnection(connection)"
          >
            Проверить
          </button>
          <button
            v-if="readyToActivate(connection)"
            type="button"
            :data-action="`activate-${providerUi.slug}`"
            :disabled="pendingConnectionId !== null || creating"
            @click="changeLifecycle(connection, 'ACTIVE')"
          >
            Активировать
          </button>
          <button
            v-if="connection.lifecycle === 'ACTIVE'"
            type="button"
            class="secondary"
            :data-action="`disable-${providerUi.slug}`"
            :disabled="pendingConnectionId !== null || creating"
            @click="changeLifecycle(connection, 'PAUSED')"
          >
            Отключить
          </button>
        </div>

        <form
          v-if="
            canManage &&
            connection.lifecycle !== 'ARCHIVED' &&
            metadataDrafts[connection.id]
          "
          class="secret-form"
          :data-form="`update-${providerUi.slug}`"
          @submit.prevent="updateMetadata(connection)"
        >
          <label class="integration-field">
            <span>Название подключения</span>
            <input
              v-model="metadataDrafts[connection.id]!.displayName"
              maxlength="120"
            />
          </label>
          <label class="integration-field">
            <span>Подпись проекта в {{ providerUi.title }}</span>
            <input
              v-model="metadataDrafts[connection.id]!.remoteProjectLabel"
              maxlength="120"
            />
          </label>
          <div class="form-actions">
            <button
              type="submit"
              class="secondary"
              :disabled="pendingConnectionId !== null || creating"
            >
              Сохранить настройки
            </button>
          </div>
        </form>

        <form
          v-if="canManage && connection.lifecycle !== 'ARCHIVED'"
          class="secret-form secret-form--single"
          :data-form="`rotate-${providerUi.slug}`"
          @submit.prevent="rotate(connection)"
        >
          <label class="integration-field">
            <span>Новый {{ providerUi.credentialShortLabel }}</span>
            <input
              v-model="rotationKeys[connection.id]"
              :name="`${providerUi.formNamePrefix}RotationKey`"
              type="password"
              autocomplete="off"
              :maxlength="providerUi.credentialMaxLength"
              :placeholder="providerUi.credentialPlaceholder"
              :disabled="
                secretRetryPending &&
                rotateRetry?.connectionId !== connection.id
              "
            />
          </label>
          <small
            >Ключ очистится сразу после отправки. Текущий ключ никогда не
            отображается.</small
          >
          <div class="form-actions">
            <button
              type="submit"
              class="secondary"
              :disabled="
                pendingConnectionId !== null ||
                creating ||
                secretRetryPending ||
                !rotationKeys[connection.id]
              "
            >
              Заменить и проверить
            </button>
            <button
              v-if="rotateRetry?.connectionId === connection.id"
              type="button"
              class="secondary"
              :data-action="`retry-rotate-${providerUi.slug}`"
              :disabled="
                pendingConnectionId !== null ||
                creating ||
                !rotationKeys[connection.id]
              "
              @click="retryRotate(connection)"
            >
              Повторить неподтверждённый запрос
            </button>
            <button
              v-if="rotateRetry?.connectionId === connection.id"
              type="button"
              class="secondary"
              :data-action="`discard-rotate-${providerUi.slug}`"
              :disabled="pendingConnectionId !== null || creating"
              @click="discardRotateRetry"
            >
              Отменить безопасный повтор
            </button>
          </div>
        </form>
        <p v-if="connection.lifecycle === 'ARCHIVED'" class="read-only-note">
          Архивное подключение доступно только для просмотра.
        </p>
      </article>

      <p v-if="!hasConnections && !canManage" class="read-only-note">
        Подключений нет. У вас есть доступ только для просмотра.
      </p>
    </div>

    <form
      v-if="canManage"
      class="secret-form provider-create-form"
      :data-form="`create-${providerUi.slug}`"
      @submit.prevent="create"
    >
      <label class="integration-field">
        <span>Название подключения</span>
        <input
          v-model="displayName"
          :name="`${providerUi.formNamePrefix}DisplayName`"
          maxlength="120"
        />
      </label>
      <label class="integration-field">
        <span>Регион данных</span>
        <select v-model="region" :name="`${providerUi.formNamePrefix}Region`">
          <option value="EU">EU</option>
          <option value="US">US</option>
        </select>
      </label>
      <label class="integration-field">
        <span>Подпись проекта в {{ providerUi.title }}</span>
        <input
          v-model="remoteProjectLabel"
          :name="`${providerUi.formNamePrefix}RemoteProjectLabel`"
          maxlength="120"
        />
      </label>
      <label class="integration-field">
        <span>{{ providerUi.credentialShortLabel }}</span>
        <input
          v-model="credentialSecret"
          :name="`${providerUi.formNamePrefix}${providerUi.credentialName[0]!.toUpperCase()}${providerUi.credentialName.slice(1)}`"
          type="password"
          autocomplete="off"
          :maxlength="providerUi.credentialMaxLength"
          :placeholder="providerUi.credentialPlaceholder"
          :disabled="secretRetryPending && !createRetry"
        />
      </label>
      <small>{{ providerUi.credentialHelp }}</small>
      <div class="form-actions">
        <button
          type="submit"
          :disabled="
            creating || pendingConnectionId !== null || secretRetryPending
          "
        >
          Создать и проверить
        </button>
        <button
          v-if="createRetry"
          type="button"
          class="secondary"
          :data-action="`retry-create-${providerUi.slug}`"
          :disabled="
            creating || pendingConnectionId !== null || !credentialSecret
          "
          @click="retryCreate"
        >
          Повторить неподтверждённый запрос
        </button>
        <button
          v-if="createRetry"
          type="button"
          class="secondary"
          :data-action="`discard-create-${providerUi.slug}`"
          :disabled="creating || pendingConnectionId !== null"
          @click="discardCreateRetry"
        >
          Отменить безопасный повтор
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.provider-mark--amplitude {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
  font-weight: 800;
}
.provider-mark--customer-io {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}

.provider-connections {
  display: grid;
  gap: 16px;
}

.provider-connection {
  display: grid;
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
}

.provider-connection__heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 14px;
}

.provider-connection__heading h3,
.provider-connection__heading p {
  margin: 0;
}

.provider-connection__heading p {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: var(--font-size-body-small);
}

.integration-field select {
  width: 100%;
  height: var(--control-height);
  padding: 0 13px;
  border: 1px solid var(--input-border);
  border-radius: 12px;
  background: var(--input-background);
  color: var(--text-primary);
}

.provider-create-form {
  border-style: dashed;
}

@media (max-width: 760px) {
  .provider-connection__heading {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
