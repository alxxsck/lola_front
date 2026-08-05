import {
  scenarioAdmissionDecisionsPage,
  platformOperationsScenarioAdmissionSettings,
  platformOperationsUpdateScenarioAdmissionSettings,
} from "@/shared/api/generated/retenive-backend";
import type {
  ScenarioAdmissionDecisionsPageParams,
  UpdateScenarioAdmissionSettingsDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { scenarioAdmissionDemo } from "./scenario-admission.demo";

const demoMode = import.meta.env.VITE_DATA_MODE === "mock";

async function callApi<Response>(
  request: () => Promise<Response>,
): Promise<Response> {
  try {
    return await request();
  } catch (cause) {
    throw normalizeApiError(cause);
  }
}

export const scenarioAdmissionApi = {
  get(projectId: string) {
    if (demoMode) return scenarioAdmissionDemo.get(projectId);
    return callApi(() =>
      platformOperationsScenarioAdmissionSettings(projectId),
    );
  },
  update(projectId: string, input: UpdateScenarioAdmissionSettingsDto) {
    if (demoMode) return scenarioAdmissionDemo.update(projectId, input);
    return callApi(() =>
      platformOperationsUpdateScenarioAdmissionSettings(projectId, input),
    );
  },
  decisionsPage(
    projectId: string,
    params: ScenarioAdmissionDecisionsPageParams,
  ) {
    if (demoMode) return scenarioAdmissionDemo.decisionsPage();
    return callApi(() => scenarioAdmissionDecisionsPage(projectId, params));
  },
};
