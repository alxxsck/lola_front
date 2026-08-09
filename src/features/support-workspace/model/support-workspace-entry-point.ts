import type { SupportWorkspaceAdmissionResponseDto } from "@/shared/api/generated/models";
import type { LocationQuery, LocationQueryRaw } from "vue-router";

export type SupportWorkspaceTarget = "CASES" | "CONVERSATIONS";
export type LegacySupportEntryPoint = "CASES" | "USERS" | "LIVE";

const supportedSupportQueryKeys = new Set([
  "projectId",
  "entry",
  "mode",
  "panel",
  "view",
  "search",
  "scope",
  "status",
  "waiting",
  "assignment",
  "priority",
  "sla",
  "channel",
  "queue",
  "topic",
  "category",
  "language",
  "team",
  "assignee",
  "unread",
  "draft",
  "delivery",
  "from",
  "to",
  "sort",
  "direction",
  "caseId",
  "messageId",
  "endUserId",
  "externalEndUserId",
]);

export interface SupportRouteLocation {
  name: string;
  params?: Record<string, string>;
  query?: LocationQueryRaw;
  replace: true;
}

interface LegacyEntryIntent {
  entryPoint: LegacySupportEntryPoint;
  caseId?: string;
  endUserId?: string;
  conversationId?: string;
  query: LocationQuery;
}

interface SupportEntryIntent {
  target: SupportWorkspaceTarget;
  caseId?: string;
  conversationId?: string;
  query: LocationQuery;
}

export function isCanonicalSupportWorkspaceAdmission(
  admission: SupportWorkspaceAdmissionResponseDto | null | undefined,
  target: SupportWorkspaceTarget,
): boolean {
  if (
    admission?.rolloutState !== "ENABLED" ||
    admission.entryPointMode !== "CANONICAL_SUPPORT" ||
    admission.legacyAdapterMode !== "LAUNCHER_ONLY" ||
    admission.capabilities.supportWorkspaceShell !== "AVAILABLE"
  ) {
    return false;
  }
  return target === "CASES"
    ? admission.capabilities.cases === "AVAILABLE"
    : admission.capabilities.conversations === "AVAILABLE";
}

export function canonicalSupportLocation(
  intent: LegacyEntryIntent,
): SupportRouteLocation {
  const query = pickSupportedSupportQuery(intent.query);
  if (intent.entryPoint === "CASES") {
    const caseQuery = { ...query, mode: "cases" };
    return intent.caseId
      ? {
          name: "support-inbox-case",
          params: { caseId: intent.caseId },
          query: caseQuery,
          replace: true,
        }
      : {
          name: "support-inbox",
          query: caseQuery,
          replace: true,
        };
  }
  if (intent.conversationId) {
    return {
      name: "support-inbox-conversation",
      params: { conversationId: intent.conversationId },
      query,
      replace: true,
    };
  }
  return {
    name: "support-inbox",
    query: {
      ...query,
      ...(intent.endUserId
        ? {
            endUserId: intent.endUserId,
            entry: intent.entryPoint === "LIVE" ? "live" : "users",
          }
        : {}),
    },
    replace: true,
  };
}

export function legacySupportLocation(
  intent: SupportEntryIntent,
): SupportRouteLocation {
  const projectQuery = pickProjectQuery(intent.query);
  if (intent.target === "CASES") {
    return intent.caseId
      ? {
          name: "end-user-case-detail",
          params: { caseId: intent.caseId },
          query: projectQuery,
          replace: true,
        }
      : {
          name: "end-user-cases",
          query: projectQuery,
          replace: true,
        };
  }
  const endUserId = queryValue(intent.query.endUserId);
  const endUserEntry = queryValue(intent.query.entry);
  if (endUserId && endUserEntry === "live") {
    return {
      name: "live",
      query: { ...projectQuery, endUserId },
      replace: true,
    };
  }
  if (endUserId && endUserEntry === "users") {
    return {
      name: "users",
      params: { endUserId },
      query: projectQuery,
      replace: true,
    };
  }
  return {
    name: "users",
    query: {
      ...projectQuery,
      ...(intent.conversationId
        ? { conversationId: intent.conversationId }
        : {}),
    },
    replace: true,
  };
}

function pickSupportedSupportQuery(query: LocationQuery): LocationQueryRaw {
  return Object.fromEntries(
    Object.entries(query).filter(([key]) => supportedSupportQueryKeys.has(key)),
  );
}

function pickProjectQuery(
  query: LocationQuery,
): LocationQueryRaw {
  return typeof query.projectId === "string"
    ? { projectId: query.projectId }
    : {};
}

function queryValue(value: LocationQuery[string]): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
