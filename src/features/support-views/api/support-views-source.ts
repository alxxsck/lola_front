import {
  savedSupportViewArchive,
  savedSupportViewCatalog,
  savedSupportViewCreate,
  savedSupportViewDefaultView,
  savedSupportViewPublish,
  savedSupportViewQuery,
  savedSupportViewReplace,
  savedSupportViewReplaceDefaultView,
  supportViewPresetCatalog,
  supportViewPresetQuery,
  supportViewPresetQueryAllCases,
  supportViewPresetQueryAllConversations,
  supportViewPresetQueryMyTeamUnassigned,
} from "@/shared/api/generated/retenive-backend";
import type {
  CreateSavedSupportViewDto,
  ReplaceSavedSupportViewDraftDto,
  ReplaceSupportDefaultViewDtoSelection,
  SavedSupportViewResponseDto,
  SupportDefaultViewResponseDto,
  SupportViewPresetResponseDto,
} from "@/shared/api/generated/models";
import {
  mapSupportSearchFreshness,
  mapSupportSearchResult,
  type SupportSearchFreshness,
  type SupportSearchResult,
} from "@/features/support-search/api/support-search-source";
import { dataMode } from "@/shared/config/data-mode";
import { ApiError } from "@/shared/api/http/api-error";

export type SupportSystemViewCode =
  | "MY_ACTIVE"
  | "MY_TEAM_UNASSIGNED"
  | "ALL_CASES"
  | "ALL_CONVERSATIONS";

export type SupportViewSelection =
  | { kind: "SYSTEM"; code: SupportSystemViewCode }
  | { kind: "SAVED"; id: string };

export interface SupportViewPage {
  items: SupportSearchResult[];
  nextCursor: string | null;
  freshness: SupportSearchFreshness;
  authorityKey: string;
}

export interface SupportViewsCatalog {
  system: SupportViewPresetResponseDto[];
  saved: SavedSupportViewResponseDto[];
  defaultView: SupportDefaultViewResponseDto;
}

export interface SupportViewsSource {
  catalog(projectId: string, includeSaved: boolean): Promise<SupportViewsCatalog>;
  query(projectId: string, selection: SupportViewSelection, phrase: string, cursor?: string): Promise<SupportViewPage>;
  create(projectId: string, draft: CreateSavedSupportViewDto, idempotencyKey: string): Promise<SavedSupportViewResponseDto>;
  replace(projectId: string, view: SavedSupportViewResponseDto, draft: ReplaceSavedSupportViewDraftDto, idempotencyKey: string): Promise<SavedSupportViewResponseDto>;
  publish(projectId: string, view: SavedSupportViewResponseDto, idempotencyKey: string): Promise<SavedSupportViewResponseDto>;
  archive(projectId: string, view: SavedSupportViewResponseDto, idempotencyKey: string): Promise<SavedSupportViewResponseDto>;
  setDefault(projectId: string, current: SupportDefaultViewResponseDto, selection: ReplaceSupportDefaultViewDtoSelection, idempotencyKey: string): Promise<SupportDefaultViewResponseDto>;
}

const headers = (etag: string | undefined, key: string) => ({
  headers: {
    ...(etag ? { "If-Match": etag } : {}),
    "Idempotency-Key": key,
  },
});

