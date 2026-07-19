import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { describe, expect, it, vi } from "vitest";

import type {
  AudienceCatalogResponseDto,
  SegmentSummaryResponseDto,
} from "@/shared/api/generated/models";
import {
  createAudienceDraft,
  serializeAudienceDraft,
  type AudienceDomainContext,
  type AudienceDraft,
} from "../model";
import AudienceRuleBuilder from "./AudienceRuleBuilder.vue";

const catalog: AudienceCatalogResponseDto = {
  version: 1,
  revision: "audience-catalog-3",
  locales: [
    { code: "ru-RU", language: "ru", label: "Русский (Россия)" },
    { code: "en-US", language: "en", label: "English (US)" },
  ],
  localeSource: {
    operators: ["eq", "neq", "in", "exists", "not_exists"],
    control: "SELECT",
    authoringAvailability: "AVAILABLE",
  },
  languageSource: {
    operators: ["eq", "neq", "in", "exists", "not_exists"],
    control: "SELECT",
    authoringAvailability: "AVAILABLE",
  },
  country: {
    source: "profile.country",
    valueType: "countryCode",
    semantics: "ISO_3166_1_ALPHA_2_UPPERCASE",
    operators: ["eq", "neq", "in", "exists", "not_exists"],
    control: "COUNTRY_CODE",
    authoringAvailability: "AVAILABLE",
  },
  attributes: [
    {
      definitionId: "attribute-1",
      definitionRevisionId: "attribute-revision-4",
      revision: 4,
      key: "vipLevel",
      label: "VIP-уровень",
      description: "Уровень программы лояльности",
      valueType: "number",
      required: false,
      sensitive: true,
      operators: ["eq", "gte", "not_in", "exists", "not_exists"],
      control: "NUMBER",
      authoringAvailability: "AVAILABLE",
    },
  ],
  segmentSource: {
    operators: ["is_member", "is_not_member"],
    searchEndpoint: "/segments",
    control: "SEARCH",
    authoringAvailability: "AVAILABLE",
  },
  snapshotPolicy: {
    initialEvaluation: "RUN_START",
    missingOrNull: "NO_MATCH_EXCEPT_NOT_EXISTS",
    deletedDefinition: "PINNED_SNAPSHOT_CONTINUES",
    unavailableSource: "PUBLISH_REJECTED_EXPLAIN_UNAVAILABLE",
    segmentRevision: "PINNED_REVISION",
    persistence: "SNAPSHOT_WITH_SEPARATE_LAST_RECHECK",
    recheckTrigger: "DELIVERY_RECHECK_ELIGIBILITY",
  },
};

const segments: SegmentSummaryResponseDto[] = [
  {
    segmentId: "segment-1",
    key: "vip",
    name: "VIP-пользователи",
    status: "ACTIVE",
    currentRevision: {
      segmentRevisionId: "segment-revision-2",
      revision: 2,
      catalogRevision: "audience-catalog-3",
      contentHash: "hash",
      publishedAt: "2026-07-18T00:00:00.000Z",
    },
  },
];

const context: AudienceDomainContext = { catalog, segments };

function mountBuilder(
  domainContext = context,
  segmentSearch?: (query: string) => Promise<SegmentSummaryResponseDto[]>,
) {
  return mount(
    defineComponent({
      components: { AudienceRuleBuilder },
      setup() {
        const draft = ref<AudienceDraft>(createAudienceDraft());
        return { draft, context: domainContext, segmentSearch };
      },
      template:
        '<AudienceRuleBuilder ref="builder" v-model="draft" :context="context" :segment-search="segmentSearch" />',
    }),
    { attachTo: document.body },
  );
}

async function openSource(wrapper: VueWrapper, source: string) {
  await wrapper
    .get('button[aria-label^="Добавить условие аудитории в"]')
    .trigger("click");
  await wrapper
    .get(`button[data-audience-source="${source}"]`)
    .trigger("click");
}

