import {
  personalBrowserPushListSubscriptions,
  personalBrowserPushRegisterSubscription,
  personalBrowserPushRevokeSubscription,
  personalSupportNotificationReadAdmission,
  personalSupportNotificationReadPreferences,
  personalSupportNotificationResolveDeepLink,
  personalSupportNotificationUpdatePreference,
} from "@/shared/api/generated/retenive-backend";
import type {
  BrowserPushSubscriptionResponseDto,
  PersonalSupportNotificationAdmissionResponseDto,
  PersonalSupportNotificationDeepLinkTargetDto,
  PersonalSupportNotificationPreferenceResponseDto,
} from "@/shared/api/generated/models";
import { dataMode } from "@/shared/config/data-mode";

export type SupportNotificationTopic =
  | "SUPPORT_CASE_ATTENTION"
  | "SUPPORT_CASE_ASSIGNED_TO_ME";

export interface BrowserSubscriptionMaterial {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type SupportNotificationConfiguration = Pick<
  PersonalSupportNotificationAdmissionResponseDto,
  | "evaluatedAt"
  | "activeSubscriptionCount"
  | "capabilities"
  | "applicationServerKey"
  | "applicationServerKeyRevision"
>;

export interface SupportNotificationsSource {
  readConfiguration(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<SupportNotificationConfiguration>;
  readPreferences(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<readonly PersonalSupportNotificationPreferenceResponseDto[]>;
  updatePreference(
    projectId: string,
    input: {
      topic: SupportNotificationTopic;
      subscribed: boolean;
      expectedVersion?: number;
      idempotencyKey: string;
    },
    signal?: AbortSignal,
  ): Promise<readonly PersonalSupportNotificationPreferenceResponseDto[]>;
  listDevices(signal?: AbortSignal): Promise<readonly BrowserPushSubscriptionResponseDto[]>;
  registerDevice(
    input: BrowserSubscriptionMaterial & {
      expectedVersion?: number;
      idempotencyKey: string;
    },
    signal?: AbortSignal,
  ): Promise<BrowserPushSubscriptionResponseDto>;
  revokeDevice(
    device: Pick<BrowserPushSubscriptionResponseDto, "id" | "version">,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<BrowserPushSubscriptionResponseDto>;
  resolveDeepLink(
    capability: string,
    signal?: AbortSignal,
  ): Promise<PersonalSupportNotificationDeepLinkTargetDto>;
}

export const apiSupportNotificationsSource: SupportNotificationsSource = {
  async readConfiguration(projectId, signal) {
    return personalSupportNotificationReadAdmission(projectId, { signal });
  },
  async readPreferences(projectId, signal) {
    return (await personalSupportNotificationReadPreferences(projectId, { signal })).items;
  },
  async updatePreference(projectId, input, signal) {
    const { idempotencyKey, ...body } = input;
    return (
      await personalSupportNotificationUpdatePreference(projectId, body, {
        signal,
        headers: { "Idempotency-Key": idempotencyKey },
      })
    ).items;
  },
  async listDevices(signal) {
    return (await personalBrowserPushListSubscriptions({ signal })).items;
  },
  registerDevice(input, signal) {
    const { idempotencyKey, ...body } = input;
    return personalBrowserPushRegisterSubscription(body, {
      signal,
      headers: { "Idempotency-Key": idempotencyKey },
    });
  },
  revokeDevice(device, idempotencyKey, signal) {
    return personalBrowserPushRevokeSubscription(
      device.id,
      { expectedVersion: device.version },
      { signal, headers: { "Idempotency-Key": idempotencyKey } },
    );
  },
  resolveDeepLink(capability, signal) {
    return personalSupportNotificationResolveDeepLink(capability, { signal });
  },
};

const mockPreferences = new Map<string, PersonalSupportNotificationPreferenceResponseDto[]>(
  [],
);
let mockDevices: BrowserPushSubscriptionResponseDto[] = [];
const mockSourceStateKey = "support-notifications-source-mock:v1";

function hydrateMockSourceState(): void {
  try {
    const raw = sessionStorage.getItem(mockSourceStateKey);
    if (!raw) return;
    const value = JSON.parse(raw) as {
      preferences?: Record<string, PersonalSupportNotificationPreferenceResponseDto[]>;
      devices?: BrowserPushSubscriptionResponseDto[];
    };
    if (value.preferences && typeof value.preferences === "object") {
      mockPreferences.clear();
      Object.entries(value.preferences).forEach(([projectId, items]) => {
        if (Array.isArray(items)) mockPreferences.set(projectId, items);
      });
    }
    if (Array.isArray(value.devices)) mockDevices = value.devices;
  } catch {
    // In-memory mock state remains usable when session storage is unavailable.
  }
}

function persistMockSourceState(): void {
  try {
    sessionStorage.setItem(
      mockSourceStateKey,
      JSON.stringify({
        preferences: Object.fromEntries(mockPreferences),
        devices: mockDevices,
      }),
    );
  } catch {
    // In-memory mock state remains usable when session storage is unavailable.
  }
}

function preferences(projectId: string): PersonalSupportNotificationPreferenceResponseDto[] {
  hydrateMockSourceState();
  const current = mockPreferences.get(projectId);
  if (current) return current;
  const created: PersonalSupportNotificationPreferenceResponseDto[] = [
    {
      topic: "SUPPORT_CASE_ATTENTION",
      channel: "BROWSER_PUSH",
      subscribed: false,
      source: "DEFAULT",
      version: null,
    },
    {
      topic: "SUPPORT_CASE_ASSIGNED_TO_ME",
      channel: "BROWSER_PUSH",
      subscribed: true,
      source: "DEFAULT",
      version: null,
    },
  ];
  mockPreferences.set(projectId, created);
  persistMockSourceState();
  return created;
}

const mockSupportNotificationsSource: SupportNotificationsSource = {
  async readConfiguration() {
    hydrateMockSourceState();
    return {
      evaluatedAt: new Date().toISOString(),
      activeSubscriptionCount: mockDevices.filter((item) => item.status === "ACTIVE").length,
      capabilities: {
        assignedToMe: "AVAILABLE",
        attention: "AVAILABLE",
        deviceRegistration: "AVAILABLE",
        deepLinkResolve: "AVAILABLE",
      },
      applicationServerKey: "BElv1bUj-demo-public-key",
      applicationServerKeyRevision: "fedcba9876543210",
    };
  },
  async readPreferences(projectId) {
    return structuredClone(preferences(projectId));
  },
  async updatePreference(projectId, input) {
    const next = preferences(projectId).map((item) =>
      item.topic === input.topic
        ? {
            ...item,
            subscribed: input.subscribed,
            source: "EXPLICIT" as const,
            version: (item.version ?? 0) + 1,
          }
        : item,
    );
    mockPreferences.set(projectId, next);
    persistMockSourceState();
    return structuredClone(next);
  },
  async listDevices() {
    hydrateMockSourceState();
    return structuredClone(mockDevices);
  },
  async registerDevice() {
    hydrateMockSourceState();
    const now = new Date().toISOString();
    const created: BrowserPushSubscriptionResponseDto = {
      id: crypto.randomUUID(),
      userAgentClass: "Chrome · macOS",
      status: "ACTIVE",
      version: 1,
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null,
    };
    mockDevices = [created, ...mockDevices];
    persistMockSourceState();
    return structuredClone(created);
  },
  async revokeDevice(device) {
    hydrateMockSourceState();
    const current = mockDevices.find((item) => item.id === device.id);
    const revoked: BrowserPushSubscriptionResponseDto = {
      ...(current ?? {
        id: device.id,
        userAgentClass: "Браузер",
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      }),
      status: "REVOKED",
      version: device.version + 1,
      revokedAt: new Date().toISOString(),
    };
    mockDevices = mockDevices.map((item) => (item.id === device.id ? revoked : item));
    persistMockSourceState();
    return structuredClone(revoked);
  },
  async resolveDeepLink() {
    return {
      target: "SUPPORT_OPERATOR_WORKSPACE",
      projectId: "prj_retenive_demo",
      selection: { kind: "CASE", caseId: "case-demo-deposit" },
    };
  },
};

export const supportNotificationsSource =
  dataMode === "mock" ? mockSupportNotificationsSource : apiSupportNotificationsSource;