const apiSupportViewsSource: SupportViewsSource = {
  async catalog(projectId, includeSaved) {
    const [presets, saved, defaultView] = await Promise.all([
      supportViewPresetCatalog(projectId),
      includeSaved ? savedSupportViewCatalog(projectId) : Promise.resolve({ items: [] }),
      savedSupportViewDefaultView(projectId),
    ]);
    return {
      system: presets.items.filter((item) => item.permitted),
      saved: saved.items.filter((item) => item.lifecycle === "ACTIVE" && item.permissions.read),
      defaultView,
    };
  },
  async query(projectId, selection, phrase, cursor) {
    const body = { ...(phrase.trim().length >= 2 ? { phrase: phrase.trim() } : {}), ...(cursor ? { cursor } : {}), limit: 30 };
    const response = selection.kind === "SAVED"
      ? await savedSupportViewQuery(projectId, selection.id, body)
      : selection.code === "MY_ACTIVE"
        ? await supportViewPresetQuery(projectId, body)
        : selection.code === "MY_TEAM_UNASSIGNED"
          ? await supportViewPresetQueryMyTeamUnassigned(projectId, body)
          : selection.code === "ALL_CASES"
            ? await supportViewPresetQueryAllCases(projectId, body)
            : await supportViewPresetQueryAllConversations(projectId, body);
    const authorityKey = selection.kind === "SAVED"
      ? "savedView" in response && response.savedView.id === selection.id
        ? `${selection.id}:${response.savedView.revision.id}:${response.savedView.revision.revisionNumber}:${response.savedView.queueRevisionId ?? "none"}`
        : ""
      : "preset" in response && response.preset.code === selection.code
        ? `system:${selection.code}`
        : "";
    if (!authorityKey) throw new Error("Saved view authority receipt mismatch");
    return {
      items: response.items.flatMap((item) => mapSupportSearchResult(item) ?? []),
      nextCursor: response.nextCursor ?? null,
      freshness: mapSupportSearchFreshness(response.freshness),
      authorityKey,
    };
  },
  async create(projectId, draft, idempotencyKey) {
    return (await savedSupportViewCreate(projectId, draft, headers(undefined, idempotencyKey))).view;
  },
  async replace(projectId, view, draft, idempotencyKey) {
    return (await savedSupportViewReplace(projectId, view.id, draft, headers(view.etag, idempotencyKey))).view;
  },
  async publish(projectId, view, idempotencyKey) {
    return (await savedSupportViewPublish(projectId, view.id, headers(view.etag, idempotencyKey))).view;
  },
  async archive(projectId, view, idempotencyKey) {
    return (await savedSupportViewArchive(projectId, view.id, headers(view.etag, idempotencyKey))).view;
  },
  setDefault(projectId, current, selection, idempotencyKey) {
    return savedSupportViewReplaceDefaultView(
      projectId,
      { selection },
      headers(current.etag, idempotencyKey),
    );
  },
};

const demoFreshness = { state: "READY" as const, lagSeconds: 0, indexedThrough: "2026-08-08T00:00:00.000Z", sourceWatermarks: {} };
const demoSystem: SupportViewPresetResponseDto[] = [
  ["MY_ACTIVE", "CASES", 3], ["MY_TEAM_UNASSIGNED", "CASES", 8], ["ALL_CASES", "CASES", 24], ["ALL_CONVERSATIONS", "CONVERSATIONS", 31],
].map(([code, surface, value]) => ({ code, surface, scope: "SYSTEM", displayNameKey: String(code).toLowerCase(), permitted: true, count: { state: "EXACT", value, cappedAt: 100 }, freshness: demoFreshness })) as SupportViewPresetResponseDto[];
const initialDemoSaved: SavedSupportViewResponseDto[] = [{
  id: "11111111-1111-4111-8111-111111111111", code: "priority-payments", scope: "PERSONAL", lifecycle: "ACTIVE", version: 2, etag: '"sv2.demo"', ownerTeamId: null,
  draft: { schemaVersion: 1, surface: "CASES", displayName: "Приоритетные платежи", columns: ["PRIORITY", "SLA", "ACTIVITY_AT"], filters: { priorities: ["HIGH", "URGENT", "CRITICAL"] }, sort: { field: "PRIORITY", direction: "DESC" } },
  publishedRevision: { id: "22222222-2222-4222-8222-222222222222", revisionNumber: 1 }, permissions: { read: true, replaceDraft: true, publish: true, archive: true }, count: { state: "LOWER_BOUND", value: 12, cappedAt: 100 }, freshness: demoFreshness,
}];
const initialDemoDefault: SupportDefaultViewResponseDto = { available: true, selection: { kind: "SYSTEM", presetCode: "MY_ACTIVE" }, effectiveSelection: { kind: "SYSTEM", presetCode: "MY_ACTIVE" }, unavailableReason: null, version: 1, etag: '"dv1.demo"' };
const demoStates = new Map<string, { saved: SavedSupportViewResponseDto[]; defaultView: SupportDefaultViewResponseDto }>();
const cloneDemo = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value;
function demoState(projectId: string) {
  const authorityKey = `${projectId}:cms_1`;
  const current = demoStates.get(authorityKey);
  if (current) return current;
  const created = { saved: cloneDemo(initialDemoSaved), defaultView: cloneDemo(initialDemoDefault) };
  demoStates.set(authorityKey, created);
  return created;
}

