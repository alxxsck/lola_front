import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AmplitudeEventRoutesCard from "./AmplitudeEventRoutesCard.vue";

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  listDefinitions: vi.fn(),
  listActivity: vi.fn(),
  create: vi.fn(),
  publish: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  listConnections: vi.fn(),
}));

vi.mock("./integration-event-routes.api", () => ({
  integrationEventRoutesApi: {
    list: mocks.listRoutes,
    listEventDefinitions: mocks.listDefinitions,
    listActivity: mocks.listActivity,
    createAmplitude: mocks.create,
    publish: mocks.publish,
    enable: mocks.enable,
    disable: mocks.disable,
  },
}));

vi.mock(
  "@/features/integration-connections/integration-connections.api",
  () => ({
    integrationConnectionsApi: { list: mocks.listConnections },
  }),
);

const route = (overrides: Record<string, unknown> = {}) => ({
  id: "route-1",
  projectId: "project-1",
  connectionId: "connection-1",
  direction: "OUTBOUND",
  name: "Депозиты",
  description: null,
  lifecycle: "DRAFT",
  enabled: false,
  enablementVersion: 1,
  version: 1,
  draftRevision: {
    id: "revision-1",
    revision: 1,
    state: "DRAFT",
    provider: "AMPLITUDE",
    region: "EU",
    eventDefinitionKeyId: "event-key-1",
    eventDefinitionRevisionId: "event-revision-1",
    providerEventName: "deposit",
    propertyBindings: [
      { sourcePath: ["amount"], targetKey: "amount", required: true },
    ],
    compiledHash: "hash",
    compilerVersion: "integration-route-compiler.v1",
    createdAt: "2026-08-03T12:00:00.000Z",
    publishedAt: null,
  },
  publishedRevision: null,
  updatedAt: "2026-08-03T12:00:00.000Z",
  ...overrides,
});

describe("AmplitudeEventRoutesCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "command-key") });
    mocks.listRoutes.mockResolvedValue({ items: [route()] });
    mocks.listConnections.mockResolvedValue({
      items: [
        {
          id: "connection-1",
          projectId: "project-1",
          provider: "AMPLITUDE",
          displayName: "Amplitude production",
          region: "EU",
          remoteProjectLabel: null,
          inboundEnabled: false,
          outboundEnabled: true,
          lifecycle: "ACTIVE",
          health: "HEALTHY",
          credential: {
            fingerprint: "1234567890abcdef",
            revision: 1,
            testedRevision: 1,
            rotatedAt: "2026-08-03T12:00:00.000Z",
          },
          lastSuccessfulTestAt: "2026-08-03T12:00:00.000Z",
          lastTestErrorCode: null,
          version: 1,
          updatedAt: "2026-08-03T12:00:00.000Z",
        },
      ],
    });
    mocks.listDefinitions.mockResolvedValue([
      {
        id: "event-key-1",
        projectId: "project-1",
        code: "deposit_completed",
        name: "Депозит завершён",
        description: null,
        lifecycle: "ACTIVE",
        lifecycleVersion: 1,
        lifecycleUpdatedAt: "2026-08-03T12:00:00.000Z",
        metadataUpdatedAt: "2026-08-03T12:00:00.000Z",
        origin: "CUSTOM",
        readOnly: false,
        policy: {},
        currentRevision: {
          id: "event-revision-1",
          number: 1,
          publishedAt: "2026-08-03T12:00:00.000Z",
          payloadSchema: {
            type: "object",
            properties: {
              amount: { type: "number" },
              internalNote: { type: "string", "x-lola-sensitive": true },
              payment_currency: { type: "string" },
              user_id: { type: "string" },
              constructor: { type: "string" },
              prototype: { type: "string" },
              "bad.segment": { type: "string" },
              "9invalid": { type: "string" },
              toString: { type: "string" },
              payment: {
                type: "object",
                properties: {
                  currency: { type: "string" },
                  metadata: { type: "object" },
                },
              },
              level1: {
                type: "object",
                properties: {
                  level2: {
                    type: "object",
                    properties: {
                      level3: {
                        type: "object",
                        properties: {
                          level4: {
                            type: "object",
                            properties: {
                              level5: {
                                type: "object",
                                properties: {
                                  level6: {
                                    type: "object",
                                    properties: {
                                      level7: {
                                        type: "object",
                                        properties: {
                                          level8: {
                                            type: "object",
                                            properties: {
                                              tooDeep: { type: "string" },
                                            },
                                          },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ]);
    mocks.listActivity.mockResolvedValue({
      items: [
        {
          id: "dispatch-1",
          connectionId: "connection-1",
          routeId: "route-1",
          routeRevisionId: "revision-1",
          eventId: "event-1",
          provider: "AMPLITUDE",
          providerEventName: "deposit",
          providerIdempotencyId: "lola:event-1",
          occurredAt: "2026-08-03T12:00:00.000Z",
          status: "DELIVERED",
          attemptCount: 1,
          errorCode: null,
          createdAt: "2026-08-03T12:00:00.000Z",
          finishedAt: "2026-08-03T12:00:01.000Z",
        },
      ],
    });
    mocks.create.mockResolvedValue(route());
    mocks.publish.mockResolvedValue(
      route({ draftRevision: null, lifecycle: "ACTIVE", version: 2 }),
    );
  });

  it("shows safe delivery activity but no mutation controls to a reader", async () => {
    const wrapper = mount(AmplitudeEventRoutesCard, {
      props: {
        projectId: "project-1",
        canRead: true,
        canManage: false,
        canReadActivity: true,
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Депозиты");
    expect(wrapper.text()).toContain("Доставлено");
    expect(wrapper.text()).not.toContain("Создать маршрут");
    expect(wrapper.text()).not.toContain("Опубликовать");
  });

  it("creates an explicit allowlist mapping and publishes a draft", async () => {
    const wrapper = mount(AmplitudeEventRoutesCard, {
      props: {
        projectId: "project-1",
        canRead: true,
        canManage: true,
        canReadActivity: false,
      },
    });
    await flushPromises();

    await wrapper.get("button").trigger("click");
    const selects = wrapper.findAll("select");
    await selects[1]!.setValue("event-key-1");
    await flushPromises();
    const textInputs = wrapper.findAll('input:not([type="checkbox"])');
    await textInputs[0]!.setValue("Новый маршрут");
    await textInputs[1]!.setValue("deposit_completed");
    const checkboxes = wrapper.findAll('input[type="checkbox"]');
    expect(checkboxes[1]!.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("Не экспортируется");
    expect(wrapper.text()).toContain("payment.currency");
    expect(wrapper.text()).not.toContain("payment.metadata");
    expect(wrapper.text()).not.toContain("constructor");
    expect(wrapper.text()).not.toContain("prototype");
    expect(wrapper.text()).not.toContain("bad.segment");
    expect(wrapper.text()).not.toContain("9invalid");
    expect(wrapper.text()).toContain("toString");
    expect(wrapper.text()).not.toContain(
      "level1.level2.level3.level4.level5.level6.level7.level8.tooDeep",
    );
    expect(wrapper.find('input[placeholder="event_user_id"]').exists()).toBe(
      true,
    );
    const collidingDefaults = wrapper
      .findAll(".mapping-row")
      .filter(
        (row) =>
          row.text().includes("payment.currency") ||
          row.text().includes("payment_currency"),
      )
      .map((row) =>
        row.get('input:not([type="checkbox"])').attributes("placeholder"),
      );
    expect(new Set(collidingDefaults).size).toBe(2);
    expect(collidingDefaults).toContain("payment_currency");
    expect(collidingDefaults).toContainEqual(
      expect.stringMatching(/^payment_currency_[a-z0-9]{7}$/),
    );
    await checkboxes[0]!.setValue(true);
    const nestedRow = wrapper
      .findAll(".mapping-row")
      .find((row) => row.text().includes("payment.currency"));
    expect(nestedRow).toBeDefined();
    await nestedRow!.get('input[type="checkbox"]').setValue(true);
    await flushPromises();
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(mocks.create).toHaveBeenCalledWith(
      "project-1",
      {
        connectionId: "connection-1",
        name: "Новый маршрут",
        eventDefinitionKeyId: "event-key-1",
        eventDefinitionRevisionId: "event-revision-1",
        providerEventName: "deposit_completed",
        propertyBindings: [
          { sourcePath: ["amount"], targetKey: "amount", required: false },
          {
            sourcePath: ["payment", "currency"],
            targetKey: expect.stringMatching(
              /^payment_currency(?:_[a-z0-9]{7})?$/,
            ),
            required: false,
          },
        ],
      },
      "command-key",
    );

    const publishButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Опубликовать");
    expect(publishButton).toBeDefined();
    await publishButton!.trigger("click");
    await flushPromises();
    expect(mocks.publish).toHaveBeenCalledWith(
      "project-1",
      "route-1",
      { expectedVersion: 1, reason: "Публикация через CMS" },
      "command-key",
    );
  });

  it("caps the property allowlist at the API limit of 32 bindings", async () => {
    const properties = Object.fromEntries(
      Array.from({ length: 33 }, (_, index) => [
        `field_${String(index + 1).padStart(2, "0")}`,
        { type: "string" },
      ]),
    );
    mocks.listDefinitions.mockResolvedValueOnce([
      {
        id: "event-key-1",
        projectId: "project-1",
        code: "large_event",
        name: "Большое событие",
        description: null,
        lifecycle: "ACTIVE",
        lifecycleVersion: 1,
        lifecycleUpdatedAt: "2026-08-03T12:00:00.000Z",
        metadataUpdatedAt: "2026-08-03T12:00:00.000Z",
        origin: "CUSTOM",
        readOnly: false,
        policy: {},
        currentRevision: {
          id: "event-revision-1",
          number: 1,
          publishedAt: "2026-08-03T12:00:00.000Z",
          payloadSchema: { type: "object", properties },
        },
      },
    ]);
    const wrapper = mount(AmplitudeEventRoutesCard, {
      props: {
        projectId: "project-1",
        canRead: true,
        canManage: true,
        canReadActivity: false,
      },
    });
    await flushPromises();

    await wrapper.get("button").trigger("click");
    await wrapper.findAll("select")[1]!.setValue("event-key-1");
    await flushPromises();
    const toggles = wrapper.findAll('.mapping-toggle input[type="checkbox"]');
    expect(toggles).toHaveLength(33);
    for (const toggle of toggles.slice(0, 32)) await toggle.setValue(true);
    await flushPromises();

    expect(toggles[0]!.attributes("disabled")).toBeUndefined();
    expect(toggles[31]!.attributes("disabled")).toBeUndefined();
    expect(toggles[32]!.attributes("disabled")).toBeDefined();
    expect(
      wrapper
        .findAll("button")
        .find((button) => button.text() === "Создать черновик")
        ?.attributes("disabled"),
    ).toBeUndefined();
  });

  it("clears Project data before a tenant switch finishes loading", async () => {
    let resolveRoutes: ((value: { items: unknown[] }) => void) | undefined;
    const wrapper = mount(AmplitudeEventRoutesCard, {
      props: {
        projectId: "project-1",
        canRead: true,
        canManage: false,
        canReadActivity: true,
      },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("Депозиты");
    mocks.listRoutes.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRoutes = resolve;
        }),
    );

    await wrapper.setProps({ projectId: "project-2" });
    await Promise.resolve();
    expect(wrapper.text()).not.toContain("Депозиты");
    expect(wrapper.text()).not.toContain("Доставлено");
    resolveRoutes?.({ items: [] });
    await flushPromises();
  });

  it("retries an ambiguous create after remount with the same durable key", async () => {
    mocks.create.mockRejectedValueOnce(new Error("network unavailable"));
    const first = mount(AmplitudeEventRoutesCard, {
      props: {
        projectId: "project-1",
        canRead: true,
        canManage: true,
        canReadActivity: false,
      },
    });
    await flushPromises();
    await first.get("button").trigger("click");
    const selects = first.findAll("select");
    await selects[1]!.setValue("event-key-1");
    await flushPromises();
    const textInputs = first.findAll('input:not([type="checkbox"])');
    await textInputs[0]!.setValue("Новый маршрут");
    await textInputs[1]!.setValue("deposit_completed");
    await first.findAll('input[type="checkbox"]')[0]!.setValue(true);
    await first.get("form").trigger("submit");
    await flushPromises();
    expect(
      window.sessionStorage.getItem(
        "lola:amplitude-pending-route-create:project-1",
      ),
    ).toContain("command-key");
    first.unmount();

    mocks.create.mockResolvedValueOnce(route());
    const second = mount(AmplitudeEventRoutesCard, {
      props: {
        projectId: "project-1",
        canRead: true,
        canManage: true,
        canReadActivity: false,
      },
    });
    await flushPromises();
    expect(mocks.create).toHaveBeenLastCalledWith(
      "project-1",
      expect.objectContaining({ name: "Новый маршрут" }),
      "command-key",
    );
    expect(
      window.sessionStorage.getItem(
        "lola:amplitude-pending-route-create:project-1",
      ),
    ).toBeNull();
    second.unmount();
  });
});
