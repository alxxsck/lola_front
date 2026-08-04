import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import IntegrationInboundRoutesCard from "./IntegrationInboundRoutesCard.vue";

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  listDefinitions: vi.fn(),
  listConnections: vi.fn(),
  create: vi.fn(),
  publish: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
}));
vi.mock("./integration-inbound-routes.api", () => ({
  integrationInboundRoutesApi: { create: mocks.create },
}));
vi.mock(
  "@/features/integration-event-routes/integration-event-routes.api",
  () => ({
    integrationEventRoutesApi: {
      list: mocks.listRoutes,
      listEventDefinitions: mocks.listDefinitions,
      publish: mocks.publish,
      enable: mocks.enable,
      disable: mocks.disable,
    },
  }),
);
vi.mock(
  "@/features/integration-inbound-connections/integration-inbound-connections.api",
  () => ({
    integrationInboundConnectionsApi: { list: mocks.listConnections },
  }),
);

describe("IntegrationInboundRoutesCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "command-key") });
    mocks.listRoutes.mockResolvedValue({ items: [] });
    mocks.listConnections.mockResolvedValue({
      items: [
        {
          id: "connection-1",
          projectId: "project-1",
          provider: "AMPLITUDE",
          displayName: "Inbound",
          inboundEnabled: true,
          lifecycle: "ACTIVE",
          region: "EU",
        },
      ],
    });
    mocks.listDefinitions.mockResolvedValue([
      {
        id: "event-1",
        code: "deposit",
        name: "Deposit",
        currentRevision: {
          id: "revision-1",
          payloadSchema: {
            type: "object",
            required: ["amount"],
            properties: { amount: { type: "number" } },
          },
        },
      },
    ]);
  });

  it("creates only an inbound route and maps provider paths to the pinned Lola schema", async () => {
    const wrapper = mount(IntegrationInboundRoutesCard, {
      props: {
        projectId: "project-1",
        provider: "AMPLITUDE",
        canRead: true,
        canManage: true,
      },
    });
    await flushPromises();
    await wrapper
      .get('button[data-action="show-create-inbound-amplitude"]')
      .trigger("click");
    await wrapper
      .get('select[name="inboundEventDefinition"]')
      .setValue("event-1");
    await wrapper
      .get('input[name="inboundRouteName"]')
      .setValue("Deposit inbound");
    await wrapper
      .get('input[name="inboundProviderEventName"]')
      .setValue("deposit");
    await wrapper
      .get('input[name="canonicalKeySourcePath"]')
      .setValue("transaction_id");
    await wrapper
      .get('select[name="canonicalKeyNormalization"]')
      .setValue("TRIM_LOWERCASE");
    expect(
      (
        wrapper.get('input[name="sourcePath-amount"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("amount");
    await wrapper
      .get('form[data-form="create-inbound-route-amplitude"]')
      .trigger("submit");
    await flushPromises();

    expect(mocks.create).toHaveBeenCalledWith(
      "AMPLITUDE",
      "project-1",
      {
        connectionId: "connection-1",
        name: "Deposit inbound",
        eventDefinitionKeyId: "event-1",
        eventDefinitionRevisionId: "revision-1",
        providerEventName: "deposit",
        propertyBindings: [
          {
            sourcePath: ["amount"],
            targetKey: "amount",
            required: true,
          },
        ],
        canonicalKeyExtractor: {
          sourcePath: ["transaction_id"],
          normalization: "TRIM_LOWERCASE",
        },
      },
      "command-key",
    );
  });

  it("explains the current-secret canary required before Customer.io publication", async () => {
    mocks.listConnections.mockResolvedValue({
      items: [
        {
          id: "connection-1",
          projectId: "project-1",
          provider: "CUSTOMER_IO",
          displayName: "Customer.io inbound",
          inboundEnabled: true,
          lifecycle: "ACTIVE",
          region: "EU",
        },
      ],
    });

    const wrapper = mount(IntegrationInboundRoutesCard, {
      props: {
        projectId: "project-1",
        provider: "CUSTOMER_IO",
        canRead: true,
        canManage: true,
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Перед публикацией или включением отправьте signed track canary с messageId под текущим signing secret",
    );
    expect(wrapper.text()).toContain("После rotation повторите canary");
  });

  it("shows a safe actionable error when Customer.io delivery ID evidence is absent", async () => {
    mocks.listRoutes.mockResolvedValue({
      items: [
        {
          id: "route-1",
          projectId: "project-1",
          connectionId: "connection-1",
          direction: "INBOUND",
          name: "Deposit inbound",
          lifecycle: "DRAFT",
          enabled: false,
          version: 4,
          draftRevision: {
            provider: "CUSTOMER_IO",
            providerEventName: "deposit",
          },
          publishedRevision: null,
        },
      ],
    });
    mocks.publish.mockRejectedValue(
      new ApiError(
        409,
        "internal provider contract detail",
        undefined,
        undefined,
        "CUSTOMER_IO_INBOUND_DELIVERY_ID_NOT_VERIFIED",
      ),
    );

    const wrapper = mount(IntegrationInboundRoutesCard, {
      props: {
        projectId: "project-1",
        provider: "CUSTOMER_IO",
        canRead: true,
        canManage: true,
      },
    });
    await flushPromises();
    await wrapper.get("article.route-row button").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Customer.io ещё не подтвердил messageId для текущего signing secret. Отправьте signed track canary и повторите операцию.",
    );
    expect(wrapper.text()).not.toContain("internal provider contract detail");
  });
});
