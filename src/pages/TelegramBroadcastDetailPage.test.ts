import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type {
  TelegramBroadcast,
  TelegramBroadcastActionAvailability,
  TelegramBroadcastPreview,
} from "@/features/telegram-broadcasts/model/telegram-broadcast";
import TelegramBroadcastDetailPage from "@/features/telegram-broadcasts/ui/TelegramBroadcastWorkspace.vue";

const availability: TelegramBroadcastActionAvailability = {
  edit: true,
  preview: true,
  testSend: true,
  approve: true,
  start: false,
  schedule: false,
  pause: false,
  resume: false,
  cancel: true,
};

const broadcast: TelegramBroadcast = {
  id: "broadcast-1",
  projectId: "project-1",
  title: "Июльское обновление",
  status: "DRAFT",
  version: 1,
  revision: {
    id: "revision-1",
    revisionNumber: 1,
    contentHash:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    text: "Обновление доступно.",
    createdAt: "2026-07-23T09:00:00.000Z",
  },
  content: { text: "Обновление доступно." },
  audience: { kind: "ALL_EXPLICITLY_OPTED_IN" },
  approval: null,
  latestTest: null,
  recipientCount: 0,
  scheduledAt: null,
  progress: null,
  allowedActions: [
    "EDIT",
    "PREVIEW",
    "TEST_SEND",
    "APPROVE",
    "CANCEL",
  ],
  createdAt: "2026-07-23T09:00:00.000Z",
  updatedAt: "2026-07-23T10:00:00.000Z",
};

const preview: TelegramBroadcastPreview = {
  broadcastId: "broadcast-1",
  version: 1,
  revisionId: "revision-1",
  contentHash:
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  renderedText: "Обновление доступно.",
  eligibleRecipientCount: 12,
  totalEvaluated: 15,
  exclusions: [
    { reason: "CONSENT_NOT_ACTIVE", count: 2 },
    { reason: "NO_ACTIVE_LINK", count: 1 },
  ],
};

function mountPage(
  props: Partial<InstanceType<typeof TelegramBroadcastDetailPage>["$props"]> = {},
) {
  return mount(TelegramBroadcastDetailPage, {
    props: {
      broadcast,
      preview,
      latestTestSend: null,
      deliveries: [],
      deliveryTotal: 0,
      nextDeliveryCursor: null,
      availability,
      loading: false,
      mutating: false,
      error: null,
      retryAvailable: false,
      ...props,
    },
    global: {
      stubs: {
        Dialog: {
          props: ["visible", "header"],
          emits: ["update:visible"],
          template:
            '<section v-if="visible" role="dialog"><h2>{{ header }}</h2><slot /><slot name="footer" /></section>',
        },
      },
    },
  });
}

