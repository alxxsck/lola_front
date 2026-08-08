import type { CreateSavedSupportViewDto, ReplaceSavedSupportViewDraftDto } from "@/shared/api/generated/models";
import type { SupportSearchRouteState } from "@/features/support-search/model/support-search-route";

const CASE_COLUMNS = ["STATUS", "WAITING_SIDE", "PRIORITY", "ASSIGNEE", "SLA", "ACTIVITY_AT", "UNREAD", "DELIVERY"] as const;
const CONTENT_COLUMNS = ["ACTIVITY_AT", "LANGUAGE", "CHANNEL"] as const;

export function buildSavedViewDraft(name: string, state: SupportSearchRouteState) {
  const displayName = name.trim();
  if (displayName.length < 2 || displayName.length > 120 || state.scope === "END_USERS") return null;
  if (state.scope === "CASES") {
    const filters = { ...state.filters };
    delete filters.externalEndUserIds;
    delete filters.conversationIds;
    delete filters.messageIds;
    return { schemaVersion: 1 as const, surface: "CASES" as const, displayName, columns: [...CASE_COLUMNS], filters, sort: state.sort };
  }
  if (state.scope === "CONVERSATIONS") {
    const { conversationIds, endUserIds, timeRange } = state.filters;
    return { schemaVersion: 1 as const, surface: "CONVERSATIONS" as const, displayName, columns: [...CONTENT_COLUMNS], filters: { ...(conversationIds ? { conversationIds } : {}), ...(endUserIds ? { endUserIds } : {}), ...(timeRange ? { timeRange } : {}) }, sort: { field: state.sort.field === "ACTIVITY_AT" ? "ACTIVITY_AT" as const : "RELEVANCE" as const, direction: state.sort.direction } };
  }
  const { caseIds, conversationIds, messageIds, endUserIds, languages, timeRange } = state.filters;
  return { schemaVersion: 1 as const, surface: "MESSAGES" as const, displayName, columns: [...CONTENT_COLUMNS], filters: { ...(caseIds ? { caseIds } : {}), ...(conversationIds ? { conversationIds } : {}), ...(messageIds ? { messageIds } : {}), ...(endUserIds ? { endUserIds } : {}), ...(languages ? { languages } : {}), ...(timeRange ? { timeRange } : {}) }, sort: { field: state.sort.field === "ACTIVITY_AT" ? "ACTIVITY_AT" as const : "RELEVANCE" as const, direction: state.sort.direction } };
}

export function createSavedViewCommand(name: string, code: string, scope: "PERSONAL" | "TEAM" | "PROJECT", teamId: string, state: SupportSearchRouteState): CreateSavedSupportViewDto | null {
  const draft = buildSavedViewDraft(name, state);
  const normalizedCode = code.trim().toLowerCase();
  if (!draft || !/^[a-z][a-z0-9-]{1,63}$/.test(normalizedCode) || (scope === "TEAM" && !teamId.trim())) return null;
  return { code: normalizedCode, scope, ...(scope === "TEAM" ? { teamId: teamId.trim() } : {}), draft };
}

export function replaceSavedViewCommand(name: string, state: SupportSearchRouteState): ReplaceSavedSupportViewDraftDto | null {
  const draft = buildSavedViewDraft(name, state);
  return draft ? { draft } : null;
}
