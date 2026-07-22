import type {
  ActionTypeResponseDto,
  AiCapabilityPreviewResponseDto,
  ConfigureProjectActionDto,
  ProjectActionResponseDto,
} from "@/shared/api/generated/models";
import { hasProjectPermission } from "@/features/auth/permission-access";

export type ActionTypeCatalogItem = ActionTypeResponseDto;
export type ProjectAction = ProjectActionResponseDto;
export type ConfigureProjectActionInput = ConfigureProjectActionDto;

export interface AiCapabilityPreview extends Omit<
  AiCapabilityPreviewResponseDto,
  "tool"
> {
  tool: NonNullable<AiCapabilityPreviewResponseDto["tool"]> | null;
}

export interface ProjectActionDraft {
  scenarioEnabled: boolean;
  aiEnabled: boolean;
  aiUsageDescription: string;
  configuration: Record<string, unknown>;
  auditReason: string;
}

export type ProjectActionIssueField =
  | "form"
  | "scenarioEnabled"
  | "aiEnabled"
  | "aiUsageDescription"
  | "configuration"
  | "auditReason";

export interface ProjectActionDraftIssue {
  field: ProjectActionIssueField;
  code: string;
  message: string;
}

export function canConfigureProjectActions(
  effectivePermissionCodes: readonly string[],
): boolean {
  return hasProjectPermission(
    effectivePermissionCodes,
    "project.actions.manage",
  );
}

export function canManageProjectActionAiExposure(
  effectivePermissionCodes: readonly string[],
): boolean {
  return hasProjectPermission(
    effectivePermissionCodes,
    "project.actions.manage_ai_exposure",
  );
}

export function createProjectActionDraft(
  action: ProjectAction,
): ProjectActionDraft {
  return {
    scenarioEnabled: action.scenarioEnabled,
    aiEnabled: action.aiEnabled,
    aiUsageDescription: action.aiUsageDescription ?? "",
    configuration: cloneConfiguration(action.configuration),
    auditReason: "",
  };
}

export function toConfigureProjectActionInput(
  draft: ProjectActionDraft,
): ConfigureProjectActionInput {
  const description = draft.aiUsageDescription.trim();
  const auditReason = draft.auditReason.trim();
  return {
    scenarioEnabled: draft.scenarioEnabled,
    aiEnabled: draft.aiEnabled,
    aiUsageDescription: description || null,
    configuration: cloneConfiguration(draft.configuration),
    ...(auditReason ? { auditReason } : {}),
  };
}

export function validateProjectActionDraft(
  action: ProjectAction,
  draft: ProjectActionDraft,
  effectivePermissionCodes: readonly string[],
): ProjectActionDraftIssue[] {
  if (
    !canConfigureProjectActions(effectivePermissionCodes) &&
    projectActionDraftChanged(action, draft)
  ) {
    return [
      {
        field: "form",
        code: "PROJECT_ACTION_MANAGE_PERMISSION_REQUIRED",
        message:
          "Для изменения и архивирования действий требуется разрешение управления действиями.",
      },
    ];
  }

  if (
    !canManageProjectActionAiExposure(effectivePermissionCodes) &&
    aiExposureChanged(action, draft)
  ) {
    return [
      {
        field: "form",
        code: "PROJECT_ACTION_AI_EXPOSURE_PERMISSION_REQUIRED",
        message:
          "Для изменения доступа Lola к действию требуется отдельное разрешение.",
      },
    ];
  }

  const issues: ProjectActionDraftIssue[] = [];
  const surfaces = new Set(action.actionTypeRevision.supportedSurfaces);

  if (draft.scenarioEnabled && !surfaces.has("SCENARIO")) {
    issues.push({
      field: "scenarioEnabled",
      code: "ACTION_SURFACE_UNSUPPORTED",
      message: "Этот тип действия нельзя использовать в сценариях.",
    });
  }
  if (draft.aiEnabled && !surfaces.has("AI")) {
    issues.push({
      field: "aiEnabled",
      code: "ACTION_SURFACE_UNSUPPORTED",
      message: "Lola не может самостоятельно выбирать это действие.",
    });
  }
  if (draft.aiEnabled && surfaces.has("AI")) {
    const descriptionLength = draft.aiUsageDescription.trim().length;
    if (descriptionLength < 20 || descriptionLength > 2000) {
      issues.push({
        field: "aiUsageDescription",
        code: "AI_ACTION_DESCRIPTION_INVALID",
        message: "Подсказка для Lola должна содержать от 20 до 2000 символов.",
      });
    }
  }
  if (requiresAiAuditReason(action, draft) && surfaces.has("AI")) {
    const auditReasonLength = draft.auditReason.trim().length;
    if (auditReasonLength < 10 || auditReasonLength > 500) {
      issues.push({
        field: "auditReason",
        code: "AI_ACTION_AUDIT_REASON_REQUIRED",
        message:
          "Объясните причину включения доступа для Lola: от 10 до 500 символов.",
      });
    }
  }

  return issues;
}

export function requiresAiAuditReason(
  action: ProjectAction,
  draft: ProjectActionDraft,
): boolean {
  return (
    (!action.aiEnabled && draft.aiEnabled) ||
    (action.aiEnabled &&
      draft.aiEnabled &&
      configurationBroadensAuthority(action.configuration, draft.configuration))
  );
}

function configurationBroadensAuthority(
  before: unknown,
  after: unknown,
): boolean {
  if (Array.isArray(before) && Array.isArray(after)) {
    const existing = new Set(before.map(stableValue));
    return after.some((item) => !existing.has(stableValue(item)));
  }
  if (isRecord(before) && isRecord(after)) {
    return Object.entries(after).some(
      ([key, value]) =>
        !(key in before) || configurationBroadensAuthority(before[key], value),
    );
  }
  return stableValue(before) !== stableValue(after);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${key}:${stableValue(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

function projectActionDraftChanged(
  action: ProjectAction,
  draft: ProjectActionDraft,
): boolean {
  return (
    action.scenarioEnabled !== draft.scenarioEnabled ||
    action.aiEnabled !== draft.aiEnabled ||
    (action.aiUsageDescription ?? "") !== draft.aiUsageDescription ||
    JSON.stringify(action.configuration) !== JSON.stringify(draft.configuration)
  );
}

function aiExposureChanged(
  action: ProjectAction,
  draft: ProjectActionDraft,
): boolean {
  return (
    action.aiEnabled !== draft.aiEnabled ||
    (action.aiUsageDescription ?? "") !== draft.aiUsageDescription.trim() ||
    requiresAiAuditReason(action, draft)
  );
}

function cloneConfiguration(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