describe("TelegramBroadcastDetailPage", () => {
  it("renders consent-safe draft, preview and exclusion summary", () => {
    const wrapper = mountPage();

    expect(wrapper.get("h1").text()).toBe("Июльское обновление");
    expect(wrapper.text()).toContain("Только пользователи с явным согласием");
    expect(wrapper.text()).toContain("Без активного явного согласия");
    expect(wrapper.text()).toContain("2");
    expect(wrapper.text()).toContain("Неактивная привязка Telegram");
    expect(wrapper.html()).not.toContain("chat_id");
  });

  it("emits a test-send for an explicit project external ID and label", async () => {
    const wrapper = mountPage();
    await wrapper
      .get("#broadcast-test-external-id")
      .setValue("customer-anna");
    await wrapper.get("#broadcast-test-label").setValue("Проверка Анны");
    await wrapper.get('[data-action="test-send"]').trigger("click");

    expect(wrapper.emitted("testSend")).toEqual([
      ["customer-anna", "Проверка Анны"],
    ]);
    expect(wrapper.text()).not.toContain("Telegram ID");
    expect(wrapper.text()).not.toContain("chat ID");
  });

  it("reports dirty draft state for the route-level unsaved changes guard", async () => {
    const wrapper = mountPage();
    await wrapper.get("#broadcast-text").setValue("Изменённый текст");

    expect(wrapper.emitted("dirtyChange")?.at(-1)).toEqual([true]);
  });

  it("requires an explicit named approval confirmation", async () => {
    const wrapper = mountPage({
      latestTestSend: {
        id: "test-1",
        status: "SENT",
        label: "Проверка Анны",
        revisionId: "revision-1",
        currentRevision: true,
        sentAt: "2026-07-23T10:05:00.000Z",
      },
    });
    await wrapper.get('[data-action="ask-approve"]').trigger("click");

    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.text()).toContain("Июльское обновление");
    expect(dialog.text()).toContain("12");
    expect(dialog.text()).toContain("1");
    expect(dialog.text()).toContain(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(dialog.text()).toContain("Проверка Анны · SENT · текущая ревизия");
    await dialog.get('[data-action="confirm"]').trigger("click");
    expect(wrapper.emitted("approve")).toHaveLength(1);
  });

  it("blocks approval above 10k and explains the cap before any confirm event", async () => {
    const wrapper = mountPage({
      preview: {
        ...preview,
        eligibleRecipientCount: 10_001,
        totalEvaluated: 10_001,
      },
      latestTestSend: {
        id: "test-1",
        status: "SENT",
        label: "Проверка Анны",
        revisionId: "revision-1",
        currentRevision: true,
        sentAt: "2026-07-23T10:05:00.000Z",
      },
    });

    expect(wrapper.text()).toContain(
      "Получателей больше 10000",
    );
    expect(
      wrapper.get('[data-action="ask-approve"]').attributes("disabled"),
    ).toBeDefined();
    await wrapper.get('[data-action="ask-approve"]').trigger("click");
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.emitted("approve")).toBeUndefined();
  });

  it("renders exact SENT evidence after approval", () => {
    const wrapper = mountPage({
      broadcast: {
        ...broadcast,
        status: "APPROVED",
        approval: {
          id: "approval-1",
          revisionId: "revision-1",
          contentHash: broadcast.revision.contentHash,
          recipientCount: 12,
          successfulTestId: "test-1",
          audiencePolicy: "ALL_EXPLICITLY_OPTED_IN",
          approvedAt: "2026-07-23T10:06:00.000Z",
          approvedByActorType: "CMS_USER",
        },
        latestTest: {
          id: "test-1",
          status: "SENT",
          label: "Проверка Анны",
          revisionId: "revision-1",
          currentRevision: true,
          sentAt: "2026-07-23T10:05:00.000Z",
        },
      },
      preview: null,
    });

    expect(wrapper.text()).toContain("Доказательства подтверждения");
    expect(wrapper.text()).toContain("Проверка Анны · SENT · текущая ревизия");
  });

  it("renders retry only from transport availability and emits fresh login separately", async () => {
    const retryableCopy = mountPage({
      error: {
        kind: "RATE_LIMITED",
        message: "Команда временно ограничена.",
        retryable: true,
      },
      retryAvailable: false,
    });
    expect(retryableCopy.find(".error-banner .link-button").exists()).toBe(
      false,
    );

    const freshAuth = mountPage({
      error: {
        kind: "FRESH_AUTH",
        message: "Требуется свежий вход с MFA.",
        retryable: false,
      },
      retryAvailable: false,
    });
    await freshAuth
      .get('[data-action="broadcast-fresh-login"]')
      .trigger("click");
    expect(freshAuth.emitted("freshLogin")).toHaveLength(1);
    expect(freshAuth.emitted("retry")).toBeUndefined();
  });

  it("does not expose approval when server capabilities withhold it after a queued test", () => {
    const wrapper = mountPage({
      latestTestSend: {
        id: "test-1",
        status: "PENDING",
        label: "Анна Смирнова",
        revisionId: "revision-1",
        currentRevision: true,
        sentAt: null,
      },
      availability: { ...availability, approve: false },
    });

    expect(wrapper.find('[data-action="ask-approve"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("PENDING");
  });

  it("shows only lifecycle actions allowed by capability intersection", () => {
    const wrapper = mountPage({
      broadcast: {
        ...broadcast,
        status: "PAUSED",
        allowedActions: ["RESUME", "CANCEL"],
        progress: {
          total: 12,
          pending: 3,
          sending: 0,
          sent: 6,
          retryWait: 1,
          outcomeUnknown: 0,
          failedPermanent: 1,
          suppressedLink: 1,
          suppressedConsent: 0,
          suppressedInstallation: 0,
          cancelled: 0,
        },
      },
      preview: null,
      availability: {
        ...availability,
        edit: false,
        preview: false,
        testSend: false,
        approve: false,
        resume: true,
      },
    });

    expect(wrapper.find('[data-action="resume"]').exists()).toBe(true);
    expect(wrapper.find('[data-action="pause"]').exists()).toBe(false);
    expect(wrapper.find('[data-action="start"]').exists()).toBe(false);
    expect(wrapper.get('[aria-live="polite"]').text()).toContain(
      "Приостановлена",
    );
  });
});
