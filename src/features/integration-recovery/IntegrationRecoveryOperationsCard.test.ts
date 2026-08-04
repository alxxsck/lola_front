import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import IntegrationRecoveryOperationsCard from "./IntegrationRecoveryOperationsCard.vue";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  listConnections: vi.fn(),
  cancelDispatch: vi.fn(),
  replayDispatch: vi.fn(),
  replayIngress: vi.fn(),
  quarantineIngress: vi.fn(),
  changeDirectionPause: vi.fn(),
}));

vi.mock("./integration-recovery.api", () => ({ integrationRecoveryApi: api }));

const operation = (overrides: Record<string, unknown> = {}) => ({
  id: "operation-1",
  operationKind: "DISPATCH",
  direction: "OUTBOUND",
  provider: "AMPLITUDE",
  connectionId: "connection-1",
  routeId: "route-1",
  status: "FAILED_PERMANENT",
  failureCode: "REMOTE_REJECTED",
  attemptCount: 2,
  operationsVersion: 3,
  lastRecoveryOperationId: null,
  createdAt: "2026-08-04T10:00:00.000Z",
  updatedAt: "2026-08-04T10:02:00.000Z",
  finishedAt: "2026-08-04T10:02:00.000Z",
  ...overrides,
});

const connection = (overrides: Record<string, unknown> = {}) => ({
  id: "connection-1",
  projectId: "project-1",
  displayName: "Product analytics",
  provider: "AMPLITUDE",
  region: "US",
  lifecycle: "ACTIVE",
  health: "HEALTHY",
  inboundEnabled: true,
  outboundEnabled: true,
  inboundPaused: false,
  outboundPaused: false,
  version: 7,
  credential: null,
  inbound: {},
  lastSuccessfulTestAt: null,
  lastTestErrorCode: null,
  outboundCircuitOpenUntil: null,
  outboundCircuitPermanent: false,
  outboundCircuitReason: null,
  remoteProjectLabel: null,
  updatedAt: "2026-08-04T10:00:00.000Z",
  ...overrides,
});

