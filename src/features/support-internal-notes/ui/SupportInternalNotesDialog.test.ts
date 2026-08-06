import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { SupportInternalNote } from "@/features/support-internal-notes/api/support-internal-notes-source";
import SupportInternalNotesDialog from "./SupportInternalNotesDialog.vue";

function note(
  overrides: Partial<SupportInternalNote> = {},
): SupportInternalNote {
  return {
    id: "note-1",
    caseId: "case-1",
    body: "<strong>Не HTML</strong>",
    lifecycle: "ACTIVE",
    currentRevisionNumber: 1,
    creatorName: "Алина",
    createdAt: "2026-08-06T10:00:00.000Z",
    updatedAt: "2026-08-06T10:00:00.000Z",
    tombstonedAt: null,
    hasUnavailableReferences: false,
    ...overrides,
  };
}

function render(overrides: Record<string, unknown> = {}) {
  return mount(SupportInternalNotesDialog, {
    props: {
      visible: true,
      notes: [note()],
      nextCursor: null,
      selectedHistoryNote: null,
      history: [],
      historyNextCursor: null,
      ...overrides,
    },
    global: {
      stubs: {
        Dialog: { template: "<section><slot /></section>" },
        Message: { template: "<div><slot /></div>" },
        Tag: { template: "<span><slot /></span>" },
        Button: {
          emits: ["click"],
          template: "<button type=\"button\" @click=\"$emit('click')\"><slot /></button>",
        },
      },
    },
  });
}

describe("support internal notes dialog", () => {
  it("renders note content as plain text and exposes no speculative command", () => {
    const wrapper = render();

    expect(wrapper.get('[data-testid="internal-note-body"]').text()).toBe(
      "<strong>Не HTML</strong>",
    );
    expect(wrapper.html()).toContain("&lt;strong&gt;Не HTML&lt;/strong&gt;");
    expect(wrapper.text()).not.toContain("Создать заметку");
    expect(wrapper.text()).not.toContain("Исправить заметку");
    expect(wrapper.text()).not.toContain("Удалить заметку");
    expect(wrapper.text()).not.toContain("История заметки");
  });

  it("shows a tombstone without retaining a removed note body", () => {
    const wrapper = render({
      notes: [note({ body: null, lifecycle: "TOMBSTONED" })],
    });

    expect(wrapper.find('[data-testid="internal-note-body"]').exists()).toBe(
      false,
    );
    expect(wrapper.text()).toContain("Текст заметки удалён.");
  });

  it("delegates lazy history loading only when the separate grant is present", async () => {
    const wrapper = render({ canReadHistory: true });

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("openHistory")).toEqual([["note-1"]]);
  });
});
