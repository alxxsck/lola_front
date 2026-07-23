import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { TelegramBroadcastPreview } from "../model/telegram-broadcast";
import TelegramBroadcastPreviewPanel from "./TelegramBroadcastPreview.vue";

const preview: TelegramBroadcastPreview = {
  broadcastId: "broadcast-1",
  version: 1,
  revisionId: "revision-1",
  contentHash: "content-hash",
  renderedText: "Сообщение",
  eligibleRecipientCount: 1,
  totalEvaluated: 1,
  exclusions: [],
};

describe("TelegramBroadcastPreview", () => {
  it("collects an explicit external ID and bounded label accessibly", async () => {
    const wrapper = mount(TelegramBroadcastPreviewPanel, {
      props: {
        preview,
        latestTestSend: null,
        canTest: true,
        disabled: false,
      },
    });

    const externalId = wrapper.get("#broadcast-test-external-id");
    const label = wrapper.get("#broadcast-test-label");
    const submit = wrapper.get('[data-action="test-send"]');
    expect(externalId.attributes("maxlength")).toBe("255");
    expect(externalId.attributes("aria-describedby")).toBe(
      "broadcast-test-external-id-hint",
    );
    expect(label.attributes("maxlength")).toBe("80");
    expect(label.attributes("aria-describedby")).toBe(
      "broadcast-test-label-hint",
    );
    expect(submit.attributes("disabled")).toBeDefined();

    await externalId.setValue(" customer-anna ");
    await label.setValue(" Проверка Анны ");
    expect(submit.attributes("disabled")).toBeUndefined();
    await submit.trigger("click");

    expect(wrapper.emitted("testSend")).toEqual([
      ["customer-anna", "Проверка Анны"],
    ]);
  });
});
