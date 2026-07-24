import type {
  ScenarioAdmissionDecisionPageResponseDto,
  ScenarioAdmissionDecisionResponseDtoPolicySnapshot,
  ScenarioAdmissionSettingsResponseDto,
  UpdateScenarioAdmissionSettingsDto,
} from "@/shared/api/generated/models";

const settingsByProject = new Map<string, ScenarioAdmissionSettingsResponseDto>();

function defaults(): ScenarioAdmissionSettingsResponseDto {
  return {
    mode: "PROJECT_GLOBAL_V1",
    maxStartsPerLocalDay: 3,
    maxStartsPerVisit: 2,
    minimumIntervalSeconds: 3_600,
    projectVersion: 1,
    quietHours: { enabled: true, startLocalTime: "00:00", endLocalTime: "08:00" },
    semantics: {
      dailyLimitWindow: "END_USER_LOCAL_CALENDAR_DAY",
      minimumIntervalAnchor: "LAST_NON_SECURITY_START",
      quietHoursBehavior: "SUPPRESS_WITHOUT_DELAY_OR_QUOTA",
      securityBypass: "FREQUENCY_AND_QUIET_HOURS",
      visitLimitWithoutActiveVisit: "NOT_APPLIED",
    },
  };
}

const clone = <Value>(value: Value): Value => structuredClone(value);

export const scenarioAdmissionDemo = {
  get(projectId: string) {
    const value = settingsByProject.get(projectId) ?? defaults();
    settingsByProject.set(projectId, value);
    return Promise.resolve(clone(value));
  },
  update(projectId: string, input: UpdateScenarioAdmissionSettingsDto) {
    const current = settingsByProject.get(projectId) ?? defaults();
    const value: ScenarioAdmissionSettingsResponseDto = {
      ...current,
      mode: input.mode,
      maxStartsPerLocalDay: input.maxStartsPerLocalDay,
      maxStartsPerVisit: input.maxStartsPerVisit,
      minimumIntervalSeconds: input.minimumIntervalSeconds,
      projectVersion: current.projectVersion + 1,
      quietHours: clone(input.quietHours),
    };
    settingsByProject.set(projectId, value);
    return Promise.resolve(clone(value));
  },
  decisionsPage(): Promise<ScenarioAdmissionDecisionPageResponseDto> {
    const policySnapshot: ScenarioAdmissionDecisionResponseDtoPolicySnapshot = {
      ...defaults(),
    };
    return Promise.resolve({
      items: [
        {
          id: "decision-demo-started",
          eventLogId: "event_login_warning_42",
          scenarioId: "scenario-security-demo",
          scenarioCode: "unusual_login_warning",
          scenarioName: "Предупреждение о необычном входе",
          endUserExternalId: "player_10482",
          importanceClass: "SECURITY",
          numericPriority: 100,
          respectsQuietHours: false,
          frequencyExempt: true,
          outcome: "STARTED",
          reason: "ADMITTED",
          evaluatedAt: "2026-07-24T09:42:00.000Z",
          localDate: "2026-07-24",
          timezoneSnapshot: "Europe/Madrid",
          timezoneSource: "END_USER_PROFILE",
          visitIdSnapshot: "visit_8fd1",
          retryAt: null,
          scenarioRunId: "run_demo_security",
          winnerScenarioId: "scenario-security-demo",
          evidence: { competingScenarioCount: 3, securityBypassApplied: true },
          policySnapshot,
        },
        {
          id: "decision-demo-suppressed",
          eventLogId: "event_login_warning_42",
          scenarioId: "scenario-promo-demo",
          scenarioCode: "weekend_offer",
          scenarioName: "Предложение выходного дня",
          endUserExternalId: "player_10482",
          importanceClass: "PROMOTION",
          numericPriority: 20,
          respectsQuietHours: true,
          frequencyExempt: false,
          outcome: "SUPPRESSED",
          reason: "LOST_ARBITRATION",
          evaluatedAt: "2026-07-24T09:42:00.000Z",
          localDate: "2026-07-24",
          timezoneSnapshot: "Europe/Madrid",
          timezoneSource: "END_USER_PROFILE",
          visitIdSnapshot: "visit_8fd1",
          retryAt: null,
          scenarioRunId: null,
          winnerScenarioId: "scenario-security-demo",
          evidence: { winnerImportanceClass: "SECURITY", winnerPriority: 100 },
          policySnapshot,
        },
      ],
      nextCursor: null,
    });
  },
};
