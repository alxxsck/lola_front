import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import {
  reportingResultStateFixtures,
  resultFixtureFor,
} from "../api/reporting-fixtures";
import ReportingChartRenderer from "./ReportingChartRenderer.vue";

describe("ReportingChartRenderer", () => {
  it("renders a time series with an accessible summary and Evidence rail", () => {
    const result = resultFixtureFor("unique_users");
    const wrapper = mount(ReportingChartRenderer, {
      props: { result, visualization: "LINE" },
    });

    expect(wrapper.get("[role=img]").attributes("aria-label")).toContain(
      "12 840 активных пользователей",
    );
    expect(wrapper.text()).toContain("12 июл — 10 авг 2026");
    expect(wrapper.text()).toContain("Точные данные");
    expect(wrapper.text()).toContain("Таблица данных");
  });

  it("keeps category values readable without relying on chart color", () => {
    const result = resultFixtureFor("unique_users", "channel");
    const wrapper = mount(ReportingChartRenderer, {
      props: { result, visualization: "DONUT" },
    });

    expect(wrapper.text()).toContain("Органика");
    expect(wrapper.text()).toContain("5 240");
    expect(wrapper.findAll(".donut-legend-item")).toHaveLength(4);
  });

  it("removes sensitive data and Evidence for a forbidden result", () => {
    const stalePayload = resultFixtureFor("unique_users");
    const wrapper = mount(ReportingChartRenderer, {
      props: {
        visualization: "LINE",
        result: {
          ...stalePayload,
          status: "forbidden",
          summary: "",
          safeMessage: "Доступ к результату отозван.",
        },
      },
    });

    expect(wrapper.get('[role="alert"]').text()).toContain("Доступ отозван");
    expect(wrapper.text()).not.toContain("Точные данные");
    expect(wrapper.text()).not.toContain("12 840");
    expect(wrapper.find("[role=img]").exists()).toBe(false);
  });

  it("renders a distinct privacy-safe suppressed state", () => {
    const wrapper = mount(ReportingChartRenderer, {
      props: {
        visualization: "KPI",
        result: reportingResultStateFixtures.suppressed,
      },
    });

    expect(wrapper.text()).toContain("Результат скрыт");
    expect(wrapper.text()).toContain("SMALL_GROUP_SUPPRESSED");
    expect(wrapper.find("[role=img]").exists()).toBe(false);
  });
});
