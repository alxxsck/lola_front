import type { LocationQuery, LocationQueryRaw } from "vue-router";
import type { SupportSystemViewCode, SupportViewSelection } from "@/features/support-views/api/support-views-source";

const SYSTEM_CODES = new Set(["MY_ACTIVE", "MY_TEAM_UNASSIGNED", "ALL_CASES", "ALL_CONVERSATIONS"]);
export const supportViewRouteKeys = new Set(["view"]);

export function isCustomSupportViewRoute(query: LocationQuery): boolean {
  const raw = Array.isArray(query.view) ? query.view[0] : query.view;
  return raw === "custom";
}

export function shouldLoadCustomSupportView(query: LocationQuery, hasSearchCriteria: boolean): boolean {
  return isCustomSupportViewRoute(query) || (query.view == null && hasSearchCriteria);
}

export function readSupportViewSelection(query: LocationQuery): SupportViewSelection | null {
  const raw = Array.isArray(query.view) ? query.view[0] : query.view;
  if (!raw) return null;
  if (raw.startsWith("system:")) {
    const code = raw.slice(7);
    return SYSTEM_CODES.has(code)
      ? { kind: "SYSTEM", code: code as SupportSystemViewCode }
      : null;
  }
  if (raw.startsWith("saved:")) {
    const id = raw.slice(6);
    return /^[0-9a-f-]{36}$/i.test(id) ? { kind: "SAVED", id } : null;
  }
  return null;
}

export function writeSupportViewSelection(selection: SupportViewSelection | null): LocationQueryRaw {
  if (!selection) return { view: "custom" };
  return { view: selection.kind === "SYSTEM" ? `system:${selection.code}` : `saved:${selection.id}` };
}
