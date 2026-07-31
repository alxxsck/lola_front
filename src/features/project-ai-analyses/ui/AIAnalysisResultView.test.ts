import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AIAnalysisResultView from "./AIAnalysisResultView.vue";

describe("AIAnalysisResultView", () => {
  it("renders a validated answer, table and limitations", () => {
    const wrapper = shallowMount(AIAnalysisResultView, {
      props: {
        result: {
          answer: "Готовый вывод",
          table: {
            columns: [{ key: "geo", label: "GEO" }],
            rows: [{ cells: ["ES"] }],
          },
          definitions: [
            {
              kind: "EVENT",
              code: "deposit.completed",
              description: "Успешный депозит",
            },
          ],
          receiptOrdinals: [1],
          completeness: "PARTIAL",
          actors: {
            createdByCmsUserId: "admin-1",
            costAttributedToCmsUserId: "admin-cost",
          },
          provenance: {
            catalogRevisionId: "catalog-1",
            catalogRevisionDigest: "a".repeat(64),
            queryPolicyRevisionId: "policy-1",
            aiOperationId: "operation-1",
            queryReceipts: [],
          },
          limitations: [{ code: "PARTIAL", message: "Часть данных исключена" }],
        },
        canReadCost: false,
      },
    });

    expect(wrapper.text()).toContain("Готовый вывод");
    expect(wrapper.text()).toContain("GEO");
    expect(wrapper.text()).toContain("ES");
    expect(wrapper.text()).toContain("Часть данных исключена");
    expect(wrapper.text()).toContain("deposit.completed");
    expect(wrapper.text()).toContain("PARTIAL");
    expect(wrapper.text()).toContain("catalog-1");
    expect(wrapper.text()).toContain("admin-1");
    expect(wrapper.text()).not.toContain("admin-cost");
  });
});