describe("AudienceRuleBuilder", () => {
  it("creates a locale condition without raw paths or JSON", async () => {
    const wrapper = mountBuilder();
    await openSource(wrapper, "locale");
    await wrapper.get('select[aria-label="Оператор locale"]').setValue("eq");
    await wrapper.get('select[aria-label="Значение locale"]').setValue("ru-RU");
    await wrapper
      .get('button[aria-label="Применить условие аудитории"]')
      .trigger("click");
    await flushPromises();

    const draft = (wrapper.vm as unknown as { draft: AudienceDraft }).draft;
    expect(serializeAudienceDraft(draft, context)).toMatchObject({
      ok: true,
      value: {
        version: 1,
        root: {
          kind: "all",
          children: [{ kind: "locale", operator: "eq", value: "ru-RU" }],
        },
      },
    });
    expect(wrapper.text()).toContain("locale — равно ru-RU");
    expect(wrapper.text()).not.toContain("user.locale");
    wrapper.unmount();
  });

  it("uses a multi-select value for the in operator", async () => {
    const wrapper = mountBuilder();
    await openSource(wrapper, "locale");
    await wrapper.get('select[aria-label="Оператор locale"]').setValue("in");
    await wrapper
      .get('select[aria-label="Значения locale"]')
      .setValue(["ru-RU", "en-US"]);
    await wrapper
      .get('button[aria-label="Применить условие аудитории"]')
      .trigger("click");

    const draft = (wrapper.vm as unknown as { draft: AudienceDraft }).draft;
    expect(serializeAudienceDraft(draft, context)).toMatchObject({
      ok: true,
      value: {
        root: {
          children: [
            { kind: "locale", operator: "in", value: ["ru-RU", "en-US"] },
          ],
        },
      },
    });
    wrapper.unmount();
  });

  it("uses a typed attribute control and warns that preview values are redacted", async () => {
    const wrapper = mountBuilder();
    await openSource(wrapper, "userAttribute");
    await wrapper
      .get('select[aria-label="Атрибут пользователя"]')
      .setValue("attribute-1");
    await wrapper
      .get('select[aria-label="Оператор атрибута VIP-уровень"]')
      .setValue("gte");
    expect(wrapper.text()).toContain("Чувствительное значение");
    expect(wrapper.text()).toContain("backend скроет фактическое значение");
    await wrapper
      .get('input[aria-label="Значение атрибута VIP-уровень"]')
      .setValue("3");
    await wrapper
      .get('button[aria-label="Применить условие аудитории"]')
      .trigger("click");

    const draft = (wrapper.vm as unknown as { draft: AudienceDraft }).draft;
    expect(serializeAudienceDraft(draft, context)).toMatchObject({
      ok: true,
      value: {
        root: {
          children: [
            {
              kind: "userAttribute",
              definitionId: "attribute-1",
              operator: "gte",
              value: 3,
            },
          ],
        },
      },
    });
    wrapper.unmount();
  });

  it("applies not_in with a typed list value", async () => {
    const wrapper = mountBuilder();
    await openSource(wrapper, "userAttribute");
    await wrapper
      .get('select[aria-label="Атрибут пользователя"]')
      .setValue("attribute-1");
    await wrapper
      .get('select[aria-label="Оператор атрибута VIP-уровень"]')
      .setValue("not_in");
    await wrapper
      .get('input[aria-label="Значения атрибута VIP-уровень"]')
      .setValue("2, 3");
    const apply = wrapper.get(
      'button[aria-label="Применить условие аудитории"]',
    );
    expect((apply.element as HTMLButtonElement).disabled).toBe(false);
    await apply.trigger("click");

    const draft = (wrapper.vm as unknown as { draft: AudienceDraft }).draft;
    expect(serializeAudienceDraft(draft, context)).toMatchObject({
      ok: true,
      value: { root: { children: [{ operator: "not_in", value: [2, 3] }] } },
    });
    wrapper.unmount();
  });

  it("pins the selected Segment revision and explains why the version is fixed", async () => {
    const wrapper = mountBuilder();
    await openSource(wrapper, "segmentMembership");
    await wrapper
      .get('select[aria-label="Сегмент аудитории"]')
      .setValue("segment-1");
    expect(wrapper.text()).toContain("Версия 2 будет закреплена");
    await wrapper
      .get('button[aria-label="Применить условие аудитории"]')
      .trigger("click");

    const draft = (wrapper.vm as unknown as { draft: AudienceDraft }).draft;
    expect(serializeAudienceDraft(draft, context)).toMatchObject({
      ok: true,
      value: {
        root: {
          children: [
            {
              kind: "segmentMembership",
              segmentId: "segment-1",
              segmentRevisionId: "segment-revision-2",
              operator: "is_member",
            },
          ],
        },
      },
    });
    expect(wrapper.text()).toContain("VIP-пользователи");
    expect(wrapper.text()).toContain("версия 2");
    wrapper.unmount();
  });

  it("searches the backend catalog before selecting a Segment beyond the preload", async () => {
    const searchedSegment: SegmentSummaryResponseDto = {
      segmentId: "segment-101",
      key: "whales",
      name: "Whales",
      status: "ACTIVE",
      currentRevision: {
        segmentRevisionId: "segment-revision-9",
        revision: 9,
        catalogRevision: "audience-catalog-3",
        contentHash: "hash-9",
        publishedAt: "2026-07-18T00:00:00.000Z",
      },
    };
    const search = vi.fn().mockResolvedValue([searchedSegment]);
    const wrapper = mountBuilder(context, search);
    await openSource(wrapper, "segmentMembership");
    await wrapper
      .get('input[aria-label="Поиск сегмента аудитории"]')
      .setValue("whale");
    await wrapper.get(".segment-search").trigger("submit");
    await flushPromises();
    await wrapper
      .get('select[aria-label="Сегмент аудитории"]')
      .setValue("segment-101");
    await wrapper
      .get('button[aria-label="Применить условие аудитории"]')
      .trigger("click");

    expect(search).toHaveBeenCalledWith("whale");
    const draft = (wrapper.vm as unknown as { draft: AudienceDraft }).draft;
    expect(
      serializeAudienceDraft(draft, {
        ...context,
        segments: [...segments, searchedSegment],
      }),
    ).toMatchObject({
      ok: true,
      value: {
        root: {
          children: [
            {
              segmentId: "segment-101",
              segmentRevisionId: "segment-revision-9",
            },
          ],
        },
      },
    });
    wrapper.unmount();
  });

  it("supports nested groups, keyboard buttons and explicit NOT independently from delete", async () => {
    const wrapper = mountBuilder();
    await wrapper
      .get('button[aria-label^="Добавить группу аудитории в"]')
      .trigger("click");
    const nestedAdd = wrapper
      .findAll('button[aria-label^="Добавить условие аудитории в"]')
      .at(0)!;
    await nestedAdd.trigger("click");
    await wrapper
      .get('button[data-audience-source="country"]')
      .trigger("click");
    await wrapper.get('input[aria-label="ISO-код страны"]').setValue("ES");
    await wrapper
      .get('button[aria-label="Применить условие аудитории"]')
      .trigger("click");
    await wrapper
      .get('button[aria-label^="Инвертировать условие аудитории:"]')
      .trigger("click");

    expect(wrapper.text()).toContain("НЕ");
    expect(
      wrapper.find('button[aria-label^="Удалить условие аудитории:"]').exists(),
    ).toBe(true);
    wrapper.unmount();
  });

  it("can invert a nested group, not only a leaf", async () => {
    const wrapper = mountBuilder();
    await wrapper
      .get('button[aria-label^="Добавить группу аудитории в"]')
      .trigger("click");
    const nestedGroup = wrapper.get(
      ".audience-node .audience-node .group-card",
    );

    await nestedGroup
      .get('button[aria-label^="Инвертировать группу аудитории:"]')
      .trigger("click");

    expect(
      wrapper.get(".audience-node .audience-node .not-card").text(),
    ).toContain("Результат меняется на противоположный");
    wrapper.unmount();
  });

  it("focuses the exact editor control requested by a backend issue", async () => {
    const wrapper = mountBuilder();
    await openSource(wrapper, "country");
    await wrapper.get('input[aria-label="ISO-код страны"]').setValue("ES");
    await wrapper
      .get('button[aria-label="Применить условие аудитории"]')
      .trigger("click");
    const draft = (wrapper.vm as unknown as { draft: AudienceDraft }).draft;
    const nodeId =
      draft.root.kind === "all" ? draft.root.children[0]!.nodeId : "";

    (
      wrapper.getComponent(AudienceRuleBuilder).vm as unknown as {
        focusIssue: (issue: object) => void;
      }
    ).focusIssue({ nodeId, fieldPath: "value", message: "Страна недоступна" });
    await flushPromises();

    const input = wrapper.get('input[aria-label="ISO-код страны"]');
    expect(document.activeElement).toBe(input.element);
    expect(input.attributes("aria-invalid")).toBe("true");
    expect(wrapper.text()).toContain("Страна недоступна");
    wrapper.unmount();
  });
});