export const mockSupportViewsSource: SupportViewsSource = {
  async catalog(projectId, includeSaved) { const state = demoState(projectId); return { system: cloneDemo(demoSystem), saved: includeSaved ? cloneDemo(state.saved) : [], defaultView: cloneDemo(state.defaultView) }; },
  async query(projectId, selection) {
    if (selection.kind === "SAVED" && !demoState(projectId).saved.some((item) => item.id === selection.id))
      throw new ApiError(404, "Saved view unavailable");
    const conversation = selection.kind === "SYSTEM" && selection.code === "ALL_CONVERSATIONS";
    return { items: [{ id: conversation ? "conversation-demo" : "case-demo", kind: conversation ? "CONVERSATION" : "CASE", selection: { kind: conversation ? "CONVERSATION" : "CASE", id: conversation ? "conversation-demo" : "case-demo" }, snippet: conversation ? "Диалог о проверке платежа" : "Проверка приоритетного платежа", activityAt: "2026-08-08T00:00:00.000Z", matchProvenance: "NONE" }], nextCursor: null, freshness: demoFreshness, authorityKey: selection.kind === "SYSTEM" ? `system:${selection.code}` : `saved:${selection.id}:demo` };
  },
  async create(projectId, command) {
    const state = demoState(projectId);
    const view = { ...initialDemoSaved[0]!, id: crypto.randomUUID(), code: command.code, scope: command.scope, ownerTeamId: command.teamId ?? null, draft: command.draft, version: 1, etag: '"sv1.demo"', publishedRevision: null } as SavedSupportViewResponseDto;
    state.saved = [...state.saved, cloneDemo(view)]; return cloneDemo(view);
  },
  async replace(projectId, view, command) { const state = demoState(projectId); const updated = { ...view, draft: cloneDemo(command.draft), version: view.version + 1, etag: `"sv${view.version + 1}.demo"` }; state.saved = state.saved.map((item) => item.id === view.id ? updated : item); return cloneDemo(updated); },
  async publish(projectId, view) { const state = demoState(projectId); const updated = { ...view, publishedRevision: { id: crypto.randomUUID(), revisionNumber: (view.publishedRevision?.revisionNumber ?? 0) + 1 }, version: view.version + 1, etag: `"sv${view.version + 1}.demo"` }; state.saved = state.saved.map((item) => item.id === view.id ? updated : item); return cloneDemo(updated); },
  async archive(projectId, view) { const state = demoState(projectId); const updated = { ...view, lifecycle: "ARCHIVED" as const, version: view.version + 1 }; state.saved = state.saved.filter((item) => item.id !== view.id); return cloneDemo(updated); },
  async setDefault(projectId, current, selection) { const state = demoState(projectId); state.defaultView = { ...current, selection, effectiveSelection: selection, available: true, unavailableReason: null, version: current.version + 1, etag: `"dv${current.version + 1}.demo"` }; return cloneDemo(state.defaultView); },
};

export const supportViewsSource = dataMode === "mock" ? mockSupportViewsSource : apiSupportViewsSource;
