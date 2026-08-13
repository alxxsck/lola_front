export const SCENARIO_ACTION_OUTLINE_WIDTH = 240;
export const SCENARIO_ACTION_CANVAS_MIN_WIDTH = 300;
export const SCENARIO_ACTION_INSPECTOR_MIN_WIDTH = 320;
export const SCENARIO_ACTION_INSPECTOR_MAX_WIDTH = 520;
export const SCENARIO_ACTION_COMPACT_MAX_WIDTH = 860;

export function scenarioActionInspectorMaxWidth(workspaceWidth: number) {
  const available = Math.floor(
    workspaceWidth - SCENARIO_ACTION_OUTLINE_WIDTH - SCENARIO_ACTION_CANVAS_MIN_WIDTH,
  );
  return Math.min(
    SCENARIO_ACTION_INSPECTOR_MAX_WIDTH,
    Math.max(SCENARIO_ACTION_INSPECTOR_MIN_WIDTH, available),
  );
}

export function clampScenarioActionInspectorWidth(
  width: number,
  minWidth = SCENARIO_ACTION_INSPECTOR_MIN_WIDTH,
  maxWidth = SCENARIO_ACTION_INSPECTOR_MAX_WIDTH,
) {
  return Math.min(maxWidth, Math.max(minWidth, Math.round(width)));
}
