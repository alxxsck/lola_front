import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import IntegrationCanonicalIdentityPolicyCard from "./IntegrationCanonicalIdentityPolicyCard.vue";

const api = vi.hoisted(() => ({
  current: vi.fn(),
  preview: vi.fn(),
  publish: vi.fn(),
  listRoutes: vi.fn(),
  listDefinitions: vi.fn(),
}));

vi.mock("./integration-canonical-identity.api", () => ({
  integrationCanonicalIdentityApi: api,
}));

const definition = (id = "event-1") => ({
  id,
  code: "deposit",
  name: "Deposit",
  currentRevision: { id: `${id}-revision`, payloadSchema: { type: "object" } },
});

const route = (
  id: string,
  provider: "AMPLITUDE" | "CUSTOMER_IO",
  sourcePath: string[],
) => ({
  id,
  projectId: "project-1",
  connectionId: `${id}-connection`,
  name: `${provider} deposit`,
  direction: "INBOUND",
  lifecycle: "ACTIVE",
  enabled: true,
  version: 3,
  enablementVersion: 2,
  description: null,
  draftRevision: null,
  publishedRevision: {
    id: `${id}-revision`,
    eventDefinitionKeyId: "event-1",
    eventDefinitionRevisionId: "event-1-revision",
    provider,
    providerEventName: "deposit",
    canonicalKeyExtractor: {
      sourcePath,
      normalization: "TRIM_LOWERCASE",
    },
  },
});

const current = (overrides: Record<string, unknown> = {}) => ({
  mode: "CANONICAL_KEY",
  policyId: "policy-1",
  policyRevisionId: "policy-revision-4",
  revision: 4,
  version: 4,
  eventDefinitionKeyId: "event-1",
  canonicalKeyName: "transaction_id",
  runtimeActivation: "ACTIVE",
  participants: [
    {
      routeId: "route-amplitude",
      routeRevisionId: "route-amplitude-revision",
      provider: "AMPLITUDE",
      sourcePath: ["transaction_id"],
      normalization: "TRIM_LOWERCASE",
    },
    {
      routeId: "route-customer-io",
      routeRevisionId: "route-customer-io-revision",
      provider: "CUSTOMER_IO",
      sourcePath: ["transaction_id"],
      normalization: "TRIM_LOWERCASE",
    },
  ],
  ...overrides,
});

function mountCard(
  props: Partial<{
    projectId: string;
    canRead: boolean;
    canManage: boolean;
  }> = {},
) {
  return mount(IntegrationCanonicalIdentityPolicyCard, {
    props: {
      projectId: "project-1",
      canRead: true,
      canManage: true,
      ...props,
    },
  });
}

