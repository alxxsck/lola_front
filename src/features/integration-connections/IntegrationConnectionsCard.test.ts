import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import IntegrationConnectionsCard from "./IntegrationConnectionsCard.vue";

vi.mock("primevue/select", () => ({
  default: {
    props: ["modelValue", "options", "optionLabel", "optionValue", "name"],
    emits: ["update:modelValue"],
    template: `<select :name="name" :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
      <option v-for="option in options" :key="option[optionValue]" :value="option[optionValue]">{{ option[optionLabel] }}</option>
    </select>`,
  },
}));

const api = vi.hoisted(() => ({
  list: vi.fn(),
  createAmplitude: vi.fn(),
  createCustomerIo: vi.fn(),
  updateAmplitude: vi.fn(),
  updateCustomerIo: vi.fn(),
  rotateAmplitude: vi.fn(),
  rotateCustomerIo: vi.fn(),
  requestTest: vi.fn(),
  getTest: vi.fn(),
  activate: vi.fn(),
  disable: vi.fn(),
}));

vi.mock("./integration-connections.api", () => ({
  integrationConnectionsApi: api,
}));

const connection = (overrides: Record<string, unknown> = {}) => ({
  id: "connection-1",
  projectId: "project-1",
  provider: "AMPLITUDE",
  displayName: "Amplitude production",
  region: "EU",
  remoteProjectLabel: "Production EU",
  inboundEnabled: false,
  outboundEnabled: true,
  lifecycle: "DRAFT",
  health: "UNKNOWN",
  outboundCircuitOpenUntil: null,
  outboundCircuitPermanent: false,
  outboundCircuitReason: null,
  credential: {
    fingerprint: "a1b2c3d4e5f60708",
    revision: 1,
    testedRevision: null,
    rotatedAt: "2026-08-03T10:00:00.000Z",
  },
  lastSuccessfulTestAt: null,
  lastTestErrorCode: null,
  version: 1,
  updatedAt: "2026-08-03T10:00:00.000Z",
  ...overrides,
});

const customerIoConnection = (overrides: Record<string, unknown> = {}) =>
  connection({
    id: "customer-connection-1",
    provider: "CUSTOMER_IO",
    displayName: "Customer journeys",
    remoteProjectLabel: "Journeys EU",
    ...overrides,
  });

const testResult = (overrides: Record<string, unknown> = {}) => ({
  id: "test-1",
  projectId: "project-1",
  connectionId: "connection-1",
  credentialRevision: 1,
  status: "SUCCEEDED",
  attemptCount: 1,
  errorCode: null,
  connectionResultVersion: 2,
  createdAt: "2026-08-03T10:01:00.000Z",
  startedAt: "2026-08-03T10:01:00.000Z",
  finishedAt: "2026-08-03T10:01:01.000Z",
  ...overrides,
});

function mountCard(
  props: Partial<{
    projectId: string;
    canRead: boolean;
    canManage: boolean;
    provider: "AMPLITUDE" | "CUSTOMER_IO";
  }> = {},
) {
  return mount(IntegrationConnectionsCard, {
    props: {
      projectId: "project-1",
      canRead: true,
      canManage: true,
      ...props,
    },
  });
}

