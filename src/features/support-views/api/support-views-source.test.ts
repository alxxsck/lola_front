import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import {
  savedSupportViewCatalog,
  savedSupportViewCreate,
  savedSupportViewDefaultView,
  savedSupportViewPublish,
  supportViewPresetCatalog,
  supportViewPresetQuery,
} from "@/shared/api/generated/retenive-backend";
import { mockSupportViewsSource, supportViewsSource } from "./support-views-source";

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  savedSupportViewCatalog: vi.fn(), savedSupportViewCreate: vi.fn(), savedSupportViewDefaultView: vi.fn(),
  savedSupportViewPublish: vi.fn(), savedSupportViewArchive: vi.fn(), savedSupportViewReplace: vi.fn(),
  savedSupportViewQuery: vi.fn(), savedSupportViewReplaceDefaultView: vi.fn(), supportViewPresetCatalog: vi.fn(),
  supportViewPresetQuery: vi.fn(), supportViewPresetQueryAllCases: vi.fn(), supportViewPresetQueryAllConversations: vi.fn(), supportViewPresetQueryMyTeamUnassigned: vi.fn(),
}));

const freshness = { state: "READY" as const, lagSeconds: 0, indexedThrough: "2026-08-08T00:00:00Z", sourceWatermarks: {} };
const defaultView = { available: true, effectiveSelection: { kind: "SYSTEM" as const, presetCode: "MY_ACTIVE" as const }, selection: { kind: "SYSTEM" as const, presetCode: "MY_ACTIVE" as const }, etag: '"dv1"', version: 1 };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(supportViewPresetCatalog).mockResolvedValue({ freshness, items: [] }); vi.mocked(savedSupportViewDefaultView).mockResolvedValue(defaultView); });

describe("support views source", () => {
  it("does not request the Saved catalog without its dedicated authority", async () => {
    await supportViewsSource.catalog("project-1", false);
    expect(savedSupportViewCatalog).not.toHaveBeenCalled();
  });

  it("sends opaque ETag and stable idempotency headers", async () => {
    const view = { id: "view-1", etag: '"sv1"', permissions: { read: true, replaceDraft: true, publish: true, archive: true } } as never;
    vi.mocked(savedSupportViewPublish).mockResolvedValue({ view });
    await supportViewsSource.publish("project-1", view, "attempt-1");
    expect(savedSupportViewPublish).toHaveBeenCalledWith("project-1", "view-1", { headers: { "If-Match": '"sv1"', "Idempotency-Key": "attempt-1" } });
  });

  it("verifies the authoritative preset receipt", async () => {
    vi.mocked(supportViewPresetQuery).mockResolvedValue({ freshness, items: [], nextCursor: null, preset: { code: "MY_ACTIVE" } });
    await expect(supportViewsSource.query("project-1", { kind: "SYSTEM", code: "MY_ACTIVE" }, "", undefined)).resolves.toMatchObject({ authorityKey: "system:MY_ACTIVE" });
  });

  it("creates with an idempotency key", async () => {
    vi.mocked(savedSupportViewCreate).mockResolvedValue({ view: { id: "view-1" } as never });
    const command = { code: "mine", scope: "PERSONAL" as const, draft: { surface: "CASES" as const } as never };
    await supportViewsSource.create("project-1", command, "create-1");
    expect(savedSupportViewCreate).toHaveBeenCalledWith("project-1", command, { headers: { "Idempotency-Key": "create-1" } });
  });

  it("keeps mock saved views isolated by project", async () => {
    const command = reactive({ code: "project-a-only", scope: "PERSONAL" as const, draft: { surface: "CASES" as const, filters: { priorities: ["HIGH"] } } as never });
    await mockSupportViewsSource.create("isolation-project-a", command, "create-a");

    const projectA = await mockSupportViewsSource.catalog("isolation-project-a", true);
    const projectB = await mockSupportViewsSource.catalog("isolation-project-b", true);

    expect(projectA.saved.some((view) => view.code === command.code)).toBe(true);
    expect(projectB.saved.some((view) => view.code === command.code)).toBe(false);
  });
});