function mountCard(canManage = true) {
  return mount(IntegrationRecoveryOperationsCard, {
    props: {
      projectId: "project-1",
      canReadActivity: true,
      canReadIntegrations: true,
      canManage,
    },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("IntegrationRecoveryOperationsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockResolvedValue({ items: [operation()] });
    api.listConnections.mockResolvedValue({ items: [connection()] });
    api.detail.mockResolvedValue({
      ...operation(),
      attempts: [],
      recoveryCommands: [],
      reconciliationRepairs: [],
    });
    api.replayDispatch.mockResolvedValue({});
    api.replayIngress.mockResolvedValue({});
    api.quarantineIngress.mockResolvedValue({});
    api.cancelDispatch.mockResolvedValue({});
    api.changeDirectionPause.mockResolvedValue({});
    vi.stubGlobal(
      "prompt",
      vi.fn(() => "Проверка оператором"),
    );
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "recovery-command-key"),
    });
  });

  it("keeps safe list and detail available in read-only mode without commands", async () => {
    const wrapper = mountCard(false);
    await flushPromises();

    expect(api.list).toHaveBeenCalledWith("project-1", { limit: 50 });
    expect(wrapper.text()).toContain("Режим просмотра");
    expect(wrapper.text()).toContain("FAILED_PERMANENT");
    expect(wrapper.text()).not.toContain("Повторить");
    expect(wrapper.get("button").text()).toBe("Обновить");
    expect(
      wrapper
        .findAll("button")
        .filter((button) => button.text() === "Пауза приёма")[0]
        ?.attributes("disabled"),
    ).toBeDefined();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Детали")!
      .trigger("click");
    await flushPromises();

    expect(api.detail).toHaveBeenCalledWith(
      "project-1",
      "DISPATCH",
      "operation-1",
    );
    expect(wrapper.text()).toContain("Детали операции");
  });

  it("does not render a late operation detail after switching Project", async () => {
    const oldDetail = deferred<
      ReturnType<typeof operation> & {
        attempts: never[];
        recoveryCommands: never[];
        reconciliationRepairs: never[];
      }
    >();
    api.list
      .mockResolvedValueOnce({ items: [operation()] })
      .mockResolvedValueOnce({ items: [] });
    api.detail.mockReturnValueOnce(oldDetail.promise);
    const wrapper = mountCard(false);
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Детали")!
      .trigger("click");
    await wrapper.setProps({ projectId: "project-2" });
    await flushPromises();
    oldDetail.resolve({
      ...operation({ failureCode: "OLD_PROJECT_SECRET" }),
      attempts: [],
      recoveryCommands: [],
      reconciliationRepairs: [],
    });
    await flushPromises();

    expect(api.detail).toHaveBeenCalledWith(
      "project-1",
      "DISPATCH",
      "operation-1",
    );
    expect(api.list).toHaveBeenLastCalledWith("project-2", { limit: 50 });
    expect(wrapper.text()).not.toContain("Детали операции");
    expect(wrapper.text()).not.toContain("OLD_PROJECT_SECRET");
  });

  it("requires duplicate-risk acknowledgement and sends an OCC-pinned dispatch replay", async () => {
    api.list
      .mockResolvedValueOnce({
        items: [operation({ status: "OUTCOME_UNKNOWN", operationsVersion: 8 })],
      })
      .mockResolvedValue({ items: [] });
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Повторить")!
      .trigger("click");
    await flushPromises();

    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(api.replayDispatch).toHaveBeenCalledWith(
      "project-1",
      "operation-1",
      {
        acknowledgeDuplicateRisk: true,
        expectedOperationsVersion: 8,
        expectedState: "OUTCOME_UNKNOWN",
        reason: "Проверка оператором",
      },
      "recovery-command-key",
    );
    expect(wrapper.text()).toContain("поставлена в очередь");
  });

  it("pins connection version and pause state when pausing one direction", async () => {
    api.list.mockResolvedValue({ items: [] });
    api.listConnections
      .mockResolvedValueOnce({ items: [connection()] })
      .mockResolvedValue({
        items: [connection({ inboundPaused: true, version: 8 })],
      });
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Пауза приёма")!
      .trigger("click");
    await flushPromises();

    expect(api.changeDirectionPause).toHaveBeenCalledWith(
      "project-1",
      "connection-1",
      "INBOUND",
      true,
      {
        expectedPaused: false,
        expectedVersion: 7,
        reason: "Проверка оператором",
      },
      "recovery-command-key",
    );
    expect(wrapper.text()).toContain("Направление приостановлено");
  });

  it("renders connection operations as connection controls with clear pause history", async () => {
    const connectionOperation = operation({
      id: "connection-1",
      operationKind: "CONNECTION",
      direction: "INBOUND",
      routeId: null,
      status: "PAUSED",
      failureCode: null,
      attemptCount: 0,
      operationsVersion: 9,
    });
    api.list.mockResolvedValue({ items: [connectionOperation] });
    api.detail.mockResolvedValue({
      ...connectionOperation,
      attempts: [],
      reconciliationRepairs: [],
      recoveryCommands: [
        {
          id: "pause-1",
          commandType: "PAUSE_DIRECTION",
          status: "SUCCEEDED",
          expectedOperationsVersion: 7,
          resultOperationsVersion: 8,
          createdAt: "2026-08-04T10:01:00.000Z",
          completedAt: "2026-08-04T10:01:01.000Z",
        },
        {
          id: "resume-1",
          commandType: "RESUME_DIRECTION",
          status: "SUCCEEDED",
          expectedOperationsVersion: 8,
          resultOperationsVersion: 9,
          createdAt: "2026-08-04T10:02:00.000Z",
          completedAt: "2026-08-04T10:02:01.000Z",
        },
      ],
    });
    const wrapper = mountCard();
    await flushPromises();

    const row = wrapper.get("tbody tr");
    expect(row.text()).toContain("Подключение");
    expect(row.text()).not.toContain("Отправка");
    expect(row.text()).not.toContain("Повторить");
    expect(row.text()).not.toContain("Отменить");

    await row
      .findAll("button")
      .find((button) => button.text() === "Детали")!
      .trigger("click");
    await flushPromises();

    expect(api.detail).toHaveBeenCalledWith(
      "project-1",
      "CONNECTION",
      "connection-1",
    );
    expect(wrapper.text()).toContain("Пауза приёма");
    expect(wrapper.text()).toContain("Возобновление приёма");
    expect(wrapper.text()).not.toContain("PAUSE_DIRECTION");
    expect(wrapper.text()).not.toContain("RESUME_DIRECTION");
  });

  it("manually quarantines only an eligible ingress item with OCC and idempotency", async () => {
    api.list
      .mockResolvedValueOnce({
        items: [
          operation({
            operationKind: "INGRESS",
            direction: "INBOUND",
            status: "RETRY_WAIT",
            operationsVersion: 11,
          }),
        ],
      })
      .mockResolvedValue({ items: [] });
    api.detail.mockResolvedValue({
      ...operation({
        operationKind: "INGRESS",
        direction: "INBOUND",
        status: "RETRY_WAIT",
        operationsVersion: 11,
      }),
      attempts: [],
      recoveryCommands: [],
      reconciliationRepairs: [],
    });
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Детали")!
      .trigger("click");
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "В карантин")!
      .trigger("click");
    await flushPromises();

    expect(api.quarantineIngress).toHaveBeenCalledWith(
      "project-1",
      "operation-1",
      {
        expectedOperationsVersion: 11,
        expectedStatus: "RETRY_WAIT",
        reason: "Проверка оператором",
      },
      "recovery-command-key",
    );
    expect(wrapper.text()).toContain("Входящее событие помещено в карантин");
  });

  it("does not offer manual quarantine without manage permission or for terminal ingress", async () => {
    api.list.mockResolvedValue({
      items: [
        operation({
          operationKind: "INGRESS",
          direction: "INBOUND",
          status: "ACCEPTED",
        }),
      ],
    });

    const wrapper = mountCard(false);
    await flushPromises();

    expect(wrapper.text()).not.toContain("В карантин");
    expect(api.quarantineIngress).not.toHaveBeenCalled();
  });

  it("does not publish a late quarantine result after switching Project", async () => {
    const quarantineResult = deferred<Record<string, never>>();
    const ingress = operation({
      operationKind: "INGRESS",
      direction: "INBOUND",
      status: "RECEIVED",
      operationsVersion: 6,
    });
    api.list
      .mockResolvedValueOnce({ items: [ingress] })
      .mockResolvedValue({ items: [] });
    api.detail.mockResolvedValue({
      ...ingress,
      attempts: [],
      recoveryCommands: [],
      reconciliationRepairs: [],
    });
    api.quarantineIngress.mockReturnValueOnce(quarantineResult.promise);
    const wrapper = mountCard();
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Детали")!
      .trigger("click");
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "В карантин")!
      .trigger("click");
    await wrapper.setProps({ projectId: "project-2" });
    await flushPromises();

    quarantineResult.resolve({});
    await flushPromises();

    expect(api.quarantineIngress).toHaveBeenCalledWith(
      "project-1",
      "operation-1",
      expect.any(Object),
      "recovery-command-key",
    );
    expect(api.list).toHaveBeenLastCalledWith("project-2", { limit: 50 });
    expect(wrapper.text()).not.toContain("помещено в карантин");
  });
});
