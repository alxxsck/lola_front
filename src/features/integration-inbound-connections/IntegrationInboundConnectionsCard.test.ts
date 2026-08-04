import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import IntegrationInboundConnectionsCard from "./IntegrationInboundConnectionsCard.vue";

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
  create: vi.fn(),
  setup: vi.fn(),
  rotate: vi.fn(),
  activate: vi.fn(),
}));

vi.mock("./integration-inbound-connections.api", () => ({
  integrationInboundConnectionsApi: api,
}));

const inboundConnection = (overrides: Record<string, unknown> = {}) => ({
  id: "connection-1",
  projectId: "project-1",
  provider: "AMPLITUDE",
  displayName: "Amplitude inbound",
  region: "EU",
  remoteProjectLabel: null,
  inboundEnabled: true,
  inbound: {
    configured: false,
    credentialRevision: null,
    credentialFingerprint: null,
    rotatedAt: null,
    overlapEndsAt: null,
    admissionReady: false,
  },
  outboundEnabled: false,
  lifecycle: "DRAFT",
  health: "UNKNOWN",
  credential: null,
  version: 1,
  updatedAt: "2026-08-04T10:00:00.000Z",
  ...overrides,
});

describe("IntegrationInboundConnectionsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockResolvedValue({ items: [inboundConnection()] });
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "command-key") });
  });

  it("shows inbound state without reading the nullable outbound credential", async () => {
    const wrapper = mount(IntegrationInboundConnectionsCard, {
      props: {
        projectId: "project-1",
        provider: "AMPLITUDE",
        canRead: true,
        canManage: false,
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Amplitude inbound");
    expect(wrapper.text()).toContain("Webhook ещё не настроен");
    expect(wrapper.text()).not.toContain("Project API Key");
  });

  it("explains that inbound protection is not a second provider account", async () => {
    const wrapper = mount(IntegrationInboundConnectionsCard, {
      props: {
        projectId: "project-1",
        provider: "CUSTOMER_IO",
        canRead: true,
        canManage: true,
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Это не второй аккаунт Customer.io и не ещё один API-ключ",
    );
    expect(wrapper.text()).toContain("отдельный адрес webhook и секрет");
  });

  it("creates a draft first, then configures and displays the one-time secret", async () => {
    const draft = inboundConnection({ id: "connection-new", version: 1 });
    api.list
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValue({ items: [draft] });
    api.create.mockResolvedValue(draft);
    api.setup.mockResolvedValue({
      replayed: false,
      connectionId: "connection-new",
      connectionVersion: 2,
      endpointPath: "/api/v1/integrations/inbound/amplitude/public-key",
      headerName: "x-lola-amplitude-secret",
      secret: "one-time-secret",
      credentialRevision: 1,
      credentialFingerprint: "1234567890abcdef",
      admissionReady: true,
      overlapEndsAt: null,
      payloadTemplate: { event_type: "${event_type}" },
    });

    const wrapper = mount(IntegrationInboundConnectionsCard, {
      props: {
        projectId: "project-1",
        provider: "AMPLITUDE",
        canRead: true,
        canManage: true,
      },
    });
    await flushPromises();
    await wrapper
      .get('input[name="inboundDisplayName"]')
      .setValue("Amplitude inbound");
    await wrapper
      .get('form[data-form="create-inbound-amplitude"]')
      .trigger("submit");
    await flushPromises();
    await wrapper
      .get('button[data-action="setup-inbound-amplitude"]')
      .trigger("click");
    await flushPromises();

    expect(api.create).toHaveBeenCalledBefore(api.setup);
    expect(wrapper.text()).toContain("one-time-secret");
    expect(wrapper.text()).toContain("x-lola-amplitude-secret");
    expect(wrapper.text()).toContain("event_type");

    await wrapper.setProps({ canManage: false });
    await flushPromises();
    expect(wrapper.text()).not.toContain("one-time-secret");
  });

  it("drops an in-flight one-time secret when manage permission is revoked", async () => {
    let resolveSetup!: (value: Record<string, unknown>) => void;
    api.setup.mockReturnValue(
      new Promise((resolve) => {
        resolveSetup = resolve;
      }),
    );
    const wrapper = mount(IntegrationInboundConnectionsCard, {
      props: {
        projectId: "project-1",
        provider: "AMPLITUDE",
        canRead: true,
        canManage: true,
      },
    });
    await flushPromises();
    await wrapper
      .get('button[data-action="setup-inbound-amplitude"]')
      .trigger("click");
    await wrapper.setProps({ canManage: false });
    resolveSetup({
      replayed: false,
      connectionId: "connection-1",
      connectionVersion: 2,
      endpointPath: "/api/v1/integrations/inbound/amplitude/public-key",
      headerName: "x-lola-amplitude-secret",
      secret: "late-one-time-secret",
      credentialRevision: 1,
      credentialFingerprint: "1234567890abcdef",
      admissionReady: true,
      overlapEndsAt: null,
      payloadTemplate: {},
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain("late-one-time-secret");
  });
});
