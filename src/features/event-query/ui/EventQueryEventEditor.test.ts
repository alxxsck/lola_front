import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import EventQueryEventEditor from "./EventQueryEventEditor.vue";

describe("EventQueryEventEditor", () => {
  it("adds schema fields fail-closed until sensitivity and operations are explicit", async () => {
    const wrapper = mount(EventQueryEventEditor, {
      props: {
        modelValue: {
          stableCode: "profile.updated",
          descriptionForAI: "Профиль обновлён",
          allowedModes: ["SUMMARY"],
          maxInteractiveLookbackHours: 24,
          maxVerificationLookbackHours: 168,
          safeFields: [],
        },
        schemaFields: [{ path: "email", schemaType: "string" }],
      },
      global: { stubs: { Button: true } },
    });

    await wrapper
      .get('select[aria-label="Добавить безопасное поле"]')
      .setValue("email");

    expect(wrapper.emitted("update:modelValue")?.[0]?.[0]).toEqual(
      expect.objectContaining({
        safeFields: [
          expect.objectContaining({
            path: "email",
            sensitivity: "FORBIDDEN",
            operations: [],
          }),
        ],
      }),
    );
  });
});
