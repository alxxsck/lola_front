import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it } from "vitest";
import type { NotificationOperationsIntegration } from "../model/notification-operations";
import QuarantineIntegrationDialog from "./QuarantineIntegrationDialog.vue";

const target: NotificationOperationsIntegration = {
  integrationId: "00000000-0000-4000-8000-000000000030",
  kind: "SLACK_DESTINATION",
  projectId: "00000000-0000-4000-8000-000000000010",
  status: "ACTIVE",
  version: 4,
  maskedIdentity: "Slack •••• 000030",
  quarantineAllowed: true,
};

describe("QuarantineIntegrationDialog", () => {
  it("requires a closed reason and exact server-issued identity", async () => {
    const wrapper = mount(QuarantineIntegrationDialog, {
      props: { target, submitting: false },
      global: { plugins: [PrimeVue] },
    });
    const confirm = wrapper.get(".danger-button");
    expect(confirm.attributes("disabled")).toBeDefined();

    await wrapper
      .get('select[aria-label="Причина quarantine"]')
      .setValue("CREDENTIAL_COMPROMISED");
    await wrapper
      .get('input[aria-label="Подтверждение masked identity"]')
      .setValue("Slack wrong");
    expect(confirm.attributes("disabled")).toBeDefined();

    await wrapper
      .get('input[aria-label="Подтверждение masked identity"]')
      .setValue(target.maskedIdentity);
    expect(confirm.attributes("disabled")).toBeUndefined();
    await confirm.trigger("click");

    expect(wrapper.emitted("confirm")).toEqual([
      ["CREDENTIAL_COMPROMISED", target.maskedIdentity],
    ]);
    expect(wrapper.text()).toContain("Post-dispatch");
    expect(wrapper.text()).not.toContain(target.integrationId);
  });
});
