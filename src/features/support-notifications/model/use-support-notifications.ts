import { computed, ref } from "vue";
import type {
  BrowserPushSubscriptionResponseDto,
  PersonalSupportNotificationPreferenceResponseDto,
} from "@/shared/api/generated/models";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportNotificationsSource,
  SupportNotificationConfiguration,
  SupportNotificationTopic,
} from "@/features/support-notifications/api/support-notifications-source";
import type {
  BrowserPushAdapter,
  BrowserPushState,
} from "@/features/support-notifications/model/browser-push-adapter";
import {
  clearStoredBrowserPushRegistration,
  readStoredBrowserPushRegistration,
  writeStoredBrowserPushRegistration,
  type StoredBrowserPushRegistration,
} from "@/features/support-notifications/model/browser-push-registration-store";
import {
  releaseSupportNotificationRegistration,
  runSupportNotificationBrowserLifecycle,
  trackSupportNotificationRegistration,
} from "@/features/support-notifications/model/support-notification-browser-lifecycle";

const emptyBrowser: BrowserPushState = {
  permission: "UNSUPPORTED",
  locallySubscribed: false,
  requiresInstalledApp: false,
  endpoint: null,
  applicationServerKey: null,
};

export interface SupportNotificationsContext {
  projectId(): string | undefined;
  actorId(): string | undefined;
  canRead(): boolean;
  onForbidden?(): void | Promise<void>;
}