describe("IntegrationConnectionsCard", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    window.sessionStorage.clear();
    api.list.mockResolvedValue({ items: [] });
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
  });

  it("shows a permanent outbound credential circuit and its recovery cue", async () => {
    api.list.mockResolvedValue({
      items: [
        connection({
          lifecycle: "ACTIVE",
          health: "FAILING",
          outboundCircuitOpenUntil: "9999-12-31T23:59:59.000Z",
          outboundCircuitPermanent: true,
          outboundCircuitReason: "AMPLITUDE_DELIVERY_CREDENTIAL_REJECTED",
        }),
      ],
    });

    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.text()).toContain("Ключ отклонён — нужна проверка");
    expect(wrapper.text()).toContain("Открыт до проверки ключа");
    expect(wrapper.text()).toContain("AMPLITUDE_DELIVERY_CREDENTIAL_REJECTED");
  });

  it("ignores inbound-only connections without an outbound credential", async () => {
    api.list.mockResolvedValue({
      items: [
        connection({
          id: "inbound-only",
          inboundEnabled: true,
          outboundEnabled: false,
          credential: null,
        }),
        connection({ id: "outbound-ready" }),
      ],
    });

    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.text()).toContain("Amplitude production");
    expect(wrapper.find('[data-connection-id="inbound-only"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-connection-id="outbound-ready"]').exists()).toBe(
      true,
    );
  });

  it("renders multiple project-scoped connections read-only without secret controls", async () => {
    api.list.mockResolvedValue({
      items: [
        connection(),
        connection({ id: "connection-2", displayName: "Amplitude sandbox" }),
        connection({ id: "foreign", projectId: "project-2" }),
      ],
    });
    const wrapper = mountCard({ canManage: false });
    await flushPromises();

    expect(wrapper.findAll(".provider-connection")).toHaveLength(2);
    expect(wrapper.text()).toContain("Amplitude production");
    expect(wrapper.text()).toContain("Amplitude sandbox");
    expect(wrapper.find('input[name="amplitudeProjectApiKey"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('input[name="amplitudeRotationKey"]').exists()).toBe(
      false,
    );
    expect(wrapper.html()).not.toContain("projectApiKey");
  });

  it("keeps verified connections compact and opens creation explicitly", async () => {
    api.list.mockResolvedValue({
      items: [
        connection({
          health: "HEALTHY",
          credential: {
            ...connection().credential,
            testedRevision: 1,
          },
        }),
      ],
    });
    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.get('[data-status="HEALTHY"]').text()).toBe("Проверено");
    expect(
      wrapper.get("details.connection-settings").attributes("open"),
    ).toBeUndefined();
    expect(wrapper.find('form[data-form="create-amplitude"]').exists()).toBe(
      false,
    );

    await wrapper.get(".provider-create-toggle").trigger("click");

    expect(wrapper.get('form[data-form="create-amplitude"]').isVisible()).toBe(
      true,
    );
    expect(wrapper.text()).toContain("Новое подключение");
  });

  it("creates once, clears the write-only key immediately and polls the durable test with GET", async () => {
    vi.useFakeTimers();
    const created = connection();
    api.list.mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({
      items: [
        connection({
          health: "HEALTHY",
          version: 2,
          credential: {
            ...created.credential,
            testedRevision: 1,
          },
        }),
      ],
    });
    api.createAmplitude.mockResolvedValue(created);
    api.requestTest.mockResolvedValue(
      testResult({ status: "PENDING", attemptCount: 0 }),
    );
    api.getTest.mockResolvedValue(testResult());
    const wrapper = mountCard();
    await flushPromises();

    const secret = "a".repeat(32);
    await wrapper.get('input[name="amplitudeProjectApiKey"]').setValue(secret);
    void wrapper.get('form[data-form="create-amplitude"]').trigger("submit");
    await flushPromises();

    expect(
      wrapper.find('input[name="amplitudeProjectApiKey"]').exists(),
    ).toBe(false);
    expect(api.createAmplitude).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        displayName: "Основная Amplitude",
        region: "EU",
        projectApiKey: secret,
      }),
      expect.any(String),
    );
    expect(api.requestTest).toHaveBeenCalledOnce();
    expect(api.getTest).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();

    expect(api.requestTest).toHaveBeenCalledOnce();
    expect(api.getTest).toHaveBeenCalledWith(
      "project-1",
      "connection-1",
      "test-1",
    );
    expect(wrapper.text()).toContain("Amplitude приняла тестовое событие");
    expect(wrapper.html()).not.toContain(secret);
    expect(wrapper.emitted("connectionsChanged")).toBeTruthy();
  });

  it("requires acknowledgement before a Customer.io test can create remote data", async () => {
    api.list.mockResolvedValue({ items: [customerIoConnection()] });
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    const wrapper = mountCard({ provider: "CUSTOMER_IO" });
    await flushPromises();

    await wrapper.get('[data-action="test-customer-io"]').trigger("click");

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("может создать профиль в Customer.io"),
    );
    expect(api.requestTest).not.toHaveBeenCalled();
  });

  it("requires a Customer.io workspace canary acknowledgement before activation", async () => {
    api.list.mockResolvedValue({
      items: [
        customerIoConnection({
          health: "HEALTHY",
          credential: {
            ...customerIoConnection().credential,
            testedRevision: 1,
          },
        }),
      ],
    });
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    const wrapper = mountCard({ provider: "CUSTOMER_IO" });
    await flushPromises();

    await wrapper.get('[data-action="activate-customer-io"]').trigger("click");

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("нужном проекте Customer.io"),
    );
    expect(api.activate).not.toHaveBeenCalled();
  });

  it("retries an ambiguous credential rotation with the same payload and idempotency key", async () => {
    const current = connection({
      lifecycle: "ACTIVE",
      health: "HEALTHY",
      version: 4,
    });
    const rotated = connection({
      lifecycle: "PAUSED",
      health: "UNKNOWN",
      version: 5,
      credential: { ...current.credential, revision: 2, testedRevision: null },
    });
    api.list.mockResolvedValue({ items: [current] });
    api.rotateAmplitude
      .mockRejectedValueOnce(new ApiError(0, "network outcome unknown"))
      .mockResolvedValueOnce(rotated);
    api.requestTest.mockResolvedValue(testResult({ credentialRevision: 2 }));
    const wrapper = mountCard();
    await flushPromises();

    const secret = "b".repeat(32);
    await wrapper.get('input[name="amplitudeRotationKey"]').setValue(secret);
    await wrapper.get('form[data-form="rotate-amplitude"]').trigger("submit");
    await flushPromises();

    expect(
      (
        wrapper.get('input[name="amplitudeRotationKey"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("");
    expect(wrapper.text()).toContain("Сервер не подтвердил результат");
    expect(wrapper.html()).not.toContain(secret);
    await wrapper.get(".provider-create-toggle").trigger("click");
    expect(
      wrapper
        .get('input[name="amplitudeProjectApiKey"]')
        .attributes("disabled"),
    ).toBeDefined();
    expect(
      wrapper.find('[data-action="discard-rotate-amplitude"]').exists(),
    ).toBe(true);
    const firstCall = api.rotateAmplitude.mock.calls[0];

    await wrapper.get('input[name="amplitudeRotationKey"]').setValue(secret);
    await wrapper
      .get('[data-action="retry-rotate-amplitude"]')
      .trigger("click");
    await flushPromises();

    expect(api.rotateAmplitude).toHaveBeenCalledTimes(2);
    expect(api.rotateAmplitude.mock.calls[1]).toEqual(firstCall);
    expect(api.requestTest).toHaveBeenCalledWith(
      "project-1",
      "connection-1",
      { expectedVersion: 5 },
      expect.any(String),
    );
    expect(wrapper.text()).toContain(
      "Новый Project API Key сохранён и проверен",
    );
  });

  it("keeps the credential receipt after an idempotency conflict", async () => {
    const originalSecret = "d".repeat(32);
    api.createAmplitude
      .mockRejectedValueOnce(new ApiError(0, "create outcome unknown"))
      .mockRejectedValueOnce(
        new ApiError(
          409,
          "conflict",
          undefined,
          undefined,
          "IDEMPOTENCY_KEY_CONFLICT",
        ),
      )
      .mockResolvedValueOnce(connection());
    api.requestTest.mockResolvedValue(testResult());
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .get('input[name="amplitudeProjectApiKey"]')
      .setValue(originalSecret);
    await wrapper.get('form[data-form="create-amplitude"]').trigger("submit");
    await flushPromises();
    const firstCall = api.createAmplitude.mock.calls[0];

    await wrapper
      .get('input[name="amplitudeProjectApiKey"]')
      .setValue("e".repeat(32));
    await wrapper
      .get('[data-action="retry-create-amplitude"]')
      .trigger("click");
    await flushPromises();

    expect(
      wrapper.find('[data-action="retry-create-amplitude"]').exists(),
    ).toBe(true);
    expect(
      window.sessionStorage.getItem(
        "lola:amplitude-unresolved-secret:project-1",
      ),
    ).not.toBeNull();

    await wrapper
      .get('input[name="amplitudeProjectApiKey"]')
      .setValue(originalSecret);
    await wrapper
      .get('[data-action="retry-create-amplitude"]')
      .trigger("click");
    await flushPromises();

    expect(api.createAmplitude.mock.calls[2]).toEqual(firstCall);
    expect(
      window.sessionStorage.getItem(
        "lola:amplitude-unresolved-secret:project-1",
      ),
    ).toBeNull();
  });

  it("isolates Customer.io connections, credentials, and retry receipts from Amplitude", async () => {
    api.list.mockResolvedValue({
      items: [connection(), customerIoConnection()],
    });
    api.createCustomerIo.mockRejectedValue(
      new ApiError(0, "network outcome unknown"),
    );
    window.sessionStorage.setItem(
      "lola:amplitude-unresolved-secret:project-1",
      JSON.stringify({
        projectId: "project-1",
        operation: "CREATE",
        idempotencyKey: "amplitude-command",
        createdAt: "2026-08-03T10:00:00.000Z",
      }),
    );

    const wrapper = mountCard({ provider: "CUSTOMER_IO" } as never);
    await flushPromises();

    expect(wrapper.findAll(".provider-connection")).toHaveLength(1);
    expect(wrapper.text()).toContain("Customer journeys");
    expect(wrapper.text()).not.toContain("Amplitude production");
    expect(wrapper.find('[data-integration="customer-io"]').exists()).toBe(
      true,
    );
    await wrapper.get(".provider-create-toggle").trigger("click");
    const secret = wrapper.get('input[name="customerIoSourceApiKey"]');
    await secret.setValue("customer-source-key");
    await wrapper.get('form[data-form="create-customer-io"]').trigger("submit");
    await flushPromises();

    expect(api.createCustomerIo).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        displayName: "Основной Customer.io",
        region: "EU",
        sourceApiKey: "customer-source-key",
      }),
      expect.any(String),
    );
    expect(wrapper.html()).not.toContain("customer-source-key");
    expect(
      window.sessionStorage.getItem(
        "lola:customer-io-unresolved-secret:project-1",
      ),
    ).not.toBeNull();
    expect(
      window.sessionStorage.getItem(
        "lola:amplitude-unresolved-secret:project-1",
      ),
    ).not.toBeNull();
  });

  it("resumes a persisted durable test with GET after polling failed", async () => {
    vi.useFakeTimers();
    const current = connection();
    api.list.mockResolvedValue({ items: [current] });
    api.requestTest.mockResolvedValue(
      testResult({ status: "PENDING", attemptCount: 0 }),
    );
    api.getTest.mockRejectedValueOnce(new ApiError(0, "poll failed"));
    const first = mountCard();
    await flushPromises();

    void first.get('[data-action="test-amplitude"]').trigger("click");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();

    expect(api.requestTest).toHaveBeenCalledOnce();
    expect(
      window.sessionStorage.getItem("lola:amplitude-pending-tests:project-1"),
    ).toContain("test-1");
    first.unmount();

    api.getTest.mockResolvedValueOnce(testResult());
    const resumed = mountCard();
    await flushPromises();
    await resumed.get('[data-action="test-amplitude"]').trigger("click");
    await flushPromises();

    expect(api.requestTest).toHaveBeenCalledOnce();
    expect(api.getTest).toHaveBeenLastCalledWith(
      "project-1",
      "connection-1",
      "test-1",
    );
    expect(
      window.sessionStorage.getItem("lola:amplitude-pending-tests:project-1"),
    ).toBeNull();
    expect(resumed.text()).toContain("Amplitude приняла тестовое событие");
  });

  it("replays an ambiguous test POST with the same durable idempotency key after remount", async () => {
    const current = connection();
    api.list.mockResolvedValue({ items: [current] });
    api.requestTest.mockRejectedValueOnce(
      new ApiError(0, "request outcome unknown"),
    );
    const first = mountCard();
    await flushPromises();

    await first.get('[data-action="test-amplitude"]').trigger("click");
    await flushPromises();

    const firstRequest = api.requestTest.mock.calls[0];
    expect(firstRequest).toEqual([
      "project-1",
      "connection-1",
      { expectedVersion: 1 },
      expect.any(String),
    ]);
    expect(
      window.sessionStorage.getItem("lola:amplitude-pending-tests:project-1"),
    ).toContain("REQUESTING");
    first.unmount();

    api.requestTest.mockResolvedValueOnce(testResult());
    const resumed = mountCard();
    await flushPromises();
    await resumed.get('[data-action="test-amplitude"]').trigger("click");
    await flushPromises();

    expect(api.requestTest).toHaveBeenCalledTimes(2);
    expect(api.requestTest.mock.calls[1]).toEqual(firstRequest);
    expect(api.getTest).not.toHaveBeenCalled();
    expect(
      window.sessionStorage.getItem("lola:amplitude-pending-tests:project-1"),
    ).toBeNull();
  });

  it("never reuses a pending test from an older credential revision", async () => {
    const rotated = connection({
      version: 7,
      credential: {
        ...connection().credential,
        revision: 2,
        testedRevision: null,
      },
    });
    window.sessionStorage.setItem(
      "lola:amplitude-pending-tests:project-1",
      JSON.stringify([
        {
          state: "POLLING",
          projectId: "project-1",
          connectionId: "connection-1",
          credentialRevision: 1,
          testId: "old-test",
        },
      ]),
    );
    api.list.mockResolvedValue({ items: [rotated] });
    api.requestTest.mockResolvedValue(
      testResult({ id: "new-test", credentialRevision: 2 }),
    );
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.get('[data-action="test-amplitude"]').trigger("click");
    await flushPromises();

    expect(api.getTest).not.toHaveBeenCalled();
    expect(api.requestTest).toHaveBeenCalledWith(
      "project-1",
      "connection-1",
      { expectedVersion: 7 },
      expect.any(String),
    );
    expect(wrapper.text()).toContain("Amplitude приняла тестовое событие");
  });

  it("keeps a nonsensitive credential guard after remount until reconciliation", async () => {
    api.createAmplitude
      .mockRejectedValueOnce(new ApiError(0, "create outcome unknown"))
      .mockResolvedValueOnce(connection());
    api.requestTest.mockResolvedValue(testResult());
    const first = mountCard();
    await flushPromises();

    await first
      .get('input[name="amplitudeProjectApiKey"]')
      .setValue("c".repeat(32));
    await first.get('form[data-form="create-amplitude"]').trigger("submit");
    await flushPromises();

    expect(
      window.sessionStorage.getItem(
        "lola:amplitude-unresolved-secret:project-1",
      ),
    ).not.toContain("c".repeat(32));
    expect(api.createAmplitude).toHaveBeenCalledOnce();
    const firstCall = api.createAmplitude.mock.calls[0];
    first.unmount();

    const resumed = mountCard();
    await flushPromises();

    expect(
      resumed.find('[data-action="retry-create-amplitude"]').exists(),
    ).toBe(true);
    expect(
      resumed
        .get('input[name="amplitudeProjectApiKey"]')
        .attributes("disabled"),
    ).toBeUndefined();
    expect(api.createAmplitude).toHaveBeenCalledOnce();

    await resumed
      .get('input[name="amplitudeProjectApiKey"]')
      .setValue("c".repeat(32));
    await resumed
      .get('[data-action="retry-create-amplitude"]')
      .trigger("click");
    await flushPromises();

    expect(api.createAmplitude).toHaveBeenCalledTimes(2);
    expect(api.createAmplitude.mock.calls[1]).toEqual(firstCall);
    expect(
      window.sessionStorage.getItem(
        "lola:amplitude-unresolved-secret:project-1",
      ),
    ).toBeNull();
  });

  it("renders archived connections as read-only terminal state", async () => {
    api.list.mockResolvedValue({
      items: [
        connection({
          lifecycle: "ARCHIVED",
          health: "HEALTHY",
          credential: { ...connection().credential, testedRevision: 1 },
        }),
      ],
    });
    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.text()).toContain("В архиве");
    expect(wrapper.text()).toContain("доступно только для просмотра");
    expect(wrapper.find('[data-action="test-amplitude"]').exists()).toBe(false);
    expect(wrapper.find('form[data-form="update-amplitude"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('form[data-form="rotate-amplitude"]').exists()).toBe(
      false,
    );
  });

  it("ignores a stale list response after the selected project changes", async () => {
    let resolveFirst!: (value: {
      items: ReturnType<typeof connection>[];
    }) => void;
    api.list
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({
        items: [
          connection({
            id: "connection-2",
            projectId: "project-2",
            displayName: "Project Two",
          }),
        ],
      });
    const wrapper = mountCard();
    await wrapper.setProps({ projectId: "project-2" });
    await flushPromises();

    resolveFirst({ items: [connection({ displayName: "Stale Project One" })] });
    await flushPromises();

    expect(wrapper.text()).toContain("Project Two");
    expect(wrapper.text()).not.toContain("Stale Project One");
  });

  it("reloads after an OCC conflict and activates only the current tested revision", async () => {
    const tested = connection({
      health: "HEALTHY",
      version: 4,
      credential: {
        ...connection().credential,
        revision: 2,
        testedRevision: 2,
      },
    });
    api.list.mockResolvedValueOnce({ items: [tested] }).mockResolvedValueOnce({
      items: [connection({ ...tested, version: 5 })],
    });
    api.updateAmplitude.mockRejectedValue(
      new ApiError(
        409,
        "row changed",
        undefined,
        undefined,
        "INTEGRATION_CONNECTION_VERSION_CONFLICT",
      ),
    );
    api.activate.mockResolvedValue(
      connection({ ...tested, lifecycle: "ACTIVE", version: 6 }),
    );
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .get('form[data-form="update-amplitude"] input')
      .setValue("Renamed");
    await wrapper.get('form[data-form="update-amplitude"]').trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("изменилось в другой вкладке");
    expect(api.list).toHaveBeenCalledTimes(2);
    await wrapper.get('[data-action="activate-amplitude"]').trigger("click");
    await flushPromises();

    expect(api.activate).toHaveBeenCalledWith(
      "project-1",
      "connection-1",
      { expectedVersion: 5 },
      expect.any(String),
    );
  });
});