describe("IntegrationCanonicalIdentityPolicyCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "canonical-command-key"),
    });
    api.listDefinitions.mockResolvedValue([definition()]);
    api.listRoutes.mockResolvedValue({
      items: [
        route("route-amplitude", "AMPLITUDE", ["transaction_id"]),
        route("route-customer-io", "CUSTOMER_IO", ["transaction_id"]),
      ],
    });
    api.current.mockResolvedValue(current());
    api.preview.mockResolvedValue({
      mode: "CANONICAL_KEY",
      canonicalKeyName: "transaction_id",
      expectedVersion: 4,
      currentPolicyRevisionId: "policy-revision-4",
      publishable: true,
      runtimeActivation: "ACTIVE",
      participants: current().participants,
    });
    api.publish.mockResolvedValue(
      current({
        policyRevisionId: "policy-revision-5",
        revision: 5,
        version: 5,
      }),
    );
  });

  it("is hidden and does not request policy data without integrations read permission", async () => {
    const wrapper = mountCard({ canRead: false, canManage: false });
    await flushPromises();

    expect(wrapper.html()).toBe("<!--v-if-->");
    expect(api.listDefinitions).not.toHaveBeenCalled();
    expect(api.listRoutes).not.toHaveBeenCalled();
    expect(api.current).not.toHaveBeenCalled();
  });

  it("renders the active immutable revision and all participant extractors", async () => {
    const wrapper = mountCard({ canManage: false });
    await flushPromises();

    expect(wrapper.text()).toContain("Canonical identity policy");
    expect(wrapper.text()).toContain("Ревизия 4");
    expect(wrapper.text()).toContain("Активна в runtime");
    expect(wrapper.text()).toContain("transaction_id");
    expect(wrapper.text()).toContain("trim + lowercase");
    expect(
      wrapper.find('button[data-action="preview-canonical-policy"]').exists(),
    ).toBe(false);
  });

  it("previews two providers, warns about conflict semantics and publishes the exact preview", async () => {
    api.current
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(current({ revision: 1, version: 1 }));
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .get('input[name="canonicalKeyName"]')
      .setValue("transaction_id");
    for (const checkbox of wrapper.findAll(
      'input[name="canonicalParticipant"]',
    )) {
      await checkbox.setValue(true);
    }
    expect(wrapper.findAll('input[name="canonicalParticipant"]')).toHaveLength(
      2,
    );
    expect(
      wrapper
        .get('button[data-action="preview-canonical-policy"]')
        .attributes("disabled"),
    ).toBeUndefined();
    await wrapper.get('form[data-form="canonical-policy"]').trigger("submit");
    await flushPromises();

    expect(api.preview).toHaveBeenCalledWith("project-1", "event-1", {
      canonicalKeyName: "transaction_id",
      participants: [
        {
          routeId: "route-amplitude",
          routeRevisionId: "route-amplitude-revision",
        },
        {
          routeId: "route-customer-io",
          routeRevisionId: "route-customer-io-revision",
        },
      ],
    });
    expect(wrapper.text()).toContain(
      "Одинаковый ключ с разным payload будет конфликтом",
    );
    expect(wrapper.text()).toContain(
      "Повтор одного canonical key будет принят только один раз",
    );

    await wrapper
      .get('button[data-action="publish-canonical-policy"]')
      .trigger("click");
    await flushPromises();

    expect(api.publish).toHaveBeenCalledWith(
      "project-1",
      "event-1",
      {
        canonicalKeyName: "transaction_id",
        expectedVersion: 4,
        participants: [
          {
            routeId: "route-amplitude",
            routeRevisionId: "route-amplitude-revision",
          },
          {
            routeId: "route-customer-io",
            routeRevisionId: "route-customer-io-revision",
          },
        ],
        reason: "Публикация canonical identity policy через CMS",
      },
      "canonical-command-key",
    );
  });

  it("discards late results from a previously selected Project", async () => {
    let resolveOld!: (value: unknown) => void;
    api.listDefinitions.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    );
    const wrapper = mountCard();
    await wrapper.setProps({ projectId: "project-2" });
    await flushPromises();
    resolveOld([definition("old-event")]);
    await flushPromises();

    expect(api.listDefinitions).toHaveBeenLastCalledWith("project-2");
    expect(wrapper.text()).not.toContain("old-event");
  });

  it("shows a bounded load error and retries without exposing backend details", async () => {
    api.listDefinitions.mockRejectedValueOnce(
      new Error("secret upstream trace"),
    );
    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Не удалось загрузить canonical identity policies",
    );
    expect(wrapper.text()).not.toContain("secret upstream trace");

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Обновить")!
      .trigger("click");
    await flushPromises();

    expect(api.listDefinitions).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("Ревизия 4");
  });

  it("translates OCC conflicts without rendering backend error details", async () => {
    api.current.mockResolvedValueOnce(null);
    api.publish.mockRejectedValueOnce(
      new ApiError(
        409,
        "database relation integration_event_identity_policy leaked",
        undefined,
        undefined,
        "INTEGRATION_IDENTITY_POLICY_VERSION_CONFLICT",
      ),
    );
    const wrapper = mountCard();
    await flushPromises();
    await wrapper
      .get('input[name="canonicalKeyName"]')
      .setValue("transaction_id");
    for (const checkbox of wrapper.findAll(
      'input[name="canonicalParticipant"]',
    ))
      await checkbox.setValue(true);
    await wrapper.get('form[data-form="canonical-policy"]').trigger("submit");
    await flushPromises();
    await wrapper
      .get('button[data-action="publish-canonical-policy"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Policy уже изменилась",
    );
    expect(wrapper.text()).not.toContain("database relation");
  });
});