export function createSupportNotificationsController(
  context: SupportNotificationsContext,
  source: SupportNotificationsSource,
  browser: BrowserPushAdapter,
) {
  const configuration = ref<SupportNotificationConfiguration | null>(null);
  const preferences = ref<readonly PersonalSupportNotificationPreferenceResponseDto[]>([]);
  const devices = ref<readonly BrowserPushSubscriptionResponseDto[]>([]);
  const browserState = ref<BrowserPushState>({ ...emptyBrowser });
  const loading = ref(false);
  const savingTopic = ref<SupportNotificationTopic | null>(null);
  const connecting = ref(false);
  const revokingDeviceId = ref<string | null>(null);
  const error = ref("");
  const success = ref("");
  const storedRegistration = ref<{
    actorId: string;
    registration: StoredBrowserPushRegistration;
  } | null>(null);
  let generation = 0;
  let abort: AbortController | null = null;
  let topicMutation: symbol | null = null;
  let deviceMutation: symbol | null = null;
  let scope: { projectId: string; actorId: string } | null = null;
  const topicAttempts = new Map<SupportNotificationTopic, {
    subscribed: boolean;
    expectedVersion?: number;
    idempotencyKey: string;
  }>();
  let connectAttempt: {
    material: Awaited<ReturnType<BrowserPushAdapter["subscribe"]>>;
    idempotencyKey: string;
    expectedVersion?: number;
  } | null = null;
  const revokeAttempts = new Map<string, string>();

  const activeDevices = computed(() => devices.value.filter((item) => item.status === "ACTIVE"));
  const currentDeviceId = computed(() => {
    const actorId = context.actorId();
    const scopedRegistration = storedRegistration.value;
    const stored =
      scopedRegistration && scopedRegistration.actorId === actorId
        ? scopedRegistration.registration
        : null;
    if (
      !stored ||
      stored.endpoint !== browserState.value.endpoint ||
      stored.applicationServerKey !== browserState.value.applicationServerKey ||
      stored.applicationServerKeyRevision !== configuration.value?.applicationServerKeyRevision
    )
      return null;
    return devices.value.some((item) => item.id === stored.deviceId && item.status === "ACTIVE")
      ? stored.deviceId
      : null;
  });
  const browserReady = computed(
    () =>
      browserState.value.permission === "GRANTED" &&
      browserState.value.locallySubscribed &&
      Boolean(currentDeviceId.value),
  );
  const deviceBusy = computed(
    () => connecting.value || revokingDeviceId.value !== null,
  );

  function loadStoredRegistration(actorId: string): StoredBrowserPushRegistration | null {
    const registration = readStoredBrowserPushRegistration(actorId);
    storedRegistration.value = registration ? { actorId, registration } : null;
    return registration;
  }

  function storeRegistration(
    actorId: string,
    registration: StoredBrowserPushRegistration,
  ): void {
    writeStoredBrowserPushRegistration(actorId, registration);
    storedRegistration.value = { actorId, registration };
  }

  function clearRegistration(actorId: string): void {
    clearStoredBrowserPushRegistration(actorId);
    if (storedRegistration.value?.actorId === actorId) storedRegistration.value = null;
  }

  function reset(): void {
    generation += 1;
    abort?.abort();
    abort = null;
    topicMutation = null;
    deviceMutation = null;
    topicAttempts.clear();
    connectAttempt = null;
    revokeAttempts.clear();
    scope = null;
    configuration.value = null;
    preferences.value = [];
    devices.value = [];
    browserState.value = { ...emptyBrowser };
    storedRegistration.value = null;
    loading.value = false;
    savingTopic.value = null;
    connecting.value = false;
    revokingDeviceId.value = null;
    error.value = "";
    success.value = "";
  }

  function beginScope(projectId: string, actorId: string): void {
    if (scope?.projectId === projectId && scope.actorId === actorId) return;
    scope = { projectId, actorId };
    topicMutation = null;
    deviceMutation = null;
    topicAttempts.clear();
    connectAttempt = null;
    revokeAttempts.clear();
    savingTopic.value = null;
    connecting.value = false;
    revokingDeviceId.value = null;
  }

  function isCurrent(projectId: string, actorId: string, requestGeneration: number): boolean {
    return (
      generation === requestGeneration &&
      context.projectId() === projectId &&
      context.actorId() === actorId &&
      context.canRead()
    );
  }

  async function forbidden(): Promise<void> {
    reset();
    await context.onForbidden?.();
  }

  async function load(): Promise<void> {
    const projectId = context.projectId();
    const actorId = context.actorId();
    const previousActorId = scope?.actorId;
    abort?.abort();
    const requestGeneration = ++generation;
    const requestAbort = new AbortController();
    abort = requestAbort;
    error.value = "";
    success.value = "";
    configuration.value = null;
    preferences.value = [];
    devices.value = [];
    if (!projectId || !actorId || !context.canRead()) {
      reset();
      return;
    }
    beginScope(projectId, actorId);
    loading.value = true;
    const stored = loadStoredRegistration(actorId);
    try {
      if (previousActorId && previousActorId !== actorId) {
        await runSupportNotificationBrowserLifecycle(() => browser.unsubscribe());
        if (!isCurrent(projectId, actorId, requestGeneration)) return;
      }
      const nextConfiguration = await source.readConfiguration(projectId, requestAbort.signal);
      if (!isCurrent(projectId, actorId, requestGeneration)) return;
      configuration.value = nextConfiguration;
      const [nextPreferences, nextDevices, nextBrowser] = await Promise.all([
        source.readPreferences(projectId, requestAbort.signal),
        source.listDevices(requestAbort.signal),
        browser.state(),
      ]);
      if (!isCurrent(projectId, actorId, requestGeneration)) return;
      preferences.value = nextPreferences;
      devices.value = nextDevices;
      browserState.value = nextBrowser;
      const storedDevice = stored
        ? nextDevices.find((item) => item.id === stored.deviceId)
        : undefined;
      if (
        stored &&
        !storedDevice
      )
        clearRegistration(actorId);
      else if (
        stored &&
        storedDevice?.status === "ACTIVE" &&
        nextBrowser.permission === "GRANTED" &&
        nextBrowser.locallySubscribed &&
        !currentDeviceId.value &&
        nextConfiguration.capabilities.deviceRegistration === "AVAILABLE"
      )
        await connectBrowser();
    } catch (cause) {
      if (!isCurrent(projectId, actorId, requestGeneration)) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden();
        return;
      }
      configuration.value = null;
      preferences.value = [];
      devices.value = [];
      error.value = "Не удалось загрузить настройки уведомлений. Повторите попытку.";
    } finally {
      if (generation === requestGeneration) {
        loading.value = false;
        abort = null;
      }
    }
  }

  function preference(topic: SupportNotificationTopic) {
    return preferences.value.find((item) => item.topic === topic) ?? null;
  }

  function capability(topic: SupportNotificationTopic) {
    return topic === "SUPPORT_CASE_ATTENTION"
      ? configuration.value?.capabilities.attention
      : configuration.value?.capabilities.assignedToMe;
  }

  function canSet(topic: SupportNotificationTopic, subscribed: boolean): boolean {
    const allowed = capability(topic);
    return allowed === "AVAILABLE" || (allowed === "DISABLE_ONLY" && !subscribed);
  }

  async function setPreference(topic: SupportNotificationTopic, subscribed: boolean): Promise<void> {
    const projectId = context.projectId();
    const actorId = context.actorId();
    const current = preference(topic);
    if (!projectId || !actorId || !current || !canSet(topic, subscribed) || savingTopic.value) return;
    const requestGeneration = generation;
    const mutation = Symbol(topic);
    topicMutation = mutation;
    savingTopic.value = topic;
    error.value = "";
    success.value = "";
    try {
      const previousAttempt = topicAttempts.get(topic);
      const input =
        previousAttempt?.subscribed === subscribed &&
        previousAttempt.expectedVersion === (current.version ?? undefined)
          ? previousAttempt
          : {
              subscribed,
              ...(current.version ? { expectedVersion: current.version } : {}),
              idempotencyKey: crypto.randomUUID(),
            };
      topicAttempts.set(topic, input);
      const next = await source.updatePreference(projectId, { topic, ...input });
      if (topicMutation !== mutation || !isCurrent(projectId, actorId, requestGeneration)) return;
      const receipt = next.find((item) => item.topic === topic);
      if (!receipt || receipt.subscribed !== subscribed)
        throw new Error("SUPPORT_NOTIFICATION_PREFERENCE_RECEIPT_INVALID");
      const updated = new Map(next.map((item) => [item.topic, item]));
      preferences.value = preferences.value.map((item) => updated.get(item.topic) ?? item);
      topicAttempts.delete(topic);
      success.value = subscribed ? "Тип уведомлений включён." : "Тип уведомлений выключен.";
    } catch (cause) {
      if (topicMutation !== mutation || !isCurrent(projectId, actorId, requestGeneration)) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden();
        return;
      }
      if (cause instanceof ApiError && cause.status === 409) {
        topicAttempts.delete(topic);
        await load();
        if (context.projectId() === projectId && context.actorId() === actorId)
          error.value = "Настройка изменилась в другой сессии. Показано актуальное состояние.";
      } else error.value = "Не удалось изменить тип уведомлений.";
    } finally {
      if (topicMutation === mutation) {
        topicMutation = null;
        savingTopic.value = null;
      }
    }
  }

  async function connectBrowser(): Promise<void> {
    const projectId = context.projectId();
    const actorId = context.actorId();
    const publicKey = configuration.value?.applicationServerKey;
    if (
      !projectId ||
      !actorId ||
      !publicKey ||
      configuration.value?.capabilities.deviceRegistration !== "AVAILABLE" ||
      connecting.value ||
      deviceMutation !== null
    )
      return;
    const requestGeneration = generation;
    const mutation = Symbol("connect-browser");
    deviceMutation = mutation;
    connecting.value = true;
    error.value = "";
    success.value = "";
    try {
      if (browserState.value.locallySubscribed && !currentDeviceId.value && !connectAttempt) {
        await runSupportNotificationBrowserLifecycle(() => browser.unsubscribe());
        if (!isCurrent(projectId, actorId, requestGeneration) || deviceMutation !== mutation) return;
        browserState.value = await runSupportNotificationBrowserLifecycle(() => browser.state());
        if (!isCurrent(projectId, actorId, requestGeneration) || deviceMutation !== mutation) return;
      }
      const material =
        connectAttempt?.material ??
        (await runSupportNotificationBrowserLifecycle(() => browser.subscribe(publicKey)));
      if (deviceMutation !== mutation || !isCurrent(projectId, actorId, requestGeneration)) {
        if (deviceMutation === mutation)
          await runSupportNotificationBrowserLifecycle(() => browser.unsubscribe()).catch(
            () => undefined,
          );
        return;
      }
      const stored =
        storedRegistration.value?.actorId === actorId
          ? storedRegistration.value.registration
          : loadStoredRegistration(actorId);
      const currentDevice = devices.value.find((item) => item.id === stored?.deviceId);
      const attempt =
        connectAttempt ?? {
          material,
          idempotencyKey: crypto.randomUUID(),
          ...(stored?.endpoint === material.endpoint && currentDevice
            ? { expectedVersion: currentDevice.version }
            : {}),
        };
      connectAttempt = attempt;
      if (
        stored &&
        currentDevice?.status === "ACTIVE" &&
        !currentDeviceId.value &&
        stored.endpoint !== material.endpoint
      ) {
        const retirementKey =
          revokeAttempts.get(currentDevice.id) ?? crypto.randomUUID();
        revokeAttempts.set(currentDevice.id, retirementKey);
        const retired = await source.revokeDevice(currentDevice, retirementKey);
        if (deviceMutation !== mutation || !isCurrent(projectId, actorId, requestGeneration)) return;
        if (retired.id !== currentDevice.id || retired.status !== "REVOKED")
          throw new Error("SUPPORT_NOTIFICATION_ROTATION_REVOKE_INVALID");
        revokeAttempts.delete(currentDevice.id);
        devices.value = devices.value.map((item) =>
          item.id === retired.id ? retired : item,
        );
      }
      const registerInput = {
        ...attempt.material,
        idempotencyKey: attempt.idempotencyKey,
        ...(attempt.expectedVersion ? { expectedVersion: attempt.expectedVersion } : {}),
      };
      const registered = await trackSupportNotificationRegistration(
        actorId,
        registerInput,
        (signal) => source.registerDevice(registerInput, signal),
      );
      if (deviceMutation !== mutation || !isCurrent(projectId, actorId, requestGeneration)) return;
      if (registered.status !== "ACTIVE")
        throw new Error("SUPPORT_NOTIFICATION_DEVICE_RECEIPT_INVALID");
      const nextBrowserState = await browser.state();
      if (deviceMutation !== mutation || !isCurrent(projectId, actorId, requestGeneration)) return;
      if (
        nextBrowserState.endpoint !== attempt.material.endpoint ||
        nextBrowserState.applicationServerKey !== publicKey
      )
        throw new Error("SUPPORT_NOTIFICATION_LOCAL_SUBSCRIPTION_CHANGED");
      const [loadedDevices, nextConfiguration] = await Promise.all([
        source.listDevices(),
        source.readConfiguration(projectId),
      ]);
      if (deviceMutation !== mutation || !isCurrent(projectId, actorId, requestGeneration)) return;
      const nextDevices = loadedDevices;
      storeRegistration(actorId, {
        deviceId: registered.id,
        endpoint: attempt.material.endpoint,
        applicationServerKey: publicKey,
        applicationServerKeyRevision: nextConfiguration.applicationServerKeyRevision,
      });
      releaseSupportNotificationRegistration(actorId, attempt.idempotencyKey);
      connectAttempt = null;
      browserState.value = nextBrowserState;
      devices.value = nextDevices;
      configuration.value = nextConfiguration;
      success.value = "Этот браузер подключён к уведомлениям поддержки.";
    } catch (cause) {
      if (deviceMutation !== mutation || !isCurrent(projectId, actorId, requestGeneration)) return;
      const nextBrowserState = await browser.state().catch(() => ({ ...emptyBrowser }));
      if (deviceMutation !== mutation || !isCurrent(projectId, actorId, requestGeneration)) return;
      browserState.value = nextBrowserState;
      const code = cause instanceof Error ? cause.message : "";
      if (code === "BROWSER_PUSH_PERMISSION_DENIED")
        error.value = "Браузер запретил уведомления. Разрешите их в настройках сайта и проверьте снова.";
      else if (code === "BROWSER_PUSH_INSTALL_REQUIRED")
        error.value = "На iPhone или iPad сначала добавьте Retenive CMS на экран «Домой».";
      else if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden();
        return;
      } else {
        error.value =
          "Регистрация браузера не подтверждена сервером. Локальная подписка не считается включённым устройством.";
        await source.listDevices().then((items) => {
          if (deviceMutation === mutation && isCurrent(projectId, actorId, requestGeneration))
            devices.value = items;
        }).catch(() => undefined);
      }
    } finally {
      if (deviceMutation === mutation) {
        deviceMutation = null;
        connecting.value = false;
      }
    }
  }

  async function checkBrowser(): Promise<void> {
    const projectId = context.projectId();
    const actorId = context.actorId();
    const requestGeneration = generation;
    if (!projectId || !actorId) return;
    const next = await browser.state().catch(() => ({ ...emptyBrowser }));
    if (isCurrent(projectId, actorId, requestGeneration)) browserState.value = next;
  }

  async function revokeDevice(device: BrowserPushSubscriptionResponseDto): Promise<void> {
    if (device.status !== "ACTIVE" || revokingDeviceId.value || deviceMutation !== null) return;
    const projectId = context.projectId();
    const actorId = context.actorId();
    if (!projectId || !actorId) return;
    const requestGeneration = generation;
    const mutation = Symbol(device.id);
    deviceMutation = mutation;
    revokingDeviceId.value = device.id;
    error.value = "";
    success.value = "";
    try {
      const idempotencyKey = revokeAttempts.get(device.id) ?? crypto.randomUUID();
      revokeAttempts.set(device.id, idempotencyKey);
      const revoked = await source.revokeDevice(device, idempotencyKey);
      if (deviceMutation !== mutation || !isCurrent(projectId, actorId, requestGeneration)) return;
      if (revoked.id !== device.id || revoked.status !== "REVOKED")
        throw new Error("SUPPORT_NOTIFICATION_REVOKE_RECEIPT_INVALID");
      const stored =
        storedRegistration.value?.actorId === actorId
          ? storedRegistration.value.registration
          : loadStoredRegistration(actorId);
      if (stored?.deviceId === device.id) {
        await runSupportNotificationBrowserLifecycle(() => browser.unsubscribe()).catch(
          () => undefined,
        );
        if (deviceMutation !== mutation || !isCurrent(projectId, actorId, requestGeneration)) return;
      }
      revokeAttempts.delete(device.id);
      devices.value = devices.value.map((item) => (item.id === device.id ? revoked : item));
      if (stored?.deviceId === device.id) {
        const nextBrowserState = await runSupportNotificationBrowserLifecycle(() => browser.state()).catch(
          () => ({ ...emptyBrowser }),
        );
        if (deviceMutation !== mutation || !isCurrent(projectId, actorId, requestGeneration)) return;
        browserState.value = nextBrowserState;
      }
      const nextConfiguration = await source.readConfiguration(projectId);
      if (deviceMutation !== mutation || !isCurrent(projectId, actorId, requestGeneration)) return;
      configuration.value = nextConfiguration;
      success.value = "Устройство отключено.";
    } catch (cause) {
      if (deviceMutation !== mutation || !isCurrent(projectId, actorId, requestGeneration)) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden();
        return;
      }
      if (cause instanceof ApiError && cause.status === 409) {
        revokeAttempts.delete(device.id);
        await load();
        if (context.projectId() === projectId && context.actorId() === actorId)
          error.value = "Состояние устройства изменилось. Список обновлён.";
      } else error.value = "Не удалось отключить устройство.";
    } finally {
      if (deviceMutation === mutation) {
        deviceMutation = null;
        revokingDeviceId.value = null;
      }
    }
  }

  const stopBrowserChangeWatch = browser.onSubscriptionChange?.(() => void load());

  function dispose(): void {
    stopBrowserChangeWatch?.();
    reset();
  }

  return {
    configuration,
    preferences,
    devices,
    activeDevices,
    currentDeviceId,
    browserState,
    browserReady,
    deviceBusy,
    loading,
    savingTopic,
    connecting,
    revokingDeviceId,
    error,
    success,
    preference,
    capability,
    canSet,
    load,
    setPreference,
    connectBrowser,
    checkBrowser,
    revokeDevice,
    reset,
    dispose,
  };
}
