import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { resultFixtureFor } from "../api/reporting-fixtures";
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
});
